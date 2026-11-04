from datetime import datetime
from decimal import Decimal
from itertools import chain
from typing import Annotated, Final, Literal, TypeAlias

from pydantic import Field, field_validator, model_validator
from typing_extensions import Self

from litellm.models.commerce_auth import AuthError, FrozenModel

RATIO_SCALE: Final = 1_000_000
MAX_RATIO: Final = 1_000_000_000
GroupID: TypeAlias = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,63}$")]
ModelName: TypeAlias = Annotated[str, Field(min_length=1, max_length=256, pattern=r"\S")]


class PricingGroup(FrozenModel):
    id: GroupID
    name: str = Field(min_length=1, max_length=80, pattern=r"\S")

    @field_validator("name")
    @classmethod
    def trimmed_name(cls, value: str) -> str:
        return value.strip()


class PricingUserGroup(PricingGroup):
    models: tuple[ModelName, ...] | None = Field(default=None, max_length=4096)


class PricingModelGroup(PricingGroup):
    models: tuple[ModelName, ...] = Field(default=(), max_length=4096)


class PricingRule(FrozenModel):
    user_group_id: GroupID
    model_group_id: GroupID
    multiplier: str = Field(default="1", pattern=r"^(?:0|[1-9][0-9]{0,3})(?:\.[0-9]{1,6})?$")
    enabled: bool = Field(default=True, strict=True)

    @model_validator(mode="after")
    def bounded_multiplier(self) -> Self:
        if self.multiplier_millionths > MAX_RATIO:
            raise ValueError("Multiplier cannot exceed 1000")
        return self

    @property
    def multiplier_millionths(self) -> int:
        return int(Decimal(self.multiplier) * RATIO_SCALE)


class BillingGroups(FrozenModel):
    group_source: Literal["legacy", "access_groups"] = "legacy"
    user_groups: tuple[PricingUserGroup, ...] = Field(
        default=(PricingUserGroup(id="default", name="普通组"),), min_length=1, max_length=100
    )
    model_groups: tuple[PricingModelGroup, ...] = Field(
        default=(PricingModelGroup(id="default", name="普通模型组"),), min_length=1, max_length=100
    )
    rules: tuple[PricingRule, ...] = Field(default=(), max_length=10000)

    @model_validator(mode="after")
    def unambiguous_policy(self) -> Self:
        users: Final = frozenset(group.id for group in self.user_groups)
        models: Final = frozenset(group.id for group in self.model_groups)
        if "default" not in users or "default" not in models:
            raise ValueError("Default groups are required")
        if len(users) != len(self.user_groups) or len(models) != len(self.model_groups):
            raise ValueError("Group ids must be unique")
        if next(group for group in self.model_groups if group.id == "default").models:
            raise ValueError("The default model group contains unassigned models automatically")
        members: Final = tuple(chain.from_iterable(group.models for group in self.model_groups))
        if len(members) > 4096 or len(members) != len(frozenset(members)):
            raise ValueError("Each model can belong to only one billing group")
        pairs: Final = tuple((rule.user_group_id, rule.model_group_id) for rule in self.rules)
        if len(pairs) != len(frozenset(pairs)):
            raise ValueError("Each group pair can have only one rule")
        if any(rule.user_group_id not in users or rule.model_group_id not in models for rule in self.rules):
            raise ValueError("A rule references a missing group")
        return self


class BillingGroupsUpdate(BillingGroups):
    revision: int = Field(ge=1, strict=True)
    reason: str = Field(min_length=1, max_length=500, pattern=r"\S")

    def policy(self) -> BillingGroups:
        return BillingGroups(user_groups=self.user_groups, model_groups=self.model_groups, rules=self.rules)


class BillingGroupsRecord(FrozenModel):
    revision: int
    payload: str
    updated_by: str
    created_at: datetime
    registry: str = "[]"


class BillingGroupsView(BillingGroups):
    revision: int
    updated_by: str
    updated_at: datetime


class PricingSnapshot(FrozenModel):
    revision: int = Field(ge=1, strict=True)
    membership_version: int = Field(ge=1, strict=True)
    user_group_id: GroupID
    user_group_name: str
    model_group_id: GroupID
    model_group_name: str
    multiplier_millionths: int = Field(ge=0, le=MAX_RATIO, strict=True)
    model: ModelName


class BillingGroupMember(FrozenModel):
    user_id: str
    email: str | None
    enabled: bool
    group_id: str
    group_name: str
    version: int


class BillingGroupMembers(FrozenModel):
    items: tuple[BillingGroupMember, ...]
    has_more: bool


class BillingGroupAssignment(FrozenModel):
    group_id: GroupID
    expected_version: int = Field(ge=1, strict=True)
    reason: str = Field(min_length=1, max_length=500, pattern=r"\S")


class BillingGroupCatalog(FrozenModel):
    models: tuple[ModelName, ...]


def pricing_snapshot(
    policy: BillingGroups, user_group_id: str, model: str, revision: int, membership_version: int
) -> PricingSnapshot | AuthError:
    user: Final = next((group for group in policy.user_groups if group.id == user_group_id), None)
    if user is None:
        return AuthError("billing_groups_unavailable", 503)
    model_group: Final = next(
        (group for group in policy.model_groups if model in group.models),
        next(group for group in policy.model_groups if group.id == "default"),
    )
    rule: Final = next(
        (rule for rule in policy.rules if rule.user_group_id == user.id and rule.model_group_id == model_group.id), None
    )
    if rule is not None and not rule.enabled:
        return AuthError("model_group_disabled", 403)
    return PricingSnapshot(
        revision=revision,
        membership_version=membership_version,
        user_group_id=user.id,
        user_group_name=user.name,
        model_group_id=model_group.id,
        model_group_name=model_group.name,
        multiplier_millionths=rule.multiplier_millionths if rule is not None else RATIO_SCALE,
        model=model,
    )


def scaled_units(units: int, multiplier_millionths: int) -> int | AuthError:
    from litellm.models.commerce_wallet import MAX_UNITS

    if not 0 <= units <= MAX_UNITS or not 0 <= multiplier_millionths <= MAX_RATIO:
        return AuthError("wallet_pricing_unavailable", 503)
    result: Final = (units * multiplier_millionths + RATIO_SCALE - 1) // RATIO_SCALE
    return result if result <= MAX_UNITS else AuthError("wallet_pricing_unavailable", 503)
