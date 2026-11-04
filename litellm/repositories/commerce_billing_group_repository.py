import json
import uuid
from datetime import datetime
from typing import Final

from pydantic import TypeAdapter, ValidationError

from litellm.models.commerce_auth import AuthError, FrozenModel
from litellm.models.commerce_billing_groups import (
    BillingGroupAssignment,
    BillingGroupBatchAssignment,
    BillingGroupMember,
    BillingGroupMembers,
    BillingGroups,
    BillingGroupsRecord,
    BillingGroupsUpdate,
    BillingGroupsView,
    BillingMemberTarget,
    PricingSnapshot,
    PricingUserGroup,
    pricing_snapshot,
)
from litellm.repositories.commerce_auth_repository import AccountDatabase
from litellm.repositories.commerce_user_group_repository import group_lock, record_configuration, sync_user_groups

_CONFIG_SELECT: Final = """SELECT revision,payload,updated_by,created_at,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',access_group_id,'name',access_group_name,
    'models',access_model_names) ORDER BY (access_group_id='default') DESC,access_group_id),'[]'::jsonb)::text
    FROM "LiteLLM_AccessGroupTable") AS registry FROM "CommerceBillingConfiguration"
    ORDER BY revision DESC LIMIT 1"""
_MEMBER_SELECT: Final = """SELECT user_id,email_normalized AS email,enabled,billing_group_id AS group_id,
    billing_group_version AS version FROM "CommerceCustomer" """


class StoredBillingMember(FrozenModel):
    user_id: str
    email: str | None
    enabled: bool
    group_id: str
    version: int


def member_view(member: StoredBillingMember, policy: BillingGroups) -> BillingGroupMember:
    group: Final = next((group for group in policy.user_groups if group.id == member.group_id), None)
    return BillingGroupMember(
        user_id=member.user_id,
        email=member.email,
        enabled=member.enabled,
        group_id=member.group_id,
        group_name=group.name if group else "未知分组",
        version=member.version,
    )


def configuration_view(record: BillingGroupsRecord, policy: BillingGroups) -> BillingGroupsView:
    return BillingGroupsView(
        group_source=policy.group_source,
        user_groups=policy.user_groups,
        model_groups=policy.model_groups,
        rules=policy.rules,
        revision=record.revision,
        updated_by=record.updated_by,
        updated_at=record.created_at,
    )


async def config_lock(database: AccountDatabase) -> None:
    await group_lock(database)


def group_allows_model(policy: BillingGroups, group_id: str, model: str) -> bool:
    if policy.group_source != "access_groups":
        return True
    group: Final = next((group for group in policy.user_groups if group.id == group_id), None)
    if group is None or not group.models:
        return False
    from litellm.proxy.auth.auth_checks import check_model_access_helper
    from litellm.proxy.proxy_server import llm_router

    return check_model_access_helper(model=model, llm_router=llm_router, models=list(group.models))


async def write_membership(
    database: AccountDatabase,
    member: StoredBillingMember,
    body: BillingGroupBatchAssignment,
    actor: str,
    now: datetime,
    revision: int,
    batch_id: str,
) -> None:
    await database.execute_raw(
        """UPDATE "CommerceCustomer" SET billing_group_id=$2,billing_group_version=billing_group_version+1
        WHERE user_id=$1""",
        member.user_id,
        body.group_id,
    )
    await database.execute_raw(
        """INSERT INTO "CommerceAuditEvent" (id,actor_id,action,target_id,reason,created_at,details)
        VALUES ($1,$2,'billing_group_assign',$3,$4,$5::timestamptz,$6::jsonb)""",
        uuid.uuid4().hex,
        actor,
        member.user_id,
        body.reason.strip(),
        now,
        json.dumps(
            {
                "previous_group_id": member.group_id,
                "group_id": body.group_id,
                "previous_version": member.version,
                "version": member.version + 1,
                "configuration_revision": revision,
                "batch_id": batch_id,
            }
        ),
    )


