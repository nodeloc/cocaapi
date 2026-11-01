import pytest
import pytest_asyncio
import asyncio
from pydantic import SecretStr
from prisma.errors import RawQueryError
import uuid

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_login_settings import LoginConfigurationInput, LoginConfigurationView
from litellm.proxy.commerce.account_routes import get_service
from litellm.proxy.commerce.auth_service import AccountService
from litellm.proxy.commerce.login_settings_service import LoginSettingsService
from litellm.proxy.commerce.config import provider_from_credentials
from litellm.repositories.commerce_login_settings_repository import LoginConfigurationRepository

from litellm.proxy._types import LitellmUserRoles, UserAPIKeyAuth
from litellm.proxy.auth.user_api_key_auth import user_api_key_auth


@pytest_asyncio.fixture(autouse=True)
async def reset_configuration(wallet_client):
    await wallet_client.database.execute_raw('DELETE FROM "CommerceLoginConfiguration"')
    yield
    await wallet_client.database.execute_raw('DELETE FROM "CommerceLoginConfiguration"')


def body(revision=0, *, enabled=True, secret="test-only-node-client-secret", clear=False):
    return {
        "revision": revision,
        "registration_enabled": True,
        "providers": [
            {
                "id": key,
                "enabled": enabled if key == "nodeloc" else False,
                "client_id": "node-client" if key == "nodeloc" else "",
                "client_secret": secret if key == "nodeloc" else None,
                "clear_secret": clear if key == "nodeloc" else False,
            }
            for key in ("github", "google", "nodeloc")
        ],
    }


def service(client):
    return LoginSettingsService(LoginConfigurationRepository(client.database), client.accounts.settings)


@pytest.mark.asyncio
async def test_admin_can_read_login_settings(wallet_client):
    wallet_client.app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(
        user_role=LitellmUserRoles.PROXY_ADMIN, user_id="settings-admin"
    )
    result = await wallet_client.http.get(
        "/commerce/admin/v1/login-settings", headers={"Authorization": "Bearer test-native-admin"}
    )
    assert result.status_code == 200
    assert result.json()["revision"] == 0
    assert result.json()["registration_enabled"] is False
    assert {item["id"] for item in result.json()["providers"]} == {"nodeloc", "github", "google"}
    assert result.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role", [LitellmUserRoles.INTERNAL_USER, LitellmUserRoles.PROXY_ADMIN_VIEW_ONLY, LitellmUserRoles.ORG_ADMIN]
)
async def test_login_credentials_are_restricted_to_full_proxy_admin(wallet_client, role):
    wallet_client.app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(
        user_role=role, user_id="restricted"
    )
    for method in ("GET", "PUT"):
        result = await wallet_client.http.request(
            method,
            "/commerce/admin/v1/login-settings",
            headers={"Authorization": "Bearer restricted"},
            json={} if method == "PUT" else None,
        )
        assert result.status_code == 403


@pytest.mark.asyncio
async def test_encrypted_save_preserves_blank_secret_and_supports_explicit_clear(wallet_client):
    settings = service(wallet_client)
    first = await settings.save(LoginConfigurationInput.model_validate(body()), "settings-admin")
    assert isinstance(first, LoginConfigurationView) and first.revision == 1
    public = first.model_dump_json()
    assert (
        "test-only-node-client-secret" not in public
        and "encrypted_secret" not in public
        and "client_secret" not in public
    )
    rows = await wallet_client.database.query_raw('SELECT payload FROM "CommerceLoginConfiguration"')
    assert "test-only-node-client-secret" not in rows[0]["payload"]
    retained = await settings.save(LoginConfigurationInput.model_validate(body(1, secret="")), "settings-admin")
    assert isinstance(retained, LoginConfigurationView)
    reloaded = await service(wallet_client).effective()
    assert not isinstance(reloaded, AuthError)
    assert reloaded.provider("nodeloc").client_secret.get_secret_value() == "test-only-node-client-secret"
    cleared = await settings.save(
        LoginConfigurationInput.model_validate(body(2, enabled=False, secret=None, clear=True)), "settings-admin"
    )
    assert isinstance(cleared, LoginConfigurationView)
    assert next(provider for provider in cleared.providers if provider.id == "nodeloc").secret_configured is False
    assert not (await service(wallet_client).effective()).providers


@pytest.mark.asyncio
async def test_configuration_changes_are_visible_to_independent_request_services(wallet_client):
    async def dynamic_accounts():
        current = await service(wallet_client).effective()
        assert not isinstance(current, AuthError)
        return AccountService(wallet_client.accounts.store, current)

    wallet_client.app.dependency_overrides[get_service] = dynamic_accounts
    assert (await wallet_client.http.get("/account/api/v1/auth-methods")).json()["providers"] == []
    result = await service(wallet_client).save(LoginConfigurationInput.model_validate(body()), "settings-admin")
    assert isinstance(result, LoginConfigurationView)
    options = (await wallet_client.http.get("/account/api/v1/auth-methods")).json()
    assert options["registration_enabled"] is True
    assert options["providers"] == [{"id": "nodeloc", "label": "NodeLoc"}]
    assert options["email_enabled"] is False


