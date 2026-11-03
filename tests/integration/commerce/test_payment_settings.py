import asyncio
import json
from collections.abc import AsyncIterator, Mapping
from typing import Final, TypeAlias

import pytest
import pytest_asyncio
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from pydantic import SecretStr

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_payment_settings import EffectivePaymentConfiguration, PaymentConfigurationInput
from litellm.proxy._types import LitellmUserRoles, UserAPIKeyAuth
from litellm.proxy.auth.user_api_key_auth import user_api_key_auth
from litellm.proxy.commerce.goepay_gateway import GoepayGateway
from litellm.proxy.commerce.payment_gateway import UnconfiguredGateway
from litellm.proxy.commerce.payment_routes import get_gateway, get_payment_settings_service
from litellm.proxy.commerce.payment_settings_service import PaymentSettingsService
from litellm.repositories.commerce_payment_settings_repository import PaymentConfigurationRepository

from .conftest import WalletClient

SettingsContext: TypeAlias = tuple[PaymentSettingsService, EffectivePaymentConfiguration]


@pytest_asyncio.fixture(autouse=True)
async def settings_context(wallet_client: WalletClient) -> AsyncIterator[SettingsContext]:
    await wallet_client.database.execute_raw('DELETE FROM "CommercePaymentConfiguration"')
    merchant: Final = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    platform: Final = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private: Final = merchant.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    public: Final = (
        platform.public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )
    defaults: Final = EffectivePaymentConfiguration(
        enabled=False,
        origin="https://payments.example.com",
        merchant_id="123",
        private_key=SecretStr(private),
        public_key=SecretStr(public),
    )
    settings: Final = PaymentSettingsService(
        PaymentConfigurationRepository(wallet_client.database), wallet_client.accounts.settings, defaults
    )
    wallet_client.app.dependency_overrides[get_payment_settings_service] = (  # rebind-ok: [LIT011] FastAPI override map
        lambda: settings
    )
    yield settings, defaults
    await wallet_client.database.execute_raw('DELETE FROM "CommercePaymentConfiguration"')


def admin(client: WalletClient, role: LitellmUserRoles = LitellmUserRoles.PROXY_ADMIN) -> Mapping[str, str]:
    client.app.dependency_overrides[user_api_key_auth] = (  # rebind-ok: [LIT011] FastAPI override map
        lambda: UserAPIKeyAuth(user_role=role, user_id="payment-admin")
    )
    return {"Authorization": "Bearer native-test-admin"}


def request_body(
    revision: int = 0,
    *,
    enabled: bool = False,
    origin: str = "https://payments.example.com",
    merchant_id: str = "123",
    private_key: str | None = None,
    public_key: str | None = None,
    clear_private_key: bool = False,
    clear_public_key: bool = False,
) -> Mapping[str, object]:
    return {
        "revision": revision,
        "enabled": enabled,
        "origin": origin,
        "merchant_id": merchant_id,
        "private_key": private_key,
        "public_key": public_key,
        "clear_private_key": clear_private_key,
        "clear_public_key": clear_public_key,
    }


