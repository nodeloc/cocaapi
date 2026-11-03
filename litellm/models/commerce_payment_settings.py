from datetime import datetime
from typing import Final, Protocol
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator

from litellm.models.commerce_auth import AuthError, FrozenModel


class PaymentConfigurationInput(FrozenModel):
    revision: int = Field(ge=0, strict=True)
    enabled: bool
    origin: str = Field(max_length=1024)
    merchant_id: str = Field(pattern=r"^(?:[1-9][0-9]{0,17})?$")
    private_key: SecretStr | None = Field(default=None, max_length=16_384)
    public_key: SecretStr | None = Field(default=None, max_length=16_384)
    clear_private_key: bool = False
    clear_public_key: bool = False

    @field_validator("origin")
    @classmethod
    def validate_origin(cls, value: str) -> str:
        normalized: Final = value.strip()
        if not normalized:
            return ""
        parsed: Final = urlsplit(normalized)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.port == 0
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in {"", "/"}
        ):
            raise ValueError("Invalid payment origin")
        return normalized.rstrip("/")


class PaymentConfiguration(FrozenModel):
    enabled: bool
    origin: str
    merchant_id: str
    encrypted_private_key: str = Field(repr=False)
    encrypted_public_key: str = Field(repr=False)


class EffectivePaymentConfiguration(FrozenModel):
    enabled: bool
    origin: str
    merchant_id: str
    private_key: SecretStr
    public_key: SecretStr


class PaymentConfigurationRecord(FrozenModel):
    payload: str = Field(repr=False)
    revision: int = Field(ge=1)
    updated_at: datetime


class PaymentConfigurationView(FrozenModel):
    revision: int
    enabled: bool
    origin: str
    merchant_id: str
    private_key_configured: bool
    public_key_configured: bool
    notify_url: str
    return_url: str
    updated_at: datetime | None


class PaymentConfigurationStore(Protocol):
    async def read(self) -> PaymentConfigurationRecord | AuthError | None: ...
    async def save(
        self, payload: str, revision: int, actor_id: str, now: datetime
    ) -> PaymentConfigurationRecord | AuthError: ...
