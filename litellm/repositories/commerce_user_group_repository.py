import uuid
from datetime import datetime
from typing import Final

from pydantic import TypeAdapter, ValidationError

from litellm.models.commerce_auth import AuthError, FrozenModel
from litellm.models.commerce_billing_groups import BillingGroups, BillingGroupsRecord, PricingUserGroup
from litellm.repositories.commerce_auth_repository import AccountDatabase

REGISTRY_SELECT: Final = """SELECT access_group_id AS id,access_group_name AS name,access_model_names AS models
    FROM "LiteLLM_AccessGroupTable" ORDER BY (access_group_id='default') DESC,access_group_id"""


class GroupChange(FrozenModel):
    revision: int
    policy: BillingGroups


async def group_lock(database: AccountDatabase) -> None:
    await database.query_raw("SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text", "cocaapi-billing-groups")


async def registry_groups(database: AccountDatabase) -> tuple[PricingUserGroup, ...]:
    rows: Final = await database.query_raw(REGISTRY_SELECT)
    return TypeAdapter(tuple[PricingUserGroup, ...]).validate_python(rows)


async def record_configuration(
    database: AccountDatabase, policy: BillingGroups, revision: int, actor: str, now: datetime, reason: str
) -> BillingGroupsRecord:
    inserted: Final = await database.query_raw(
        """INSERT INTO "CommerceBillingConfiguration" (revision,payload,updated_by,created_at)
        VALUES ($1,$2,$3,$4::timestamptz) RETURNING revision,payload,updated_by,created_at""",
        revision,
        policy.model_dump_json(),
        actor,
        now,
    )
    await database.execute_raw(
        """INSERT INTO "CommerceAuditEvent" (id,actor_id,action,target_id,reason,created_at)
        VALUES ($1,$2,'billing_groups_update',$3,$4,$5::timestamptz)""",
        uuid.uuid4().hex,
        actor,
        str(revision),
        reason.strip(),
        now,
    )
    return BillingGroupsRecord.model_validate(inserted[0])


async def begin_group_change(database: AccountDatabase, *, enabled: bool = True) -> GroupChange | AuthError | None:
    if not enabled:
        return None
    await group_lock(database)
    rows: Final = await database.query_raw(
        'SELECT revision,payload,updated_by,created_at FROM "CommerceBillingConfiguration" ORDER BY revision DESC LIMIT 1'
    )
    if not rows:
        return None
    try:
        record: Final = BillingGroupsRecord.model_validate(rows[0])
        policy: Final = BillingGroups.model_validate_json(record.payload)
    except ValidationError:
        return AuthError("billing_groups_unavailable", 503)
    return GroupChange(revision=record.revision, policy=policy) if policy.group_source == "access_groups" else None


async def finish_group_change(
    database: AccountDatabase, change: GroupChange | None, actor: str, now: datetime
) -> AuthError | None:
    if change is None:
        return None
    try:
        groups: Final = await registry_groups(database)
        policy: Final = BillingGroups(
            group_source="access_groups",
            user_groups=groups,
            model_groups=change.policy.model_groups,
            rules=change.policy.rules,
        )
    except ValidationError:
        return AuthError("invalid_user_group_configuration", 422)
    await record_configuration(database, policy, change.revision + 1, actor, now, "更新统一用户组权限")
    return None


async def group_deletion_error(
    database: AccountDatabase, change: GroupChange | None, group_id: str
) -> AuthError | None:
    if change is None:
        return None
    if group_id == "default" or any(rule.user_group_id == group_id for rule in change.policy.rules):
        return AuthError("billing_group_in_use", 409)
    rows: Final = await database.query_raw(
        'SELECT user_id FROM "CommerceCustomer" WHERE billing_group_id=$1 LIMIT 1',
        group_id,
    )
    return AuthError("billing_group_in_use", 409) if rows else None


async def sync_user_groups(
    database: AccountDatabase,
    previous: tuple[PricingUserGroup, ...],
    wanted: tuple[PricingUserGroup, ...],
    actor: str,
    now: datetime,
) -> tuple[PricingUserGroup, ...] | AuthError:
    retained: Final = frozenset(group.id for group in wanted)
    removed: Final = tuple(group.id for group in previous if group.id not in retained)
    if len(frozenset(group.name for group in wanted)) != len(wanted):
        return AuthError("user_group_name_conflict", 409)
    if removed:
        attached: Final = await database.query_raw(
            """SELECT access_group_id FROM "LiteLLM_AccessGroupTable" g WHERE access_group_id=ANY($1::text[])
            AND (cardinality(assigned_key_ids)>0 OR cardinality(assigned_team_ids)>0
            OR EXISTS(SELECT 1 FROM "LiteLLM_VerificationToken" k WHERE g.access_group_id=ANY(k.access_group_ids))
            OR EXISTS(SELECT 1 FROM "LiteLLM_TeamTable" t WHERE g.access_group_id=ANY(t.access_group_ids))
            OR EXISTS(SELECT 1 FROM "LiteLLM_AgentsTable" a WHERE g.access_group_id=ANY(a.access_group_ids))) LIMIT 1""",
            list(removed),
        )
        if attached:
            return AuthError("billing_group_in_use", 409)
    for group in wanted:
        if await group_name_exists(database, group):
            return AuthError("user_group_name_conflict", 409)
    for group in wanted:
        await write_user_group(database, previous, group, actor, now)
    if removed:
        await database.execute_raw(
            'DELETE FROM "LiteLLM_AccessGroupTable" WHERE access_group_id=ANY($1::text[])', list(removed)
        )
    return await registry_groups(database)


async def group_name_exists(database: AccountDatabase, group: PricingUserGroup) -> bool:
    duplicate: Final = await database.query_raw(
        """SELECT access_group_id FROM "LiteLLM_AccessGroupTable"
        WHERE access_group_name=$1 AND access_group_id<>$2 LIMIT 1""",
        group.name,
        group.id,
    )
    return bool(duplicate)


async def write_user_group(
    database: AccountDatabase,
    previous: tuple[PricingUserGroup, ...],
    group: PricingUserGroup,
    actor: str,
    now: datetime,
) -> None:
    existing: Final = next((value for value in previous if value.id == group.id), None)
    models: Final = group.models if group.models is not None else (existing.models if existing else ())
    await database.execute_raw(
        """INSERT INTO "LiteLLM_AccessGroupTable"
            (access_group_id,access_group_name,access_model_names,created_by,updated_by,created_at,updated_at)
            VALUES ($1,$2,$3::text[],$4,$4,$5::timestamptz,$5::timestamptz)
            ON CONFLICT(access_group_id) DO UPDATE SET access_group_name=EXCLUDED.access_group_name,
            access_model_names=EXCLUDED.access_model_names,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at""",
        group.id,
        group.name,
        list(models or ()),
        actor,
        now,
    )