@pytest.mark.asyncio
async def test_admin_imports_existing_credentials_without_echoing_keys(
    wallet_client: WalletClient, settings_context: SettingsContext
) -> None:
    settings, defaults = settings_context
    headers: Final = admin(wallet_client)
    response: Final = await wallet_client.http.get("/commerce/admin/v1/payment-settings", headers=headers)
    assert response.status_code == 200
    assert response.json()["private_key_configured"] and response.json()["public_key_configured"]
    assert response.json()["enabled"] is False and response.json()["revision"] == 0
    saved: Final = await wallet_client.http.put(
        "/commerce/admin/v1/payment-settings", headers=headers, json=request_body()
    )
    assert saved.status_code == 200 and saved.json()["revision"] == 1
    record: Final = await settings.store.read()
    assert record is not None and not isinstance(record, AuthError)
    audit: Final = await wallet_client.database.query_raw(
        'SELECT * FROM "CommerceAuditEvent" WHERE actor_id=$1', "payment-admin"
    )
    for private in (defaults.private_key.get_secret_value(), defaults.public_key.get_secret_value()):
        assert private not in saved.text and private not in record.payload and private not in str(audit)
    assert "encrypted_" not in saved.text and "BEGIN" not in response.text
    assert saved.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_blank_retains_keys_and_clear_never_restores_environment(
    wallet_client: WalletClient, settings_context: SettingsContext
) -> None:
    settings, defaults = settings_context
    enabled: Final = await settings.save(
        PaymentConfigurationInput.model_validate(request_body(enabled=True)), "payment-admin"
    )
    assert not isinstance(enabled, AuthError) and enabled.enabled
    retained: Final = await settings.save(
        PaymentConfigurationInput.model_validate(request_body(1, private_key=" \n ", public_key="")), "payment-admin"
    )
    assert not isinstance(retained, AuthError)
    independent: Final = PaymentSettingsService(settings.store, settings.base, defaults)
    effective: Final = await independent.effective()
    assert not isinstance(effective, AuthError) and effective.private_key == defaults.private_key
    cleared: Final = await settings.save(
        PaymentConfigurationInput.model_validate(request_body(2, clear_private_key=True)), "payment-admin"
    )
    assert not isinstance(cleared, AuthError) and not cleared.private_key_configured
    after_clear: Final = await independent.effective()
    assert (
        not isinstance(after_clear, AuthError)
        and not after_clear.enabled
        and not after_clear.private_key.get_secret_value()
    )
    failed: Final = await settings.save(
        PaymentConfigurationInput.model_validate(request_body(3, enabled=True)), "payment-admin"
    )
    assert isinstance(failed, AuthError) and failed.status == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role", [LitellmUserRoles.INTERNAL_USER, LitellmUserRoles.PROXY_ADMIN_VIEW_ONLY, LitellmUserRoles.ORG_ADMIN]
)
async def test_non_admin_cannot_read_or_change_payment_credentials(
    wallet_client: WalletClient, settings_context: SettingsContext, role: LitellmUserRoles
) -> None:
    headers: Final = admin(wallet_client, role)
    for method in ("GET", "PUT"):
        response: Final = await wallet_client.http.request(
            method,
            "/commerce/admin/v1/payment-settings",
            headers=headers,
            json=request_body() if method == "PUT" else None,
        )
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_customer_cookie_cannot_read_or_change_credentials(
    wallet_client: WalletClient, settings_context: SettingsContext
) -> None:
    for method in ("GET", "PUT"):
        response: Final = await wallet_client.http.request(
            method, "/commerce/admin/v1/payment-settings", json=request_body() if method == "PUT" else None
        )
        assert response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "changes",
    [
        {"origin": "http://payments.example.com"},
        {"origin": "https://payments.example.com/path"},
        {"origin": "https://user:secret@payments.example.com"},
        {"origin": "https://payments.example.com:notaport"},
        {"origin": "https://payments.example.com:99999"},
        {"origin": "https://payments.example.com:0"},
        {"merchant_id": "invalid"},
        {"private_key": "secret-invalid-pem"},
        {"public_key": "secret-invalid-public"},
        {"enabled": True, "clear_private_key": True},
        {"clear_private_key": True, "private_key": "secret-conflicting-input"},
    ],
)
async def test_invalid_credentials_are_rejected_without_input_echo(
    wallet_client: WalletClient, settings_context: SettingsContext, changes: Mapping[str, object]
) -> None:
    response: Final = await wallet_client.http.put(
        "/commerce/admin/v1/payment-settings", headers=admin(wallet_client), json={**request_body(), **changes}
    )
    assert response.status_code == 422
    assert "secret-" not in response.text and "user:secret" not in response.text
    assert await settings_context[0].store.read() is None


@pytest.mark.asyncio
async def test_stale_writes_cannot_overwrite_other_admin_changes(
    wallet_client: WalletClient, settings_context: SettingsContext
) -> None:
    settings, _ = settings_context
    results: Final = await asyncio.gather(
        *(
            settings.save(PaymentConfigurationInput.model_validate(request_body(merchant_id=value)), "payment-admin")
            for value in ("123", "456")
        )
    )
    assert sum(not isinstance(result, AuthError) for result in results) == 1
    assert sum(isinstance(result, AuthError) and result.status == 409 for result in results) == 1


