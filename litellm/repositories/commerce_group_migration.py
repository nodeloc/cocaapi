import hashlib
from datetime import datetime
from itertools import chain
from typing import Final

from pydantic import TypeAdapter, ValidationError

from litellm.models.commerce_auth import AuthError, FrozenModel
from litellm.models.commerce_billing_groups import BillingGroups, PricingRule, PricingUserGroup
from litellm.repositories.commerce_auth_repository import AccountDatabase
from litellm.repositories.commerce_billing_group_repository import BillingGroupRepository
from litellm.repositories.commerce_user_group_repository import group_lock, record_configuration, registry_groups


class MigrationMember(FrozenModel):
    user_id: str
    group_id: str
    models: tuple[str, ...]


class MigratedGroup(FrozenModel):
    legacy_id: str
    group: PricingUserGroup


class GroupMigrationReport(FrozenModel):
    revision: int
    groups: int
    accounts: int
    reassigned: int
    already_active: bool = False
    dry_run: bool = False


def normalized_models(models: tuple[str, ...]) -> tuple[str, ...]:
    if "no-default-models" in models:
        return ()
    return tuple(sorted(frozenset(models))) if models else ("all-proxy-models",)


def scoped_group(group: PricingUserGroup, models: tuple[str, ...], ordinal: int) -> PricingUserGroup:
    suffix: Final = hashlib.sha256((group.id + "\0" + "\0".join(models)).encode()).hexdigest()[:12]
    return PricingUserGroup(
        id=f"{group.id[:40]}-scope-{suffix}", name=f"{group.name[:64]}（原权限 {ordinal}）", models=models
    )


def group_variants(
    group: PricingUserGroup, members: tuple[MigrationMember, ...], defaults: tuple[str, ...]
) -> tuple[MigratedGroup, ...]:
    scopes: Final = tuple(
        sorted(frozenset(normalized_models(member.models) for member in members if member.group_id == group.id))
    )
    primary: Final = defaults if group.id == "default" or not scopes else scopes[0]
    return (MigratedGroup(legacy_id=group.id, group=group.model_copy(update={"models": primary})),) + tuple(
        MigratedGroup(legacy_id=group.id, group=scoped_group(group, scope, ordinal))
        for ordinal, scope in enumerate(scopes, 1)
        if scope != primary
    )


def migrated_rules(rule: PricingRule, groups: tuple[MigratedGroup, ...]) -> tuple[PricingRule, ...]:
    return tuple(
        rule.model_copy(update={"user_group_id": item.group.id})
        for item in groups
        if item.legacy_id == rule.user_group_id
    )


def migration_conflict(group: PricingUserGroup, existing: tuple[PricingUserGroup, ...]) -> bool:
    conflict: Final = next((value for value in existing if value.id == group.id or value.name == group.name), None)
    return conflict is not None and conflict != group


async def activate_user_groups(
    database: AccountDatabase, default_models: tuple[str, ...], actor: str, now: datetime, *, dry_run: bool = False
) -> GroupMigrationReport | AuthError:
    async with database.tx() as tx:
        await group_lock(tx)
        state: Final = await BillingGroupRepository(tx).state()
        if isinstance(state, AuthError):
            return state
        record, policy = state
        if policy.group_source == "access_groups":
            return GroupMigrationReport(
                revision=record.revision, groups=len(policy.user_groups), accounts=0, reassigned=0, already_active=True
            )
        rows: Final = await tx.query_raw(
            """SELECT c.user_id,c.billing_group_id AS group_id,u.models FROM "CommerceCustomer" c
            JOIN "LiteLLM_UserTable" u ON u.user_id=c.user_id ORDER BY c.user_id FOR UPDATE OF c"""
        )
        members: Final = TypeAdapter(tuple[MigrationMember, ...]).validate_python(rows)
        if any(member.group_id not in frozenset(group.id for group in policy.user_groups) for member in members):
            return AuthError("billing_group_not_found", 409)
        defaults: Final = normalized_models(default_models or ("no-default-models",))
        variants: Final = tuple(
            chain.from_iterable(group_variants(group, members, defaults) for group in policy.user_groups)
        )
        existing: Final = await registry_groups(tx)
        wanted: Final = tuple(item.group for item in variants)
        for group in wanted:
            if migration_conflict(group, existing):
                return AuthError("user_group_migration_conflict", 409)
        wanted_ids: Final = frozenset(group.id for group in wanted)
        combined: Final = wanted + tuple(group for group in existing if group.id not in wanted_ids)
        try:
            changed: Final = BillingGroups(
                group_source="access_groups",
                user_groups=combined,
                model_groups=policy.model_groups,
                rules=tuple(chain.from_iterable(migrated_rules(rule, variants) for rule in policy.rules)),
            )
        except ValidationError:
            return AuthError("invalid_user_group_configuration", 422)
        if len(frozenset(group.name for group in combined)) != len(combined):
            return AuthError("user_group_name_conflict", 409)
        assignments: Final = tuple(
            (
                member,
                next(
                    item.group
                    for item in variants
                    if item.legacy_id == member.group_id and item.group.models == normalized_models(member.models)
                ),
            )
            for member in members
        )
        report: Final = GroupMigrationReport(
            revision=record.revision + 1,
            groups=len(combined),
            accounts=len(members),
            reassigned=sum(member.group_id != group.id for member, group in assignments),
            dry_run=dry_run,
        )
        if dry_run:
            return report
        for group in wanted:
            await tx.execute_raw(
                """INSERT INTO "LiteLLM_AccessGroupTable"
                (access_group_id,access_group_name,access_model_names,created_by,updated_by,created_at,updated_at)
                VALUES ($1,$2,$3::text[],$4,$4,$5::timestamptz,$5::timestamptz) ON CONFLICT(access_group_id) DO NOTHING""",
                group.id,
                group.name,
                list(group.models or ()),
                actor,
                now,
            )
        for member, group in assignments:
            await tx.execute_raw(
                """UPDATE "LiteLLM_UserTable" SET max_budget=NULL WHERE user_id=$1 AND max_budget=0
                AND models=ARRAY['no-default-models']::text[] AND metadata @> '{"commerce":true}'::jsonb""",
                member.user_id,
            )
            if member.group_id == group.id:
                continue
            await tx.execute_raw(
                """UPDATE "CommerceCustomer" SET billing_group_id=$2,billing_group_version=billing_group_version+1
                WHERE user_id=$1""",
                member.user_id,
                group.id,
            )
        await record_configuration(tx, changed, report.revision, actor, now, "迁移到统一用户组，保留原模型权限与倍率")
        return report
