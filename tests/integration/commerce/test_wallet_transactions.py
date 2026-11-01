import pytest
import asyncio
import uuid
from typing import Final

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_wallet import MAX_UNITS, WalletChange
from litellm.repositories.commerce_wallet_repository import WalletRepository

from .conftest import WalletClient


@pytest.mark.asyncio
async def test_customer_starts_with_zero_wallet_balance(wallet_client: WalletClient) -> None:
    response = await wallet_client.http.get("/account/api/v1/wallet")
    assert response.status_code == 200, response.text
    assert response.json()["available_units"] == "0"
    assert response.json()["credited_units"] == "0"
    assert response.json()["currency"] == "USD"
    rows = await wallet_client.database.query_raw('SELECT max_budget,models FROM "LiteLLM_UserTable" WHERE user_id=$1', wallet_client.session.customer.user_id)
    assert rows[0]["max_budget"] == 0
    assert rows[0]["models"] == ["no-default-models"]


@pytest.mark.asyncio
async def test_adjustment_is_idempotent_and_changed_replay_is_rejected(wallet_client: WalletClient) -> None:
    store: Final = WalletRepository(wallet_client.database)
    change: Final = WalletChange(user_id=wallet_client.session.customer.user_id, delta_units=5_500_000_000,
                                kind="adjustment", business_key=uuid.uuid4().hex, reference="test-adjustment",
                                actor_id="test-admin", reason="test-credit", now=wallet_client.now)
    results: Final = await asyncio.gather(store.adjust(change), store.adjust(change))
    assert results[0] == results[1]
    mismatch: Final = await store.adjust(change.model_copy(update={"delta_units": 9_000_000_000}))
    assert isinstance(mismatch, AuthError) and mismatch.code == "idempotency_conflict"
    wallet: Final = await store.balance(change.user_id)
    assert not isinstance(wallet, AuthError) and wallet.available_units == 5_500_000_000
    assert len((await store.transactions(change.user_id, 100, 0)).items) == 1


@pytest.mark.asyncio
async def test_balance_cannot_become_negative_or_overflow_and_ledger_stays_exact(wallet_client: WalletClient) -> None:
    store: Final = WalletRepository(wallet_client.database)
    change: Final = WalletChange(user_id=wallet_client.session.customer.user_id, delta_units=MAX_UNITS - 1,
                                kind="adjustment", business_key=uuid.uuid4().hex, reference="test-adjustment",
                                actor_id="test-admin", reason="test-credit", now=wallet_client.now)
    result: Final = await store.adjust(change)
    assert not isinstance(result, AuthError) and result.available_after == MAX_UNITS - 1
    overflow: Final = await store.adjust(change.model_copy(update={"business_key": uuid.uuid4().hex, "delta_units": 2}))
    negative: Final = await store.adjust(change.model_copy(update={"business_key": uuid.uuid4().hex, "delta_units": -MAX_UNITS}))
    assert isinstance(overflow, AuthError) and overflow.code == "balance_limit_reached"
    assert isinstance(negative, AuthError) and negative.code == "insufficient_balance"
    response: Final = await wallet_client.http.get("/account/api/v1/wallet")
    assert response.json()["available_units"] == "9223372036854775806"
    rows: Final = await store.transactions(change.user_id, 100, 0)
    assert len(rows.items) == 1
    assert rows.items[0].delta_units == MAX_UNITS - 1
