from typing import Final

import pytest
from pydantic import ValidationError

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_billing_groups import (
    BillingGroups,
    PricingModelGroup,
    PricingRule,
    PricingUserGroup,
    pricing_snapshot,
    scaled_units,
)
from litellm.models.commerce_wallet import MAX_UNITS


def test_default_groups_keep_unassigned_models_at_one_times() -> None:
    result: Final = pricing_snapshot(BillingGroups(), "default", "new-public-model", 1, 1)
    assert not isinstance(result, AuthError)
    assert result.user_group_name == "普通组" and result.model_group_name == "普通模型组"
    assert result.multiplier_millionths == 1_000_000 and result.model == "new-public-model"


@pytest.mark.parametrize("multiplier,expected", (("0.8", 14), ("2.5", 43), ("0", 0), ("0.000001", 1)))
def test_group_pair_prices_with_exact_decimal_rounding(multiplier: str, expected: int) -> None:
    policy: Final = BillingGroups(
        user_groups=(PricingUserGroup(id="default", name="普通组"), PricingUserGroup(id="vip", name="VIP")),
        model_groups=(
            PricingModelGroup(id="default", name="普通模型组"),
            PricingModelGroup(id="premium", name="高级", models=("public-a",)),
        ),
        rules=(PricingRule(user_group_id="vip", model_group_id="premium", multiplier=multiplier),),
    )
    snapshot: Final = pricing_snapshot(policy, "vip", "public-a", 7, 2)
    assert not isinstance(snapshot, AuthError) and snapshot.revision == 7 and snapshot.membership_version == 2
    assert scaled_units(17, snapshot.multiplier_millionths) == expected
    ordinary: Final = pricing_snapshot(policy, "default", "public-a", 7, 1)
    assert not isinstance(ordinary, AuthError) and scaled_units(17, ordinary.multiplier_millionths) == 17


@pytest.mark.parametrize("value", ("-1", "NaN", "Infinity", "1e2", "0.1234567", "1000.000001", 0.5, True))
def test_invalid_multipliers_cannot_reach_billing(value: object) -> None:
    with pytest.raises(ValidationError):
        PricingRule.model_validate({"user_group_id": "default", "model_group_id": "default", "multiplier": value})


def test_disabled_pair_and_missing_user_group_fail_closed() -> None:
    policy: Final = BillingGroups(
        rules=(PricingRule(user_group_id="default", model_group_id="default", enabled=False),)
    )
    denied: Final = pricing_snapshot(policy, "default", "model-a", 1, 1)
    assert isinstance(denied, AuthError) and denied.code == "model_group_disabled"
    missing: Final = pricing_snapshot(policy, "unknown", "model-a", 1, 1)
    assert isinstance(missing, AuthError) and missing.code == "billing_groups_unavailable"


def test_group_ids_rules_and_model_membership_are_unambiguous() -> None:
    with pytest.raises(ValidationError):
        BillingGroups(user_groups=(PricingUserGroup(id="vip", name="VIP"),))
    with pytest.raises(ValidationError):
        BillingGroups(
            model_groups=(
                PricingModelGroup(id="default", name="默认"),
                PricingModelGroup(id="a", name="A", models=("same",)),
                PricingModelGroup(id="b", name="B", models=("same",)),
            )
        )
    rule: Final = PricingRule(user_group_id="default", model_group_id="default")
    with pytest.raises(ValidationError):
        BillingGroups(rules=(rule, rule))
    with pytest.raises(ValidationError):
        BillingGroups(rules=(PricingRule(user_group_id="unknown", model_group_id="default"),))


def test_scaled_fees_reject_overflow_and_preserve_free_usage() -> None:
    assert scaled_units(0, 1_000_000_000) == 0
    assert scaled_units(MAX_UNITS, 0) == 0
    assert scaled_units(MAX_UNITS, 1_000_000) == MAX_UNITS
    assert isinstance(scaled_units(MAX_UNITS, 1_000_001), AuthError)
