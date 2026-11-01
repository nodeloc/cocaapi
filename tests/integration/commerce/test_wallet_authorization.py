from typing import Final
from uuid import uuid4

import pytest

from litellm.proxy._types import LitellmUserRoles, UserAPIKeyAuth
from litellm.proxy.auth.user_api_key_auth import user_api_key_auth
from .conftest import WalletClient


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [LitellmUserRoles.INTERNAL_USER, LitellmUserRoles.PROXY_ADMIN_VIEW_ONLY, LitellmUserRoles.ORG_ADMIN])
async def test_only_full_proxy_admin_can_manage_financial_records(wallet_client: WalletClient, role: LitellmUserRoles) -> None:
    wallet_client.app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(user_role=role, user_id="non-admin")
    headers: Final = {"Authorization": "Bearer authenticated-test-user", "Idempotency-Key": str(uuid4())}
    response: Final = await wallet_client.http.get("/commerce/admin/v1/wallets", headers=headers)
    assert response.status_code == 403
    adjustment: Final = await wallet_client.http.post(f"/commerce/admin/v1/wallets/{wallet_client.session.customer.user_id}/adjustments",
        headers=headers, json={"amount_usd": "10", "direction": "credit", "reason": "禁止越权"})
    assert adjustment.status_code == 403
    balance: Final = await wallet_client.http.get("/account/api/v1/wallet")
    assert balance.json()["available_units"] == "0"


@pytest.mark.asyncio
async def test_even_native_admin_cookie_cannot_replace_explicit_bearer(wallet_client: WalletClient) -> None:
    wallet_client.app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(user_role=LitellmUserRoles.PROXY_ADMIN, user_id="integration-admin")
    response: Final = await wallet_client.http.get("/commerce/admin/v1/wallets")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_adjustment_replay_credits_once_and_requires_a_reason(wallet_client: WalletClient) -> None:
    wallet_client.app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(user_role=LitellmUserRoles.PROXY_ADMIN, user_id="integration-admin")
    headers: Final = {"Authorization": "Bearer test-native-admin", "Idempotency-Key": str(uuid4())}
    path: Final = f"/commerce/admin/v1/wallets/{wallet_client.session.customer.user_id}/adjustments"
    first: Final = await wallet_client.http.post(path, headers=headers, json={"amount_usd": "10.23", "direction": "credit", "reason": "人工补款"})
    repeated: Final = await wallet_client.http.post(path, headers=headers, json={"amount_usd": "10.23", "direction": "credit", "reason": "人工补款"})
    assert first.status_code == repeated.status_code == 200, first.text
    assert first.json() == repeated.json()
    balance: Final = await wallet_client.http.get("/account/api/v1/wallet")
    assert balance.json()["available_units"] == "10230000000"
    blank: Final = await wallet_client.http.post(path, headers={**headers, "Idempotency-Key": str(uuid4())},
        json={"amount_usd": "10", "direction": "credit", "reason": " "})
    assert blank.status_code == 422