class BillingGroupRepository:
    def __init__(self, database: AccountDatabase) -> None:
        self.database = database

    async def state(self) -> tuple[BillingGroupsRecord, BillingGroups] | AuthError:
        rows: Final = await self.database.query_raw(_CONFIG_SELECT)
        if not rows:
            return AuthError("billing_groups_unavailable", 503)
        try:
            record: Final = BillingGroupsRecord.model_validate(rows[0])
            stored: Final = BillingGroups.model_validate_json(record.payload)
            groups: Final = (
                TypeAdapter(tuple[PricingUserGroup, ...]).validate_json(record.registry)
                if stored.group_source == "access_groups"
                else stored.user_groups
            )
            policy: Final = BillingGroups(
                group_source=stored.group_source,
                user_groups=groups,
                model_groups=stored.model_groups,
                rules=stored.rules,
            )
        except ValidationError:
            return AuthError("billing_groups_unavailable", 503)
        return record, policy

    async def read(self) -> BillingGroupsView | AuthError:
        state: Final = await self.state()
        return state if isinstance(state, AuthError) else configuration_view(*state)

    async def save(self, body: BillingGroupsUpdate, actor: str, now: datetime) -> BillingGroupsView | AuthError:
        async with self.database.tx() as tx:
            await config_lock(tx)
            current: Final = await BillingGroupRepository(tx).state()
            if isinstance(current, AuthError):
                return current
            record, policy = current
            if record.revision != body.revision:
                return AuthError("billing_config_conflict", 409)
            wanted: Final = frozenset(group.id for group in body.user_groups)
            removed: Final = tuple(group.id for group in policy.user_groups if group.id not in wanted)
            if removed:
                used: Final = await tx.query_raw(
                    'SELECT user_id FROM "CommerceCustomer" WHERE billing_group_id=ANY($1::text[]) LIMIT 1',
                    list(removed),
                )
                if used:
                    return AuthError("billing_group_in_use", 409)
            groups: Final = (
                await sync_user_groups(tx, policy.user_groups, body.user_groups, actor, now)
                if policy.group_source == "access_groups"
                else body.user_groups
            )
            if isinstance(groups, AuthError):
                return groups
            changed: Final = BillingGroups(
                group_source=policy.group_source, user_groups=groups, model_groups=body.model_groups, rules=body.rules
            )
            saved: Final = await record_configuration(tx, changed, record.revision + 1, actor, now, body.reason)
            return configuration_view(saved, changed)

    async def member(self, user_id: str) -> BillingGroupMember | AuthError:
        state: Final = await self.state()
        if isinstance(state, AuthError):
            return state
        rows: Final = await self.database.query_raw(_MEMBER_SELECT + " WHERE user_id=$1", user_id)
        if not rows:
            return AuthError("account_not_found", 404)
        return member_view(StoredBillingMember.model_validate(rows[0]), state[1])

    async def members(
        self, search: str, group_id: str | None, limit: int, offset: int
    ) -> BillingGroupMembers | AuthError:
        state: Final = await self.state()
        if isinstance(state, AuthError):
            return state
        rows: Final = await self.database.query_raw(
            _MEMBER_SELECT
            + """ WHERE ($1='' OR strpos(lower(COALESCE(email_normalized,'')),lower($1))>0
            OR strpos(lower(user_id),lower($1))>0) AND ($2::text IS NULL OR billing_group_id=$2)
            ORDER BY created_at DESC,user_id DESC LIMIT $3 OFFSET $4""",
            search,
            group_id,
            limit + 1,
            offset,
        )
        return BillingGroupMembers(
            items=tuple(member_view(StoredBillingMember.model_validate(row), state[1]) for row in rows[:limit]),
            has_more=len(rows) > limit,
        )

    async def assign(
        self, user_id: str, body: BillingGroupAssignment, actor: str, now: datetime
    ) -> BillingGroupMember | AuthError:
        if not user_id.strip() or len(user_id) > 256:
            return AuthError("invalid_request", 422)
        result: Final = await self.assign_batch(
            BillingGroupBatchAssignment(
                group_id=body.group_id,
                reason=body.reason,
                members=(BillingMemberTarget(user_id=user_id, expected_version=body.expected_version),),
            ),
            actor,
            now,
        )
        return result if isinstance(result, AuthError) else result.items[0]

    async def lookup(self, user_ids: tuple[str, ...]) -> BillingGroupMembers | AuthError:
        state: Final = await self.state()
        if isinstance(state, AuthError):
            return state
        rows: Final = await self.database.query_raw(
            _MEMBER_SELECT + " WHERE user_id=ANY($1::text[]) ORDER BY user_id", list(user_ids)
        )
        return BillingGroupMembers(
            items=tuple(member_view(StoredBillingMember.model_validate(row), state[1]) for row in rows), has_more=False
        )

    async def assign_batch(
        self, body: BillingGroupBatchAssignment, actor: str, now: datetime
    ) -> BillingGroupMembers | AuthError:
        async with self.database.tx() as tx:
            await config_lock(tx)
            state: Final = await BillingGroupRepository(tx).state()
            if isinstance(state, AuthError):
                return state
            if body.group_id not in frozenset(group.id for group in state[1].user_groups):
                return AuthError("billing_group_not_found", 422)
            ids: Final = tuple(member.user_id for member in body.members)
            rows: Final = await tx.query_raw(
                _MEMBER_SELECT + " WHERE user_id=ANY($1::text[]) ORDER BY user_id FOR UPDATE", list(ids)
            )
            if len(rows) != len(ids):
                return AuthError("account_not_found", 404)
            members: Final = TypeAdapter(tuple[StoredBillingMember, ...]).validate_python(rows)
            if any(
                member.version
                != next(target.expected_version for target in body.members if target.user_id == member.user_id)
                for member in members
            ):
                return AuthError("billing_membership_conflict", 409)
            batch_id: Final = uuid.uuid4().hex
            for member in members:
                await write_membership(tx, member, body, actor, now, state[0].revision, batch_id)
            return BillingGroupMembers(
                items=tuple(
                    member_view(
                        member.model_copy(update={"group_id": body.group_id, "version": member.version + 1}), state[1]
                    )
                    for member in members
                ),
                has_more=False,
            )

    async def snapshot(self, user_id: str, model: str) -> PricingSnapshot | AuthError:
        state: Final = await self.state()
        if isinstance(state, AuthError):
            return state
        rows: Final = await self.database.query_raw(_MEMBER_SELECT + " WHERE user_id=$1", user_id)
        if not rows:
            return AuthError("account_not_found", 404)
        member: Final = StoredBillingMember.model_validate(rows[0])
        if not group_allows_model(state[1], member.group_id, model):
            return AuthError("model_access_required", 403)
        return pricing_snapshot(state[1], member.group_id, model, state[0].revision, member.version)

    async def allowed_models(self, user_id: str, models: tuple[str, ...]) -> tuple[str, ...] | AuthError:
        state: Final = await self.state()
        if isinstance(state, AuthError):
            return state
        rows: Final = await self.database.query_raw(_MEMBER_SELECT + " WHERE user_id=$1", user_id)
        if not rows:
            return AuthError("account_not_found", 404)
        member: Final = StoredBillingMember.model_validate(rows[0])
        if member.group_id not in frozenset(group.id for group in state[1].user_groups):
            return AuthError("billing_groups_unavailable", 503)
        return tuple(
            model
            for model in models
            if group_allows_model(state[1], member.group_id, model)
            and not isinstance(
                pricing_snapshot(state[1], member.group_id, model, state[0].revision, member.version), AuthError
            )
        )

    async def model_grants(self, user_id: str) -> tuple[str, ...] | AuthError | None:
        rows: Final = await self.database.query_raw(_MEMBER_SELECT + " WHERE user_id=$1", user_id)
        if not rows:
            return None
        state: Final = await self.state()
        if isinstance(state, AuthError):
            return state
        if state[1].group_source != "access_groups":
            return None
        member: Final = StoredBillingMember.model_validate(rows[0])
        group: Final = next((group for group in state[1].user_groups if group.id == member.group_id), None)
        return group.models or () if group else AuthError("billing_groups_unavailable", 503)
