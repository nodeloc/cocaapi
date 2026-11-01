import os
import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import httpx
import httpx2
import pytest
import pytest_asyncio
from fastapi import FastAPI, Request, Response
from prisma import Prisma

from litellm.proxy.commerce.account_routes import get_service, get_oauth_client, router
from litellm.proxy.commerce.auth_service import AccountService
from litellm.proxy.commerce.config import AccountSettings, ProviderSettings
from litellm.models.commerce_auth import AuthError, ExternalIdentity, LoginResult
from litellm.proxy.commerce.security import AuthSecurity
from litellm.proxy.commerce.oauth_client import ProviderClient
from litellm.repositories.commerce_auth_repository import AccountRepository


NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
ORIGIN = "http://localhost:4400"


def github_upstream(request: httpx2.Request) -> httpx2.Response:
    if request.method == "POST":
        return httpx2.Response(200, json={"access_token": "external-token", "token_type": "Bearer"})
    if request.url.path == "/user/emails":
        return httpx2.Response(200, json=[{"email": "callback@example.com", "primary": True, "verified": True}])
    return httpx2.Response(200, json={"id": 777, "login": "callback-user"})


@pytest_asyncio.fixture
async def client():
    database = Prisma(datasource={"url": os.environ["COCAAPI_TEST_DATABASE_URL"]})
    await database.connect()
    migration = Path(os.environ["COCAAPI_AUTH_MIGRATION"]).read_text()
    for statement in migration.split(";"):
        if statement.strip():
            await database.execute_raw(statement)
    await database.execute_raw('TRUNCATE "CommerceCustomer" CASCADE')
    await database.execute_raw('TRUNCATE "CommerceAuthRateLimit"')
    await database.execute_raw("DELETE FROM \"LiteLLM_UserTable\" WHERE user_id LIKE 'commerce-%'")
    service = AccountService(
        AccountRepository(database),
        AccountSettings(
            public_url=ORIGIN,
            registration_enabled=True,
            secret="test-secret-" * 8,
            smtp_host="mail.example.test",
            smtp_from="noreply@example.test",
            providers=(
                ProviderSettings(
                    id="github",
                    label="GitHub",
                    client_id="test",
                    client_secret="test-secret",
                    issuer="https://github.com",
                ),
            ),
        ),
        clock=lambda: NOW,
    )
    app = FastAPI()

    @app.middleware("http")
    async def observe_callback_query(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = await call_next(request)
        if request.url.path.endswith("/callback"):
            response.headers["X-Observed-Query"] = request.scope["query_string"].decode()
        return response

    app.include_router(router)
    app.dependency_overrides[get_service] = lambda: service
    app.dependency_overrides[get_oauth_client] = lambda: ProviderClient(
        service.settings, service.security, httpx2.MockTransport(github_upstream)
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=ORIGIN, headers={"Origin": ORIGIN}
    ) as connection:
        yield connection, database, service
    await database.disconnect()


async def csrf(client: httpx.AsyncClient) -> str:
    response = await client.get("/account/api/v1/auth-methods")
    assert response.status_code == 200, response.text
    return response.json()["csrf_token"]


@pytest.mark.asyncio
async def test_registration_login_and_logout_use_one_unprivileged_account(client):
    connection, database, service = client
    token = await csrf(connection)
    response = await connection.post(
        "/account/api/v1/register",
        headers={"X-CSRF-Token": token},
        json={"email": " User@Example.com ", "password": "A-long-account-password-123!"},
    )
    assert response.status_code == 201, response.text
    users = await database.query_raw(
        'SELECT user_id, user_role, models, max_budget, password FROM "LiteLLM_UserTable" WHERE user_email=$1',
        "user@example.com",
    )
    assert len(users) == 1
    assert users[0]["user_role"] == "internal_user"
    assert users[0]["models"] == ["no-default-models"]
    assert users[0]["max_budget"] == 0
    assert users[0]["password"] is None
    login = await connection.post(
        "/account/api/v1/login",
        headers={"X-CSRF-Token": token},
        json={"email": "user@example.com", "password": "A-long-account-password-123!"},
    )
    assert login.status_code == 200, login.text
    assert "httponly" in login.headers["set-cookie"].lower()
    profile = await connection.get("/account/api/v1/me")
    assert profile.status_code == 200, profile.text
    assert profile.json()["user_id"] == users[0]["user_id"]
    assert profile.json()["email_verified"] is False
    assert "password" not in profile.json()
    assert "password_hash" not in profile.json()
    assert "scrypt:" not in profile.text
    logout = await connection.post("/account/api/v1/logout", headers={"X-CSRF-Token": profile.json()["csrf_token"]})
    assert logout.status_code == 200, logout.text
    assert (await connection.get("/account/api/v1/me")).status_code == 401


@pytest.mark.asyncio
async def test_registration_rejects_privilege_injection_and_cross_origin(client):
    connection, _, _ = client
    token = await csrf(connection)
    payload = {"email": "user@example.com", "password": "A-long-account-password-123!", "user_role": "proxy_admin"}
    response = await connection.post("/account/api/v1/register", headers={"X-CSRF-Token": token}, json=payload)
    assert response.status_code == 422
    invalid = await connection.post(
        "/account/api/v1/register",
        headers={"X-CSRF-Token": token},
        json={"email": "user@example.com", "password": "short!"},
    )
    assert invalid.status_code == 422
    assert "short!" not in invalid.text
    assert invalid.headers["Cache-Control"] == "no-store"
    response = await connection.get("/account/api/v1/auth-methods", headers={"Origin": "https://evil.test"})
    assert response.status_code == 403
    response = await connection.post(
        "/account/api/v1/register", json={"email": "user@example.com", "password": "A-long-account-password-123!"}
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_verification_token_is_single_use_and_bound_to_its_purpose(client):
    connection, database, service = client
    token = await csrf(connection)
    await connection.post(
        "/account/api/v1/register",
        headers={"X-CSRF-Token": token},
        json={"email": "verify@example.com", "password": "A-long-account-password-123!"},
    )
    messages = await database.query_raw('SELECT payload FROM "CommerceMailOutbox"')
    assert len(messages) == 1
    message = service.security.open_mail(messages[0]["payload"])
    assert message is not None
    reset = await connection.post(
        "/account/api/v1/reset-password",
        headers={"X-CSRF-Token": token},
        json={"token": message.token, "password": "Changed-account-password-123!"},
    )
    assert reset.status_code == 400
    verified = await connection.post(
        "/account/api/v1/verify-email", headers={"X-CSRF-Token": token}, json={"token": message.token}
    )
    assert verified.status_code == 200, verified.text
    repeated = await connection.post(
        "/account/api/v1/verify-email", headers={"X-CSRF-Token": token}, json={"token": message.token}
    )
    assert repeated.status_code == 400


@pytest.mark.asyncio
async def test_existing_internal_user_email_cannot_be_claimed(client):
    connection, database, _ = client
    await database.execute_raw(
        'INSERT INTO "LiteLLM_UserTable" (user_id,user_email,user_role,models) VALUES ($1,$2,$3,ARRAY[]::text[])',
        "commerce-test-admin",
        "admin@example.com",
        "proxy_admin",
    )
    token = await csrf(connection)
    response = await connection.post(
        "/account/api/v1/register",
        headers={"X-CSRF-Token": token},
        json={"email": "ADMIN@example.com", "password": "A-long-account-password-123!"},
    )
    assert response.status_code == 409
    rows = await database.query_raw(
        'SELECT user_role FROM "LiteLLM_UserTable" WHERE user_email=$1', "admin@example.com"
    )
    assert [row["user_role"] for row in rows] == ["proxy_admin"]


@pytest.mark.asyncio
async def test_oauth_state_is_browser_bound_and_atomically_single_use(client):
    _, _, service = client
    started = await service.start_flow("github", "original-browser", "login", None, "https://evil.test")
    assert not isinstance(started, AuthError)
    state, _ = started
    assert await service.take_flow("github", state, "other-browser") is None
    results = await asyncio.gather(
        service.take_flow("github", state, "original-browser"), service.take_flow("github", state, "original-browser")
    )
    assert sum(flow is not None for flow in results) == 1
    flow = next(flow for flow in results if flow is not None)
    assert flow.return_path == "/account/profile/"


@pytest.mark.asyncio
async def test_oauth_does_not_merge_by_email_and_requires_a_live_session_to_bind(client):
    _, database, service = client
    customer = await service.register("owner@example.com", "A-long-account-password-123!")
    assert not isinstance(customer, AuthError)
    identity = ExternalIdentity(
        issuer="https://github.com", subject="github-user-id", email="owner@example.com", email_verified=True
    )
    started = await service.start_flow("github", "browser", "login", None, "/account/profile/")
    assert not isinstance(started, AuthError)
    result = await service.finish_oauth(started[1], identity, None)
    assert isinstance(result, AuthError) and result.code == "email_in_use"
    login = await service.login("owner@example.com", "A-long-account-password-123!")
    assert isinstance(login, LoginResult)
    session = await service.session(login.token)
    assert session is not None
    refused = await service.start_flow("github", "browser", "link", session, "/account/security/")
    assert isinstance(refused, AuthError) and refused.code == "email_verification_required"
    messages = await database.query_raw('SELECT payload FROM "CommerceMailOutbox"')
    verification = service.security.open_mail(messages[0]["payload"])
    assert verification is not None
    assert await service.verify_email(verification.token)
    verified_session = await service.session(login.token)
    assert verified_session is not None
    session = verified_session
    linking = await service.start_flow("github", "browser", "link", session, "/account/security/")
    assert not isinstance(linking, AuthError)
    assert isinstance(await service.finish_oauth(linking[1], identity, None), AuthError)
    assert await service.finish_oauth(linking[1], identity, session) == "/account/security/"
    bindings = await service.store.bindings(customer.user_id)
    assert len(bindings) == 1
    removed = await service.unlink(session, bindings[0].id)
    assert removed is None
    await service.logout(login.token)
    other_identity = ExternalIdentity(issuer="https://github.com", subject="other-id")
    assert isinstance(await service.finish_oauth(linking[1], other_identity, session), AuthError)


@pytest.mark.asyncio
async def test_password_reset_revokes_all_sessions_and_cannot_be_replayed(client):
    connection, database, service = client
    customer = await service.register("reset@example.com", "A-long-account-password-123!")
    assert not isinstance(customer, AuthError)
    login = await service.login("reset@example.com", "A-long-account-password-123!")
    assert isinstance(login, LoginResult)
    await service.request_email("reset@example.com", "reset")
    rows = await database.query_raw('SELECT payload FROM "CommerceMailOutbox" ORDER BY id')
    payloads = tuple(service.security.open_mail(row["payload"]) for row in rows)
    reset = next(payload for payload in payloads if payload and payload.purpose == "reset")
    assert await service.reset_password(reset.token, "Changed-account-password-123!")
    assert await service.session(login.token) is None
    assert not await service.reset_password(reset.token, "Replay-account-password-123!")
    assert isinstance(await service.login("reset@example.com", "A-long-account-password-123!"), AuthError)
    assert isinstance(await service.login("reset@example.com", "Changed-account-password-123!"), LoginResult)


@pytest.mark.asyncio
async def test_mail_outbox_claims_once_and_skips_invalidated_verification(client):
    from litellm.repositories.commerce_auth_repository import MailRepository

    _, database, service = client
    customer = await service.register("mail@example.com", "A-long-account-password-123!")
    assert not isinstance(customer, AuthError)
    repository = MailRepository(database)
    claimed = await asyncio.gather(repository.claim(NOW), repository.claim(NOW))
    assert sum(job is not None for job in claimed) == 1
    job = next(job for job in claimed if job)
    payload = service.security.open_mail(job.payload)
    assert payload is not None
    assert await repository.valid(
        service.security.digest(payload.token, payload.purpose), payload.purpose, payload.email, NOW
    )
    await service.queue_email(customer, "verify")
    assert not await repository.valid(
        service.security.digest(payload.token, payload.purpose), payload.purpose, payload.email, NOW
    )


@pytest.mark.asyncio
async def test_reset_rejects_suspended_login_and_password_write_using_old_snapshot(client):
    _, database, service = client
    original = await service.register("race@example.com", "A-long-account-password-123!")
    assert not isinstance(original, AuthError)
    login = await service.login("race@example.com", "A-long-account-password-123!")
    assert isinstance(login, LoginResult)
    session = await service.session(login.token)
    assert session is not None
    await service.request_email("race@example.com", "reset")
    rows = await database.query_raw('SELECT payload FROM "CommerceMailOutbox"')
    messages = tuple(service.security.open_mail(row["payload"]) for row in rows)
    reset = next(message for message in messages if message and message.purpose == "reset")
    assert await service.reset_password(reset.token, "Reset-account-password-123!")
    assert not await service.store.save_session(original, "suspended-login", NOW + timedelta(days=7), NOW)
    assert not await service.store.set_password(session, "invalid-overwrite", NOW)
    assert isinstance(await service.login("race@example.com", "Reset-account-password-123!"), LoginResult)


@pytest.mark.asyncio
async def test_email_change_cannot_be_verified_with_old_address_token(client):
    _, database, service = client
    original = await service.register("old@example.com", "A-long-account-password-123!")
    assert not isinstance(original, AuthError)
    rows = await database.query_raw('SELECT payload FROM "CommerceMailOutbox"')
    verification = service.security.open_mail(rows[0]["payload"])
    assert verification is not None
    login = await service.new_session(original)
    assert isinstance(login, LoginResult)
    session = await service.session(login.token)
    assert session is not None
    changed = await service.store.set_email(session, "new@example.com", NOW)
    assert not isinstance(changed, AuthError)
    assert not await service.verify_email(verification.token)
    current = await service.store.get_customer(original.user_id)
    assert current is not None and current.email == "new@example.com" and not current.email_verified


@pytest.mark.asyncio
async def test_concurrent_registration_creates_one_customer_and_one_email(client):
    _, database, service = client
    results = await asyncio.gather(
        service.register("duplicate@example.com", "A-long-account-password-123!"),
        service.register("duplicate@example.com", "Another-account-password-123!"),
    )
    assert sum(not isinstance(result, AuthError) for result in results) == 1
    messages = await database.query_raw('SELECT id FROM "CommerceMailOutbox"')
    customers = await database.query_raw(
        'SELECT user_id FROM "CommerceCustomer" WHERE email_normalized=$1', "duplicate@example.com"
    )
    assert len(messages) == 1 and len(customers) == 1


@pytest.mark.asyncio
async def test_oauth_only_customer_cannot_remove_their_final_login_method(client):
    _, _, service = client
    identity = ExternalIdentity(
        issuer="https://github.com", subject="oauth-only", email="oauth@example.com", email_verified=True
    )
    customer = await service.store.create_customer(identity.email, None, True, identity, "github", NOW)
    assert not isinstance(customer, AuthError)
    login = await service.new_session(customer, identity=identity)
    assert isinstance(login, LoginResult)
    session = await service.session(login.token)
    assert session is not None
    bindings = await service.store.bindings(customer.user_id)
    refused = await service.unlink(session, bindings[0].id)
    assert isinstance(refused, AuthError)
    assert len(await service.store.bindings(customer.user_id)) == 1


@pytest.mark.asyncio
async def test_oauth_callback_sets_customer_cookie_and_rejects_replay(client):
    connection, _, _ = client
    token = await csrf(connection)
    started = await connection.post("/account/api/v1/oauth/github/start", headers={"X-CSRF-Token": token}, json={})
    assert started.status_code == 200
    state = parse_qs(urlsplit(started.json()["authorization_url"]).query)["state"][0]
    callback = await connection.get(
        "/account/api/v1/oauth/github/callback", params={"state": state, "code": "external-code"}
    )
    assert callback.status_code == 303
    assert callback.headers["location"] == "/account/profile/"
    assert callback.headers["X-Observed-Query"] == ""
    assert "httponly" in callback.headers["set-cookie"].lower()
    profile = await connection.get("/account/api/v1/me")
    assert profile.status_code == 200
    assert profile.json()["email"] == "callback@example.com"
    assert profile.json()["email_verified"]
    assert "external-token" not in profile.text
    replay = await connection.get(
        "/account/api/v1/oauth/github/callback", params={"state": state, "code": "external-code"}
    )
    assert replay.headers["location"] == "/account/login/?error=invalid_authorization"


@pytest.mark.asyncio
async def test_invalid_callback_redacts_authorization_code_before_access_logging(client):
    connection, _, _ = client
    response = await connection.get("/account/api/v1/oauth/unknown/callback?code=sensitive-code&state=state")
    assert response.status_code == 422
    assert response.headers["X-Observed-Query"] == ""
    assert "sensitive-code" not in response.text


async def wait_for_blocked_verifier(database: Prisma) -> None:
    while True:
        rows = await database.query_raw("""SELECT EXISTS (SELECT 1 FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event_type='Lock'
            AND query LIKE '%FOR UPDATE OF c%' AND query LIKE '%CommerceActionToken%') AS blocked""")
        if rows[0]["blocked"]:
            return


@pytest.mark.asyncio
async def test_verification_locks_customer_before_checking_email_during_concurrent_change(client):
    _, database, service = client
    customer = await service.register("locked-old@example.com", "A-long-account-password-123!")
    assert not isinstance(customer, AuthError)
    rows = await database.query_raw('SELECT payload FROM "CommerceMailOutbox"')
    payload = service.security.open_mail(rows[0]["payload"])
    assert payload is not None
    async with database.tx() as tx:
        await tx.query_raw('SELECT user_id FROM "CommerceCustomer" WHERE user_id=$1 FOR UPDATE', customer.user_id)
        verifying = asyncio.create_task(service.verify_email(payload.token))
        await asyncio.wait_for(wait_for_blocked_verifier(database), timeout=10)
        await tx.execute_raw(
            'UPDATE "CommerceCustomer" SET email_normalized=$2 WHERE user_id=$1',
            customer.user_id,
            "locked-new@example.com",
        )
        await tx.execute_raw(
            'UPDATE "LiteLLM_UserTable" SET user_email=$2 WHERE user_id=$1', customer.user_id, "locked-new@example.com"
        )
    assert not await verifying
    current = await service.store.get_customer(customer.user_id)
    assert current is not None and current.email == "locked-new@example.com" and not current.email_verified


@pytest.mark.asyncio
async def test_recovery_email_requires_fresh_live_session(client):
    _, database, service = client
    customer = await service.register("recovery-owner@example.com", "A-long-account-password-123!")
    assert not isinstance(customer, AuthError)
    login = await service.new_session(customer)
    assert isinstance(login, LoginResult)
    captured = await service.session(login.token)
    assert captured is not None
    await database.execute_raw(
        'UPDATE "CommerceSession" SET auth_at=$2::timestamptz WHERE token_hash=$1',
        captured.token_hash,
        NOW - timedelta(minutes=10),
    )
    stale = await service.session(login.token)
    assert stale is not None
    result = await service.complete_email(stale, "attacker@example.com")
    assert isinstance(result, AuthError) and result.code == "reauthentication_required"
    assert isinstance(await service.store.set_email(captured, "attacker@example.com", NOW), AuthError)
    fresh_login = await service.new_session(customer)
    assert isinstance(fresh_login, LoginResult)
    fresh_session = await service.session(fresh_login.token)
    assert fresh_session is not None
    await service.logout(fresh_login.token)
    assert isinstance(await service.store.set_email(fresh_session, "attacker@example.com", NOW), AuthError)
    current = await service.store.get_customer(customer.user_id)
    assert current is not None and current.email == "recovery-owner@example.com"
