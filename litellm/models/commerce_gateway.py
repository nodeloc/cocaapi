import re
from datetime import datetime
from typing import Final, Literal, Protocol

from pydantic import Field, SecretStr, model_validator
from typing_extensions import Self

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
    budget_duration: str | None = None


class GatewayKey(FrozenModel):
    id: str
    name: str
    models: tuple[str, ...]
    spend_usd: float
    max_budget_usd: float | None
    expires_at: datetime | None
    created_at: datetime | None
    blocked: bool
    budget_duration: str | None = None
    budget_reset_at: datetime | None = None
    total_spend_usd: float = 0
    rpm_limit: int | None = None
    tpm_limit: int | None = None
    tpd_limit: int | None = None
    last_active_at: datetime | None = None


class GatewayKeys(FrozenModel):
    items: tuple[GatewayKey, ...]
    has_more: bool


class CreateGatewayKey(FrozenModel):
    name: str = Field(min_length=1, max_length=80)
    expires_in_days: int = Field(default=30, ge=1, le=365, strict=True)
    duration: str | None = Field(default=None, pattern=r"^[1-9][0-9]{0,7}[smhd]$")
    models: tuple[str, ...] | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def bounded_duration(self) -> Self:
        if self.duration:
            match: Final = re.fullmatch(r"([1-9][0-9]*)([smhd])", self.duration)
            if match and int(match[1]) * {"s": 1, "m": 60, "h": 3600, "d": 86400}[match[2]] > 365 * 86400:
                raise ValueError("Key expiry cannot exceed 365 days")
        return self


class CreatedGatewayKey(FrozenModel):
    key: str


class GatewayTotals(FrozenModel):
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    spend_usd: float
    successful_requests: int = 0
    failed_requests: int = 0
    response_time_ms: float = 0
    timed_requests: int = 0


class GatewayDaily(GatewayTotals):
    day: str


class GatewayModelUsage(GatewayTotals):
    model: str


class GatewayDailyModel(GatewayModelUsage):
    day: str


class GatewayUsage(FrozenModel):
    days: int
    totals: GatewayTotals
    daily: tuple[GatewayDaily, ...]
    models: tuple[GatewayModelUsage, ...]
    daily_models: tuple[GatewayDailyModel, ...] = ()


class GatewayLog(FrozenModel):
    request_id: str
    model: str
    status: str | None
    started_at: datetime
    total_tokens: int
    spend_usd: float
    ended_at: datetime | None = None
    prompt_tokens: int = 0
    completion_tokens: int = 0


class GatewayLogs(FrozenModel):
    items: tuple[GatewayLog, ...]
    has_more: bool


class PlaygroundInput(FrozenModel):
    api_key: SecretStr = Field(min_length=16, max_length=256)
    model: str = Field(min_length=1, max_length=256)
    prompt: str = Field(default="", max_length=8000)
    messages: tuple["PlaygroundMessage", ...] = Field(default=(), max_length=50)
    max_tokens: int = Field(default=4096, ge=1, le=32768, strict=True)

    @model_validator(mode="after")
    def bounded_conversation(self) -> Self:
        if not self.prompt.strip() and not self.messages:
            raise ValueError("A message is required")
        if sum(len(message.content) for message in self.messages) > 262144:
            raise ValueError("Conversation is too long")
        return self


class PlaygroundMessage(FrozenModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=131072)

    @model_validator(mode="after")
    def bounded_user_message(self) -> Self:
        if self.role != "assistant" and len(self.content) > 8000:
            raise ValueError("User and system messages cannot exceed 8000 characters")
        return self


class PlaygroundUsage(FrozenModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class PlaygroundOutput(FrozenModel):
    content: str
    finish_reason: str | None = None
    request_id: str | None = None
    created: int | None = None
    usage: PlaygroundUsage | None = None


class NativeGateway(Protocol):
    async def models(self, grants: tuple[str, ...]) -> tuple[str, ...] | AuthError: ...
    async def create_key(
        self, user_id: str, body: CreateGatewayKey, access: GatewayAccess
    ) -> SecretStr | AuthError: ...
    async def delete_key(self, token: str, user_id: str) -> AuthError | None: ...
    async def chat(self, body: PlaygroundInput) -> PlaygroundOutput | AuthError: ...
