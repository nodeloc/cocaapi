import os
from collections.abc import Callable, Mapping
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Final

from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from pydantic import SecretStr, ValidationError

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_payment_settings import (
    EffectivePaymentConfiguration,
    PaymentConfiguration,
    PaymentConfigurationInput,
    PaymentConfigurationRecord,
    PaymentConfigurationStore,
    PaymentConfigurationView,
)
from litellm.proxy.commerce.auth_service import utcnow
from litellm.proxy.commerce.config import AccountSettings
from litellm.proxy.commerce.goepay_protocol import GoepaySignature
from litellm.proxy.commerce.security import AuthSecurity


@lru_cache(maxsize=8)
def valid_payment_key(value: SecretStr, *, private: bool) -> bool:
    content: Final = value.get_secret_value()
    if not content:
        return True
    try:
        key: Final = (
            serialization.load_pem_private_key(content.encode(), password=None)
            if private
            else serialization.load_pem_public_key(content.encode())
        )
    except (ValueError, TypeError, UnsupportedAlgorithm):
        return False
    expected: Final = rsa.RSAPrivateKey if private else rsa.RSAPublicKey
    return isinstance(key, expected) and key.key_size >= 2048


def file_key(path: str) -> SecretStr:
    try:
        with Path(path).open("rb") as source:
            value: Final = source.read(16_385)
        return SecretStr(value.decode() if len(value) <= 16_384 else "")
    except (OSError, UnicodeError):
        return SecretStr("")


def payment_defaults(values: Mapping[str, str] = os.environ) -> EffectivePaymentConfiguration:
    return EffectivePaymentConfiguration(
        enabled=values.get("COCAAPI_GOEPAY_ENABLED", "").lower() == "true",
        origin=values.get("COCAAPI_GOEPAY_ORIGIN", ""),
        merchant_id=values.get("COCAAPI_GOEPAY_MERCHANT_ID", ""),
        private_key=file_key(values.get("COCAAPI_GOEPAY_PRIVATE_KEY_FILE", "/run/cocaapi-payments/merchant.pem")),
        public_key=file_key(values.get("COCAAPI_GOEPAY_PUBLIC_KEY_FILE", "/run/cocaapi-payments/platform.pem")),
    )


@lru_cache(maxsize=4)
def payment_signature(private: SecretStr, public: SecretStr) -> GoepaySignature | AuthError:
    return GoepaySignature.from_pem(private.get_secret_value().encode(), public.get_secret_value().encode())


