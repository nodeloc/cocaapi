from collections.abc import Callable
from datetime import datetime
from typing import Final

from pydantic import ValidationError

from litellm.models.commerce_auth import AuthError, ProviderID
from litellm.models.commerce_login_settings import (
    LoginConfiguration,
    LoginConfigurationInput,
    LoginConfigurationRecord,
    LoginConfigurationStore,
    LoginConfigurationView,
    ProviderConfiguration,
    ProviderConfigurationInput,
    ProviderConfigurationView,
)
from litellm.proxy.commerce.auth_service import utcnow
from litellm.proxy.commerce.config import AccountSettings, ProviderSettings, provider_from_credentials
from litellm.proxy.commerce.security import AuthSecurity

PROVIDERS: Final[tuple[ProviderID, ...]] = ("github", "google", "nodeloc")


class LoginSettingsService:
    def __init__(
        self, store: LoginConfigurationStore, base: AccountSettings, clock: Callable[[], datetime] = utcnow
    ) -> None:
        self.store = store
        self.base = base
        self.security = AuthSecurity(base.secret.get_secret_value())
        self.clock = clock

    def defaults(self) -> LoginConfiguration:
        return LoginConfiguration(
            registration_enabled=self.base.registration_enabled,
            providers=tuple(self.default_provider(provider_id) for provider_id in PROVIDERS),
        )

    def default_provider(self, provider_id: ProviderID) -> ProviderConfiguration:
        existing: Final = self.base.provider(provider_id)
        return ProviderConfiguration(
            id=provider_id,
            enabled=existing is not None,
            client_id=existing.client_id if existing else "",
            encrypted_secret=self.security.seal(existing.client_secret.get_secret_value()) if existing else "",
        )

    def configuration(self, record: LoginConfigurationRecord | None) -> LoginConfiguration | AuthError:
        if record is None:
            return self.defaults()
        try:
            result: Final = LoginConfiguration.model_validate_json(record.payload)
        except ValidationError:
            return AuthError("login_settings_unavailable", 503)
        if len(result.providers) != 3 or frozenset(provider.id for provider in result.providers) != frozenset(
            PROVIDERS
        ):
            return AuthError("login_settings_unavailable", 503)
        return result

    def view(self, config: LoginConfiguration, record: LoginConfigurationRecord | None) -> LoginConfigurationView:
        return LoginConfigurationView(
            revision=record.revision if record else 0,
            registration_enabled=config.registration_enabled,
            email_enabled=self.base.email_ready,
            providers=tuple(self.provider_view(provider) for provider in config.providers),
            updated_at=record.updated_at if record else None,
        )

    def provider_view(self, provider: ProviderConfiguration) -> ProviderConfigurationView:
        definition: Final = provider_from_credentials(provider.id, "", "")
        return ProviderConfigurationView(
            id=provider.id,
            label=definition.label,
            enabled=provider.enabled,
            client_id=provider.client_id,
            secret_configured=bool(provider.encrypted_secret),
            callback_url=f"{self.base.public_url}/account/api/v1/oauth/{provider.id}/callback",
        )

    async def read(self) -> LoginConfigurationView | AuthError:
        record: Final = await self.store.read()
        if isinstance(record, AuthError):
            return record
        config: Final = self.configuration(record)
        return config if isinstance(config, AuthError) else self.view(config, record)

    def update_provider(
        self, patch: ProviderConfigurationInput, current: LoginConfiguration
    ) -> ProviderConfiguration | AuthError:
        previous: Final = next(provider for provider in current.providers if provider.id == patch.id)
        value: Final = patch.client_secret.get_secret_value() if patch.client_secret else ""
        if patch.clear_secret and value:
            return AuthError("invalid_login_settings", 422)
        secret: Final = "" if patch.clear_secret else self.security.seal(value) if value else previous.encrypted_secret
        client_id: Final = patch.client_id.strip()
        if any(character.isspace() or ord(character) < 32 for character in client_id):
            return AuthError("invalid_login_settings", 422)
        if patch.enabled and (not client_id or not secret):
            return AuthError("provider_credentials_required", 422)
        if secret and self.security.unseal(secret) is None:
            return AuthError("login_settings_unavailable", 503)
        return ProviderConfiguration(id=patch.id, enabled=patch.enabled, client_id=client_id, encrypted_secret=secret)

    async def save(self, body: LoginConfigurationInput, actor_id: str) -> LoginConfigurationView | AuthError:
        if frozenset(provider.id for provider in body.providers) != frozenset(PROVIDERS):
            return AuthError("invalid_login_settings", 422)
        previous: Final = await self.store.read()
        if isinstance(previous, AuthError):
            return previous
        current: Final = self.configuration(previous)
        if isinstance(current, AuthError):
            return current
        candidates: Final = tuple(self.update_provider(provider, current) for provider in body.providers)
        errors: Final = tuple(provider for provider in candidates if isinstance(provider, AuthError))
        if errors:
            return errors[0]
        configuration: Final = LoginConfiguration(
            registration_enabled=body.registration_enabled,
            providers=tuple(provider for provider in candidates if not isinstance(provider, AuthError)),
        )
        stored: Final = await self.store.save(configuration.model_dump_json(), body.revision, actor_id, self.clock())
        return stored if isinstance(stored, AuthError) else self.view(configuration, stored)

    async def effective(self) -> AccountSettings | AuthError:
        record: Final = await self.store.read()
        if isinstance(record, AuthError):
            return record
        if record is None:
            return self.base
        config: Final = self.configuration(record)
        if isinstance(config, AuthError):
            return config
        if any(
            bool(provider.encrypted_secret) and self.security.unseal(provider.encrypted_secret) is None
            for provider in config.providers
        ):
            return AuthError("login_settings_unavailable", 503)
        providers: Final = tuple(self.resolve_provider(provider) for provider in config.providers if provider.enabled)
        if any(isinstance(provider, AuthError) for provider in providers):
            return AuthError("login_settings_unavailable", 503)
        enabled: Final = tuple(provider for provider in providers if isinstance(provider, ProviderSettings))
        return self.base.model_copy(update={"registration_enabled": config.registration_enabled, "providers": enabled})

    def resolve_provider(self, provider: ProviderConfiguration) -> ProviderSettings | AuthError:
        secret: Final = self.security.unseal(provider.encrypted_secret)
        if not secret or not provider.client_id:
            return AuthError("login_settings_unavailable", 503)
        return provider_from_credentials(provider.id, provider.client_id, secret)
