import asyncio
from collections.abc import AsyncIterator
from typing import Final
from uuid import uuid4

import pytest
import pytest_asyncio
from pydantic import TypeAdapter

from litellm.models.commerce_auth import AuthError, Customer, ExternalIdentity, LoginResult, MailPayload
from litellm.models.commerce_referrals import ReferralCodeView, ReferralSettingsInput, ReferralSettingsView
from litellm.models.commerce_wallet import MAX_UNITS
from litellm.proxy._types import LitellmUserRoles, UserAPIKeyAuth
from litellm.proxy.auth.user_api_key_auth import user_api_key_auth
from litellm.proxy.commerce.auth_service import AccountService
from litellm.proxy.commerce.config import provider_from_credentials
from litellm.proxy.commerce.referral_routes import admin_router, get_referral_repository, get_referral_settings, router
from litellm.repositories.commerce_referral_repository import ReferralRepository
from litellm.repositories.commerce_referral_settings_repository import ReferralSettingsRepository
from litellm.repositories.commerce_wallet_repository import WalletRepository, ensure_wallet

from .conftest import WalletClient


@pytest_asyncio.fixture(autouse=True)
async def referral_context(wallet_client: WalletClient) -> AsyncIterator[None]:
    await wallet_client.database.execute_raw('DELETE FROM "CommerceReferralConfiguration"')
    wallet_client.app.include_router(router)
    wallet_client.app.include_router(admin_router)
    wallet_client.app.dependency_overrides[get_referral_repository] = (  # rebind-ok: [LIT011] FastAPI override map
        lambda: ReferralRepository(wallet_client.database)
    )
    wallet_client.app.dependency_overrides[get_referral_settings] = (  # rebind-ok: [LIT011] FastAPI override map
        lambda: ReferralSettingsRepository(wallet_client.database)
    )
    yield
    await wallet_client.database.execute_raw('DELETE FROM "CommerceReferralConfiguration"')


async def configure(
    client: WalletClient, *, revision: int = 0, enabled: bool = True, inviter: str = "1.00", invitee: str = "2.00"
) -> ReferralSettingsView:
    result: Final = await ReferralSettingsRepository(client.database).save(
        ReferralSettingsInput(
            revision=revision, enabled=enabled, inviter_amount_usd=inviter, invitee_amount_usd=invitee
        ),
        "referral-admin",
        client.now,
    )
    assert not isinstance(result, AuthError)
    return result


async def code(client: WalletClient) -> str:
    result: Final = await ReferralRepository(client.database).issue_code(client.session, client.now)
    assert isinstance(result, ReferralCodeView)
    return result.code


async def invited_email(client: WalletClient, referral: str) -> tuple[Customer, str]:
    email: Final = f"referral-{uuid4().hex}@example.com"
    action: Final = client.accounts.email_action(email, "verify")
    customer: Final = await client.accounts.store.create_customer(
        email,
        None,
        False,
        None,
        None,
        client.now,
        action,
        referral_code=referral,
    )
    assert isinstance(customer, Customer)
    payload: Final = client.accounts.security.unseal(action.payload)
    assert payload is not None
    return customer, MailPayload.model_validate_json(payload).token


async def balance(client: WalletClient, user_id: str) -> int:
    result: Final = await WalletRepository(client.database).balance(user_id)
    assert not isinstance(result, AuthError)
    return result.available_units


@pytest.mark.asyncio
async def test_disabled_by_default_does_not_backfill_when_enabled_later(wallet_client: WalletClient) -> None:
    defaults: Final = await ReferralSettingsRepository(wallet_client.database).read()
    assert not isinstance(defaults, AuthError) and not defaults.enabled and defaults.revision == 0
    customer, token = await invited_email(wallet_client, await code(wallet_client))
    await configure(wallet_client)
    assert await wallet_client.accounts.verify_email(token)
    assert await balance(wallet_client, customer.user_id) == 0
    assert await balance(wallet_client, wallet_client.session.customer.user_id) == 0


