import json
import uuid
from datetime import datetime
from typing import Final

from pydantic import ValidationError

from litellm.models.commerce_auth import AuthError, FrozenModel
from litellm.models.commerce_billing_groups import (
    BillingGroupAssignment,
    BillingGroupMember,
    BillingGroupMembers,
    BillingGroups,
    BillingGroupsRecord,
    BillingGroupsUpdate,
    BillingGroupsView,
    PricingSnapshot,
    pricing_snapshot,
)
from litellm.repositories.commerce_auth_repository import AccountDatabase

_CONFIG_SELECT: Final = """SELECT revision,payload,updated_by,created_at FROM "CommerceBillingConfiguration"
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
        user_groups=policy.user_groups,
        model_groups=policy.model_groups,
        rules=policy.rules,
        revision=record.revision,
        updated_by=record.updated_by,
        updated_at=record.created_at,
    )


async def config_lock(database: AccountDatabase) -> None:
    await database.query_raw("SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text", "cocaapi-billing-groups")


class BillingGroupRepository:
    def __init__(self, database: AccountDatabase) -> None:
        self.database = database

    async def state(self) -> tuple[BillingGroupsRecord, BillingGroups] | AuthError:
        rows: Final = await self.database.query_raw(_CONFIG_SELECT)
        if not rows:
            return AuthError("billing_groups_unavailable", 503)
        try:
            record: Final = BillingGroupsRecord.model_validate(rows[0])
            return record, BillingGroups.model_validate_json(record.payload)
        except ValidationError:
            return AuthError("billing_groups_unavailable", 503)

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
            changed: Final = body.policy()
            inserted: Final = await tx.query_raw(
                """INSERT INTO "CommerceBillingConfiguration" (revision,payload,updated_by,created_at)
                VALUES ($1,$2,$3,$4::timestamptz) RETURNING revision,payload,updated_by,created_at""",
                record.revision + 1,
                changed.model_dump_json(),
                actor,
                now,
            )
            await tx.execute_raw(
                """INSERT INTO "CommerceAuditEvent" (id,actor_id,action,target_id,reason,created_at)
                VALUES ($1,$2,'billing_groups_update',$3,$4,$5::timestamptz)""",
                uuid.uuid4().hex,
                actor,
                str(record.revision + 1),
                body.reason.strip(),
                now,
            )
            return configuration_view(BillingGroupsRecord.model_validate(inserted[0]), changed)

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
        async with self.database.tx() as tx:
            await config_lock(tx)
            state: Final = await BillingGroupRepository(tx).state()
            if isinstance(state, AuthError):
                return state
            if body.group_id not in frozenset(group.id for group in state[1].user_groups):
                return AuthError("billing_group_not_found", 422)
            rows: Final = await tx.query_raw(_MEMBER_SELECT + " WHERE user_id=$1 FOR UPDATE", user_id)
            if not rows:
                return AuthError("account_not_found", 404)
            member: Final = StoredBillingMember.model_validate(rows[0])
            if member.version != body.expected_version:
                return AuthError("billing_membership_conflict", 409)
            await tx.execute_raw(
                """UPDATE "CommerceCustomer" SET billing_group_id=$2,billing_group_version=billing_group_version+1
                WHERE user_id=$1""",
                user_id,
                body.group_id,
            )
            await tx.execute_raw(
                """INSERT INTO "CommerceAuditEvent" (id,actor_id,action,target_id,reason,created_at,details)
                VALUES ($1,$2,'billing_group_assign',$3,$4,$5::timestamptz,$6::jsonb)""",
                uuid.uuid4().hex,
                actor,
                user_id,
                body.reason.strip(),
                now,
                json.dumps(
                    {
                        "previous_group_id": member.group_id,
                        "group_id": body.group_id,
                        "previous_version": member.version,
                        "version": member.version + 1,
                        "configuration_revision": state[0].revision,
                    }
                ),
            )
            return member_view(
                member.model_copy(update={"group_id": body.group_id, "version": member.version + 1}), state[1]
            )

    async def snapshot(self, user_id: str, model: str) -> PricingSnapshot | AuthError:
        state: Final = await self.state()
        if isinstance(state, AuthError):
            return state
        rows: Final = await self.database.query_raw(_MEMBER_SELECT + " WHERE user_id=$1", user_id)
        if not rows:
            return AuthError("account_not_found", 404)
        member: Final = StoredBillingMember.model_validate(rows[0])
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
            if not isinstance(
                pricing_snapshot(state[1], member.group_id, model, state[0].revision, member.version), AuthError
            )
        )