@pytest.mark.asyncio
async def test_wrong_encryption_key_and_corrupt_records_fail_closed(
    wallet_client: WalletClient, settings_context: SettingsContext
) -> None:
    settings, defaults = settings_context
    saved: Final = await settings.save(PaymentConfigurationInput.model_validate(request_body()), "payment-admin")
    assert not isinstance(saved, AuthError)
    other: Final = PaymentSettingsService(
        settings.store, settings.base.model_copy(update={"secret": SecretStr("other-secret-" * 8)}), defaults
    )
    wrong: Final = await other.effective()
    assert isinstance(wrong, AuthError) and wrong.code == "payment_settings_unavailable"
    await wallet_client.database.execute_raw(
        'UPDATE "CommercePaymentConfiguration" SET payload=$1', json.dumps({"bad": "payload"})
    )
    corrupt: Final = await settings.effective()
    assert isinstance(corrupt, AuthError) and corrupt.code == "payment_settings_unavailable"


@pytest.mark.asyncio
async def test_key_rotation_is_immediate_and_wrong_key_type_is_rejected(
    wallet_client: WalletClient, settings_context: SettingsContext
) -> None:
    settings, defaults = settings_context
    headers: Final = admin(wallet_client)
    wrong: Final = await wallet_client.http.put(
        "/commerce/admin/v1/payment-settings",
        headers=headers,
        json=request_body(private_key=defaults.public_key.get_secret_value()),
    )
    assert wrong.status_code == 422
    replacement: Final = (
        rsa.generate_private_key(public_exponent=65537, key_size=2048)
        .private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        .decode()
    )
    saved: Final = await settings.save(
        PaymentConfigurationInput.model_validate(request_body(private_key=replacement)), "payment-admin"
    )
    assert not isinstance(saved, AuthError)
    fresh: Final = await PaymentSettingsService(settings.store, settings.base, defaults).effective()
    assert not isinstance(fresh, AuthError) and fresh.private_key.get_secret_value() == replacement.strip()


@pytest.mark.asyncio
async def test_gateway_uses_saved_configuration_then_stops_after_disabling(
    wallet_client: WalletClient, settings_context: SettingsContext
) -> None:
    settings, _ = settings_context
    saved: Final = await settings.save(
        PaymentConfigurationInput.model_validate(
            request_body(enabled=True, origin="https://replacement.example.com", merchant_id="456")
        ),
        "payment-admin",
    )
    assert not isinstance(saved, AuthError)
    gateway: Final = await get_gateway(wallet_client.accounts, settings, wallet_client.database)
    assert isinstance(gateway, GoepayGateway)
    assert gateway.checkout_origins == (saved.origin,) and gateway.merchant_account_id == saved.merchant_id
    disabled: Final = await settings.save(PaymentConfigurationInput.model_validate(request_body(1)), "payment-admin")
    assert not isinstance(disabled, AuthError)
    assert isinstance(await get_gateway(wallet_client.accounts, settings, wallet_client.database), UnconfiguredGateway)


@pytest.mark.asyncio
async def test_clearing_both_keys_allows_a_disabled_draft(
    wallet_client: WalletClient, settings_context: SettingsContext
) -> None:
    settings, _ = settings_context
    saved: Final = await settings.save(
        PaymentConfigurationInput.model_validate(
            request_body(origin="", merchant_id="", clear_private_key=True, clear_public_key=True)
        ),
        "payment-admin",
    )
    assert not isinstance(saved, AuthError) and not saved.enabled
    assert not saved.private_key_configured and not saved.public_key_configured
    enabled: Final = await settings.save(
        PaymentConfigurationInput.model_validate(request_body(1, enabled=True)), "payment-admin"
    )
    assert isinstance(enabled, AuthError) and enabled.code == "payment_credentials_required"