@pytest.mark.asyncio
async def test_email_verification_grants_both_original_snapshot_amounts_once(wallet_client: WalletClient) -> None:
    original: Final = await configure(wallet_client)
    customer, token = await invited_email(wallet_client, await code(wallet_client))
    assert await balance(wallet_client, customer.user_id) == 0
    await configure(wallet_client, revision=1, enabled=False, inviter="8.00", invitee="9.00")
    verified: Final = await asyncio.gather(*(wallet_client.accounts.verify_email(token) for _ in range(4)))
    assert sum(verified) == 1
    assert await balance(wallet_client, wallet_client.session.customer.user_id) == original.inviter_units
    assert await balance(wallet_client, customer.user_id) == original.invitee_units
    rows: Final = await wallet_client.database.query_raw(
        'SELECT user_id,delta_units FROM "CommerceLedger" WHERE kind=$1 AND reference=$2',
        "referral",
        customer.user_id,
    )
    assert (
        len(rows) == 2
        and sum(TypeAdapter(int).validate_python(row["delta_units"]) for row in rows)
        == original.inviter_units + original.invitee_units
    )


@pytest.mark.asyncio
async def test_oauth_state_carries_invite_and_existing_identity_cannot_change_inviter(
    wallet_client: WalletClient,
) -> None:
    amounts: Final = await configure(wallet_client)
    referral: Final = await code(wallet_client)
    provider: Final = provider_from_credentials("github", "test-client", "test-secret")
    service: Final = AccountService(
        wallet_client.accounts.store,
        wallet_client.accounts.settings.model_copy(update={"registration_enabled": True, "providers": (provider,)}),
    )
    started: Final = await service.start_flow("github", "browser-test", "login", None, "/account/profile/", referral)
    assert not isinstance(started, AuthError)
    state, _ = started
    flow: Final = await service.take_flow("github", state, "browser-test")
    assert flow is not None
    identity: Final = ExternalIdentity(issuer=provider.issuer, subject=uuid4().hex, name="test")
    result: Final = await service.finish_oauth(flow, identity, None)
    assert isinstance(result, LoginResult)
    assert await balance(wallet_client, result.customer.user_id) == amounts.invitee_units
    other: Final = await ReferralRepository(wallet_client.database).issue_code(
        wallet_client.other_session, wallet_client.now
    )
    assert isinstance(other, ReferralCodeView)
    existing: Final = await service.store.create_customer(
        None,
        None,
        False,
        identity,
        "github",
        wallet_client.now,
        referral_code=other.code,
    )
    assert isinstance(existing, Customer) and existing.user_id == result.customer.user_id
    assert await balance(wallet_client, wallet_client.session.customer.user_id) == amounts.inviter_units
    assert await balance(wallet_client, wallet_client.other_session.customer.user_id) == 0
    assert await service.take_flow("github", state, "browser-test") is None


@pytest.mark.asyncio
async def test_second_wallet_failure_rolls_back_both_rewards_without_blocking_verification(
    wallet_client: WalletClient,
) -> None:
    amounts: Final = await configure(wallet_client)
    customer, token = await invited_email(wallet_client, await code(wallet_client))
    await ensure_wallet(wallet_client.database, customer.user_id)
    await wallet_client.database.execute_raw(
        'UPDATE "CommerceWallet" SET available_units=$2::bigint,credited_units=$2::bigint WHERE user_id=$1',
        customer.user_id,
        MAX_UNITS,
    )
    assert await wallet_client.accounts.verify_email(token)
    assert await balance(wallet_client, wallet_client.session.customer.user_id) == 0
    assert await balance(wallet_client, customer.user_id) == MAX_UNITS
    await wallet_client.database.execute_raw(
        'UPDATE "CommerceWallet" SET available_units=0,credited_units=0 WHERE user_id=$1',
        customer.user_id,
    )
    current: Final = await wallet_client.accounts.store.get_customer(customer.user_id)
    assert current is not None and current.email_verified
    assert isinstance(await wallet_client.accounts.new_session(current), LoginResult)
    assert await balance(wallet_client, wallet_client.session.customer.user_id) == amounts.inviter_units
    assert await balance(wallet_client, customer.user_id) == amounts.invitee_units


@pytest.mark.asyncio
async def test_invalid_code_does_not_leave_an_account_behind(wallet_client: WalletClient) -> None:
    email: Final = f"unknown-invite-{uuid4().hex}@example.com"
    result: Final = await wallet_client.accounts.store.create_customer(
        email,
        None,
        False,
        None,
        None,
        wallet_client.now,
        referral_code="unknown-referral-code",
    )
    assert isinstance(result, AuthError) and result.code == "invalid_referral_code"
    assert await wallet_client.accounts.store.find_customer(email) is None


