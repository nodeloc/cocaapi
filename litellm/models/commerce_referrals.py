from datetime import datetime
from typing import Literal, TypeAlias

from pydantic import Field, field_serializer

from litellm.models.commerce_auth import FrozenModel
from litellm.models.commerce_wallet import MAX_UNITS

ReferralState: TypeAlias = Literal["pending", "granted", "inactive", "ineligible"]


class ReferralSettingsInput(FrozenModel):
    revision: int = Field(ge=0, strict=True)
    enabled: bool
    inviter_amount_usd: str = Field(pattern=r"^[0-9]{1,6}(?:\.[0-9]{1,2})?$")
    invitee_amount_usd: str = Field(pattern=r"^[0-9]{1,6}(?:\.[0-9]{1,2})?$")


class ReferralSettingsView(FrozenModel):
    revision: int = Field(default=0, ge=0)
    enabled: bool = False
    inviter_units: int = Field(default=0, ge=0, le=MAX_UNITS)
    invitee_units: int = Field(default=0, ge=0, le=MAX_UNITS)
    updated_at: datetime | None = None

    @field_serializer("inviter_units", "invitee_units")
    def serialize_units(self, value: int) -> str:
        return str(value)


class ReferralCodeView(FrozenModel):
    code: str
    created_at: datetime


class ReferralSnapshot(FrozenModel):
    inviter_id: str
    inviter_units: int
    invitee_units: int
    state: ReferralState


class ReferralRecord(ReferralSnapshot):
    invitee_id: str
    created_at: datetime
    rewarded_at: datetime | None
    failure_code: str | None


class ReferralItem(FrozenModel):
    id: str
    invitee_label: str
    inviter_label: str | None = None
    state: ReferralState
    inviter_units: int
    invitee_units: int
    created_at: datetime
    rewarded_at: datetime | None

    @field_serializer("inviter_units", "invitee_units")
    def serialize_units(self, value: int) -> str:
        return str(value)


class ReferralOverview(FrozenModel):
    enabled: bool
    inviter_units: int
    invitee_units: int
    invite_code: str | None
    invite_url: str | None
    eligible: bool
    invited_count: int
    earned_units: int
    signup_bonus_units: int
    items: tuple[ReferralItem, ...]
    has_more: bool

    @field_serializer("inviter_units", "invitee_units", "earned_units", "signup_bonus_units")
    def serialize_units(self, value: int) -> str:
        return str(value)


class ReferralPage(FrozenModel):
    items: tuple[ReferralItem, ...]
    has_more: bool