@pytest.mark.asyncio
async def test_concurrent_admin_updates_reject_stale_revision(wallet_client):
    settings = service(wallet_client)
    results = await asyncio.gather(
        settings.save(LoginConfigurationInput.model_validate(body()), "admin-a"),
        settings.save(LoginConfigurationInput.model_validate(body(enabled=False)), "admin-b"),
    )
    assert sum(isinstance(item, LoginConfigurationView) for item in results) == 1
    assert sum(isinstance(item, AuthError) and item.status == 409 for item in results) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("enabled", [True, False])
async def test_key_change_fails_closed_instead_of_restoring_environment_provider(wallet_client, enabled):
    settings = service(wallet_client)
    await settings.save(LoginConfigurationInput.model_validate(body(enabled=enabled)), "settings-admin")
    alternative = settings.base.model_copy(
        update={
            "secret": SecretStr("different-configuration-key-" * 4),
            "providers": (provider_from_credentials("github", "old-client", "old-secret"),),
        }
    )
    result = await LoginSettingsService(settings.store, alternative).effective()
    assert isinstance(result, AuthError) and result.code == "login_settings_unavailable"


@pytest.mark.asyncio
async def test_missing_secret_and_duplicate_providers_cannot_be_enabled(wallet_client):
    result = await service(wallet_client).save(
        LoginConfigurationInput.model_validate(body(secret=None)), "settings-admin"
    )
    assert isinstance(result, AuthError) and result.status == 422
    duplicate = body()
    duplicate["providers"][0]["id"] = "nodeloc"
    result = await service(wallet_client).save(LoginConfigurationInput.model_validate(duplicate), "settings-admin")
    assert isinstance(result, AuthError) and result.status == 422


@pytest.mark.asyncio
async def test_admin_write_never_echoes_secret_and_customer_cookie_cannot_write(wallet_client):
    response = await wallet_client.http.put("/commerce/admin/v1/login-settings", json=body())
    assert response.status_code == 401
    wallet_client.app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(
        user_role=LitellmUserRoles.PROXY_ADMIN, user_id="settings-admin"
    )
    headers = {"Authorization": "Bearer native-admin"}
    response = await wallet_client.http.put("/commerce/admin/v1/login-settings", headers=headers, json=body())
    assert response.status_code == 200
    assert "test-only-node-client-secret" not in response.text
    assert (
        "client_secret" not in (await wallet_client.http.get("/commerce/admin/v1/login-settings", headers=headers)).text
    )
    invalid = await wallet_client.http.put(
        "/commerce/admin/v1/login-settings", headers=headers, json={**body(1), "unexpected": "must-not-be-echoed"}
    )
    assert invalid.status_code == 422 and "must-not-be-echoed" not in invalid.text
    assert response.headers["referrer-policy"] == "no-referrer"


@pytest.mark.asyncio
async def test_database_disable_overrides_legacy_environment_credentials(wallet_client):
    base = wallet_client.accounts.settings.model_copy(
        update={"providers": (provider_from_credentials("github", "legacy-client", "legacy-secret"),)}
    )
    settings = LoginSettingsService(LoginConfigurationRepository(wallet_client.database), base)
    current = await settings.read()
    assert isinstance(current, LoginConfigurationView)
    assert next(provider for provider in current.providers if provider.id == "github").secret_configured
    request = body(enabled=False, secret=None)
    await settings.save(LoginConfigurationInput.model_validate(request), "settings-admin")
    effective = await LoginSettingsService(settings.store, base).effective()
    assert not isinstance(effective, AuthError) and effective.providers == ()


@pytest.mark.asyncio
async def test_failed_audit_write_rolls_back_settings(wallet_client):
    token = uuid.uuid4().hex
    await wallet_client.database.execute_raw(f"""CREATE FUNCTION login_reject_{token}() RETURNS TRIGGER LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END; $$""")
    await wallet_client.database.execute_raw(f"""CREATE TRIGGER login_reject_{token} BEFORE INSERT ON "CommerceAuditEvent"
        FOR EACH ROW WHEN (NEW.actor_id='{token}') EXECUTE FUNCTION login_reject_{token}()""")
    try:
        with pytest.raises(RawQueryError):
            await service(wallet_client).save(LoginConfigurationInput.model_validate(body()), token)
        assert await service(wallet_client).store.read() is None
    finally:
        await wallet_client.database.execute_raw(f'DROP TRIGGER login_reject_{token} ON "CommerceAuditEvent"')
        await wallet_client.database.execute_raw(f"DROP FUNCTION login_reject_{token}()")
