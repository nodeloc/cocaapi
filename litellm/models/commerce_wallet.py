from datetime import datetime
from typing import Final, Literal, Protocol, TypeAlias

from litellm.models.commerce_auth import AuthError, FrozenModel, Session
from pydantic import Field, field_serializer

UNITS_PER_USD: Final = 1_000_000_000
MAX_UNITS: Final = 9_223_372_036_854_775_807
LedgerKind: TypeAlias = Literal["adjustment", "redemption", "recharge", "usage"]


class WalletSnapshot(FrozenModel):
    user_id: str
    available_units: int = Field(ge=0, le=MAX_UNITS)
    reserved_units: int = Field(ge=0, le=MAX_UNITS)
    credited_units: int = Field(ge=0, le=MAX_UNITS)
    debited_units: int = Field(ge=0, le=MAX_UNITS)
    debt_units: int = Field(default=0, ge=0, le=MAX_UNITS)
    currency: Literal["USD"] = "USD"

    @field_serializer("available_units", "reserved_units", "credited_units", "debited_units", "debt_units")
    def serialize_units(self, value: int) -> str:
        return str(value)


class LedgerEntry(FrozenModel):
    id: str
    user_id: str
    delta_units: int
    available_after: int
    kind: LedgerKind
    reference: str
    actor_id: str
    reason: str
    created_at: datetime

    @field_serializer("delta_units", "available_after")
    def serialize_units(self, value: int) -> str:
        return str(value)


class WalletChange(FrozenModel):
    user_id: str
    delta_units: int
    kind: LedgerKind
    business_key: str
    reference: str
    actor_id: str
    reason: str
    now: datetime


class CallReservation(FrozenModel):
    request_id: str
    user_id: str
    model: str
    reserved_units: int
    actual_units: int | None
    status: Literal["pending", "settled", "released", "review"]
    native_request_id: str
    created_at: datetime


class LedgerPage(FrozenModel):
    items: tuple[LedgerEntry, ...]
    has_more: bool


class WalletSummary(WalletSnapshot):
    email: str | None


class WalletPage(FrozenModel):
    items: tuple[WalletSummary, ...]
    has_more: bool


class AdjustmentInput(FrozenModel):
    amount_usd: str = Field(min_length=1, max_length=16)
    direction: Literal["credit", "debit"]
    reason: str = Field(min_length=1, max_length=500)


class RedeemInput(FrozenModel):
    code: str = Field(min_length=16, max_length=100)


class WalletStore(Protocol):
    async def balance(self, user_id: str) -> WalletSnapshot | AuthError: ...
    async def transactions(self, user_id: str, limit: int, offset: int) -> LedgerPage: ...
    async def adjust(self, change: WalletChange) -> LedgerEntry | AuthError: ...
    async def wallets(self, search: str, limit: int, offset: int) -> WalletPage: ...


class RedeemBatch(FrozenModel):
    id: str
    name: str
    face_units: int
    count: int
    redeemed_count: int
    disabled: bool
    expires_at: datetime | None
    created_at: datetime
    created_by: str

    @field_serializer("face_units")
    def serialize_units(self, value: int) -> str:
        return str(value)


class BatchPage(FrozenModel):
    items: tuple[RedeemBatch, ...]
    has_more: bool


class BatchInput(FrozenModel):
    name: str = Field(min_length=1, max_length=120)
    amount_usd: str = Field(min_length=1, max_length=16)
    count: int = Field(ge=1, le=100, strict=True)
    expires_at: datetime | None = None


class DisableBatchInput(FrozenModel):
    reason: str = Field(min_length=1, max_length=500)


class CodeRecord(FrozenModel):
    id: str
    code_hash: str
    tail: str


class BatchCommand(FrozenModel):
    id: str
    request_key: str
    name: str
    face_units: int
    codes: tuple[CodeRecord, ...]
    expires_at: datetime | None
    actor_id: str
    now: datetime


class GeneratedBatch(FrozenModel):
    batch: RedeemBatch
    codes: tuple[str, ...]


class RedemptionStore(Protocol):
    async def create_batch(self, command: BatchCommand) -> RedeemBatch | AuthError: ...
    async def batches(self, limit: int, offset: int) -> BatchPage: ...
    async def disable_batch(
        self, batch_id: str, actor_id: str, reason: str, now: datetime
    ) -> RedeemBatch | AuthError: ...
    async def redeem(self, session: Session, code_hash: str, now: datetime) -> LedgerEntry | AuthError: ...
