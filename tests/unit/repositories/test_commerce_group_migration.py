from typing import Final

from litellm.models.commerce_billing_groups import PricingRule, PricingUserGroup
from litellm.repositories.commerce_group_migration import (
    MigrationMember,
    group_variants,
    migrated_rules,
    normalized_models,
)


def test_migration_preserves_each_distinct_permission_scope_and_the_default_group() -> None:
    source: Final = PricingUserGroup(id="default", name="普通组")
    members: Final = (
        MigrationMember(user_id="a", group_id="default", models=("model-a", "model-b")),
        MigrationMember(user_id="b", group_id="default", models=("model-a",)),
        MigrationMember(user_id="c", group_id="default", models=("no-default-models",)),
        MigrationMember(user_id="d", group_id="default", models=()),
    )
    migrated: Final = group_variants(source, members, ("model-a", "model-b"))
    assert migrated[0].group.id == source.id
    assert len(migrated) == len(frozenset(normalized_models(member.models) for member in members))
    assert frozenset(group.group.models for group in migrated) == frozenset(
        normalized_models(member.models) for member in members
    )
    assert group_variants(source, tuple(reversed(members)), ("model-a", "model-b")) == migrated


def test_every_split_permission_group_keeps_the_original_multiplier_and_deny_rule() -> None:
    groups: Final = group_variants(
        PricingUserGroup(id="vip", name="VIP"),
        (
            MigrationMember(user_id="a", group_id="vip", models=("model-a",)),
            MigrationMember(user_id="b", group_id="vip", models=("model-b",)),
        ),
        ("model-a",),
    )
    rule: Final = PricingRule(user_group_id="vip", model_group_id="premium", multiplier="0.75", enabled=False)
    copied: Final = migrated_rules(rule, groups)
    assert frozenset(value.user_group_id for value in copied) == frozenset(value.group.id for value in groups)
    assert all(
        value.multiplier == rule.multiplier
        and value.enabled == rule.enabled
        and value.model_group_id == rule.model_group_id
        for value in copied
    )