@pytest.mark.asyncio
async def test_customer_cannot_configure_rewards_and_links_are_idempotent(wallet_client: WalletClient) -> None:
    for method in ("GET", "PUT"):
        denied: Final = await wallet_client.http.request(
            method, "/commerce/admin/v1/referral-settings", json={} if method == "PUT" else None
        )
        assert denied.status_code == 401
    first: Final = await wallet_client.http.post("/account/api/v1/referrals/code")
    second: Final = await wallet_client.http.post("/account/api/v1/referrals/code")
    assert first.status_code == second.status_code == 200 and first.json()["code"] == second.json()["code"]
    wallet_client.app.dependency_overrides[user_api_key_auth] = (  # rebind-ok: [LIT011] FastAPI override map
        lambda: UserAPIKeyAuth(user_role=LitellmUserRoles.PROXY_ADMIN_VIEW_ONLY, user_id="read-only")
    )
    view_only: Final = await wallet_client.http.get(
        "/commerce/admin/v1/referral-settings", headers={"Authorization": "Bearer read-only"}
    )
    assert view_only.status_code == 403


@pytest.mark.asyncio
async def test_settings_reject_stale_revision_and_enabling_zero_rewards(wallet_client: WalletClient) -> None:
    await configure(wallet_client)
    store: Final = ReferralSettingsRepository(wallet_client.database)
    stale: Final = await store.save(
        ReferralSettingsInput(revision=0, enabled=False, inviter_amount_usd="2", invitee_amount_usd="3"),
        "admin",
        wallet_client.now,
    )
    assert isinstance(stale, AuthError) and stale.status == 409
    invalid: Final = await store.save(
        ReferralSettingsInput(revision=1, enabled=True, inviter_amount_usd="0", invitee_amount_usd="0"),
        "admin",
        wallet_client.now,
    )
    assert isinstance(invalid, AuthError) and invalid.status == 422


@pytest.mark.asyncio
async def test_referral_summary_does_not_disclose_other_customers_or_email(wallet_client: WalletClient) -> None:
    await configure(wallet_client)
    customer, token = await invited_email(wallet_client, await code(wallet_client))
    assert await wallet_client.accounts.verify_email(token)
    own: Final = await wallet_client.http.get("/account/api/v1/referrals")
    assert own.status_code == 200 and own.json()["invited_count"] == 1
    assert customer.email is not None and customer.email not in own.text
    login: Final = await wallet_client.accounts.new_session(wallet_client.other_session.customer)
    assert isinstance(login, LoginResult)
    other: Final = await wallet_client.http.get(
        "/account/api/v1/referrals", headers={"Cookie": "coca_session=" + login.token}
    )
    assert other.status_code == 200 and other.json()["invited_count"] == 0 and other.json()["items"] == []


@pytest.mark.asyncio
@pytest.mark.parametrize("oauth", (False, True))
async def test_simultaneous_new_registrations_using_one_code_do_not_deadlock(
    wallet_client: WalletClient, oauth: bool
) -> None:
    amounts: Final = await configure(wallet_client)
    referral: Final = await code(wallet_client)
    tag: Final = uuid4().hex
    await wallet_client.database.execute_raw(
        f"CREATE FUNCTION referral_delay_{tag}() RETURNS TRIGGER LANGUAGE plpgsql AS "
        "$$ BEGIN PERFORM pg_sleep(0.5); RETURN NEW; END; $$"
    )
    await wallet_client.database.execute_raw(
        f'CREATE TRIGGER referral_delay_{tag} AFTER INSERT ON "CommerceReferral" '
        f"FOR EACH ROW EXECUTE FUNCTION referral_delay_{tag}()"
    )
    try:
        results: Final = await asyncio.gather(
            *(
                wallet_client.accounts.store.create_customer(
                    None if oauth else f"parallel-{uuid4().hex}@example.com",
                    None,
                    False,
                    ExternalIdentity(issuer="https://github.com", subject=uuid4().hex) if oauth else None,
                    "github" if oauth else None,
                    wallet_client.now,
                    referral_code=referral,
                )
                for _ in range(2)
            ),
            return_exceptions=True,
        )
        assert all(isinstance(result, Customer) for result in results)
        assert await balance(wallet_client, wallet_client.session.customer.user_id) == (
            amounts.inviter_units * 2 if oauth else 0
        )
    finally:
        await wallet_client.database.execute_raw(f'DROP TRIGGER referral_delay_{tag} ON "CommerceReferral"')
        await wallet_client.database.execute_raw(f"DROP FUNCTION referral_delay_{tag}()")
