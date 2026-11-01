from datetime import datetime
from typing import Protocol

from pydantic import Field, SecretStr

from litellm.models.commerce_auth import AuthError, FrozenModel, ProviderID


class ProviderConfiguration(FrozenModel):
    id: ProviderID
    enabled: bool
    client_id: str
    encrypted_secret: str = Field(repr=False)


class LoginConfiguration(FrozenModel):
    registration_enabled: bool
    providers: tuple[ProviderConfiguration, ...]


class LoginConfigurationRecord(FrozenModel):
    payload: str = Field(repr=False)
    revision: int = Field(ge=1)
    updated_at: datetime


class ProviderConfigurationInput(FrozenModel):
    id: ProviderID
    enabled: bool
    client_id: str = Field(max_length=512)
    client_secret: SecretStr | None = Field(default=None, max_length=4096)
    clear_secret: bool = False


class LoginConfigurationInput(FrozenModel):
    revision: int = Field(ge=0, strict=True)
    registration_enabled: bool
    providers: tuple[ProviderConfigurationInput, ...] = Field(min_length=3, max_length=3)


class ProviderConfigurationView(FrozenModel):
    id: ProviderID
    label: str
    enabled: bool
    client_id: str
    secret_configured: bool
    callback_url: str


class LoginConfigurationView(FrozenModel):
    revision: int
    registration_enabled: bool
    email_enabled: bool
    providers: tuple[ProviderConfigurationView, ...]
    updated_at: datetime | None


class LoginConfigurationStore(Protocol):
    async def read(self) -> LoginConfigurationRecord | AuthError | None: ...
    async def save(
        self, payload: str, revision: int, actor_id: str, now: datetime
    ) -> LoginConfigurationRecord | AuthError: ...
