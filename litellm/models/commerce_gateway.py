from datetime import datetime
from typing import Protocol

from pydantic import Field, SecretStr

from litellm.models.commerce_auth import AuthError, FrozenModel


class GatewayAccess(FrozenModel):
    models: tuple[str, ...]
    max_budget_usd: float | None
    spend_usd: float
    rpm_limit: int | None
    tpm_limit: int | None
    budget_reset_at: datetime | None
    can_create_key: bool
    key_creation_reason: str | None


class GatewayKey(FrozenModel):
    id: str
    name: str
    models: tuple[str, ...]
    spend_usd: float
    max_budget_usd: float | None
    expires_at: datetime | None
    created_at: datetime | None
    blocked: bool


class GatewayKeys(FrozenModel):
    items: tuple[GatewayKey, ...]
    has_more: bool


class CreateGatewayKey(FrozenModel):
    name: str = Field(min_length=1, max_length=80)
    expires_in_days: int = Field(default=30, ge=1, le=365, strict=True)


class CreatedGatewayKey(FrozenModel):
    key: str


class GatewayTotals(FrozenModel):
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    spend_usd: float


class GatewayDaily(GatewayTotals):
    day: str


class GatewayModelUsage(GatewayTotals):
    model: str


class GatewayUsage(FrozenModel):
    days: int
    totals: GatewayTotals
    daily: tuple[GatewayDaily, ...]
    models: tuple[GatewayModelUsage, ...]


class GatewayLog(FrozenModel):
    request_id: str
    model: str
    status: str | None
    started_at: datetime
    total_tokens: int
    spend_usd: float


class GatewayLogs(FrozenModel):
    items: tuple[GatewayLog, ...]
    has_more: bool


class PlaygroundInput(FrozenModel):
    api_key: SecretStr = Field(min_length=16, max_length=256)
    model: str = Field(min_length=1, max_length=256)
    prompt: str = Field(min_length=1, max_length=8000)


class PlaygroundOutput(FrozenModel):
    content: str


class NativeGateway(Protocol):
    async def models(self, grants: tuple[str, ...]) -> tuple[str, ...] | AuthError: ...
    async def create_key(
        self, user_id: str, body: CreateGatewayKey, access: GatewayAccess
    ) -> SecretStr | AuthError: ...
    async def delete_key(self, token: str, user_id: str) -> AuthError | None: ...
    async def chat(self, body: PlaygroundInput) -> PlaygroundOutput | AuthError: ...