class PaymentSettingsService:
    def __init__(
        self,
        store: PaymentConfigurationStore,
        base: AccountSettings,
        defaults: EffectivePaymentConfiguration | None = None,
        clock: Callable[[], datetime] = utcnow,
    ) -> None:
        self.store = store
        self.base = base
        self.defaults = defaults
        self.security = AuthSecurity(base.secret.get_secret_value())
        self.clock = clock

    def seal(self, value: str, purpose: str) -> str:
        return self.security.seal(purpose + ":" + value) if value else ""

    def unseal(self, value: str, purpose: str) -> str | AuthError:
        if not value:
            return ""
        decoded: Final = self.security.unseal(value)
        if decoded is None or not decoded.startswith(purpose + ":"):
            return AuthError("payment_settings_unavailable", 503)
        return decoded[len(purpose) + 1 :]

    def configuration(self, record: PaymentConfigurationRecord | None) -> PaymentConfiguration | AuthError:
        if record is not None:
            try:
                return PaymentConfiguration.model_validate_json(record.payload)
            except ValidationError:
                return AuthError("payment_settings_unavailable", 503)
        defaults: Final = self.defaults if self.defaults is not None else payment_defaults()
        return PaymentConfiguration(
            enabled=defaults.enabled,
            origin=defaults.origin,
            merchant_id=defaults.merchant_id,
            encrypted_private_key=self.seal(defaults.private_key.get_secret_value(), "payment-private"),
            encrypted_public_key=self.seal(defaults.public_key.get_secret_value(), "payment-public"),
        )

    def resolve(self, config: PaymentConfiguration) -> EffectivePaymentConfiguration | AuthError:
        private: Final = self.unseal(config.encrypted_private_key, "payment-private")
        public: Final = self.unseal(config.encrypted_public_key, "payment-public")
        if isinstance(private, AuthError) or isinstance(public, AuthError):
            return AuthError("payment_settings_unavailable", 503)
        try:
            coordinates: Final = PaymentConfigurationInput(
                revision=0, enabled=config.enabled, origin=config.origin, merchant_id=config.merchant_id
            )
        except ValidationError:
            return AuthError("payment_settings_unavailable", 503)
        if not valid_payment_key(SecretStr(private), private=True) or not valid_payment_key(
            SecretStr(public), private=False
        ):
            return AuthError("payment_settings_unavailable", 503)
        if config.enabled and not all((coordinates.origin, coordinates.merchant_id, private, public)):
            return AuthError("payment_credentials_required", 422)
        return EffectivePaymentConfiguration(
            enabled=config.enabled,
            origin=coordinates.origin,
            merchant_id=coordinates.merchant_id,
            private_key=SecretStr(private),
            public_key=SecretStr(public),
        )

    def view(self, config: PaymentConfiguration, record: PaymentConfigurationRecord | None) -> PaymentConfigurationView:
        return PaymentConfigurationView(
            revision=record.revision if record else 0,
            enabled=config.enabled,
            origin=config.origin,
            merchant_id=config.merchant_id,
            private_key_configured=bool(config.encrypted_private_key),
            public_key_configured=bool(config.encrypted_public_key),
            notify_url=self.base.public_url + "/commerce/webhooks/goepay",
            return_url=self.base.public_url + "/account/orders/",
            updated_at=record.updated_at if record else None,
        )

    async def read(self) -> PaymentConfigurationView | AuthError:
        record: Final = await self.store.read()
        if isinstance(record, AuthError):
            return record
        config: Final = self.configuration(record)
        return config if isinstance(config, AuthError) else self.view(config, record)

    def updated_key(self, previous: str, value: SecretStr | None, clear: bool, purpose: str) -> str | AuthError:
        supplied: Final = value.get_secret_value().strip() if value else ""
        if clear and supplied:
            return AuthError("invalid_payment_settings", 422)
        if not valid_payment_key(SecretStr(supplied), private=purpose == "payment-private"):
            return AuthError("invalid_payment_key", 422)
        return "" if clear else self.seal(supplied, purpose) if supplied else previous

    async def save(self, body: PaymentConfigurationInput, actor_id: str) -> PaymentConfigurationView | AuthError:
        record: Final = await self.store.read()
        if isinstance(record, AuthError):
            return record
        current: Final = self.configuration(record)
        if isinstance(current, AuthError):
            return current
        private: Final = self.updated_key(
            current.encrypted_private_key, body.private_key, body.clear_private_key, "payment-private"
        )
        public: Final = self.updated_key(
            current.encrypted_public_key, body.public_key, body.clear_public_key, "payment-public"
        )
        if isinstance(private, AuthError):
            return private
        if isinstance(public, AuthError):
            return public
        config: Final = PaymentConfiguration(
            enabled=body.enabled,
            origin=body.origin,
            merchant_id=body.merchant_id,
            encrypted_private_key=private,
            encrypted_public_key=public,
        )
        effective: Final = self.resolve(config)
        if isinstance(effective, AuthError):
            return effective
        saved: Final = await self.store.save(config.model_dump_json(), body.revision, actor_id, self.clock())
        return saved if isinstance(saved, AuthError) else self.view(config, saved)

    async def effective(self) -> EffectivePaymentConfiguration | AuthError:
        record: Final = await self.store.read()
        if isinstance(record, AuthError):
            return record
        config: Final = self.configuration(record)
        return config if isinstance(config, AuthError) else self.resolve(config)
