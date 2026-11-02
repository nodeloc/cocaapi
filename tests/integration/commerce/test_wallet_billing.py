import asyncio
import uuid
from datetime import timedelta
from typing import Final

import pytest
import httpx
from fastapi import HTTPException
from openai import APIStatusError
from litellm import ModelResponse

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_wallet import CallReservation, WalletChange
from litellm.repositories.commerce_wallet_repository import WalletRepository
from litellm.proxy._types import UserAPIKeyAuth
from litellm.proxy.commerce.billing_hook import BillingContext, WalletBillingHook, _CONTEXT
from litellm.proxy.commerce.billing_reconcile import reconcile_call

from .conftest import WalletClient


async def fund(client: WalletClient, units: int) -> None:
    result: Final = await WalletRepository(client.database).adjust(
        WalletChange(
            user_id=client.session.customer.user_id,
            delta_units=units,
            kind="adjustment",
            business_key=uuid.uuid4().hex,
            reference="billing-test",
            actor_id="test-admin",
            reason="test-credit",
            now=client.now,
        )
    )
    assert not isinstance(result, AuthError)


async def reserve(client: WalletClient, units: int, request_id: str) -> CallReservation | AuthError:
    return await WalletRepository(client.database).reserve_call(
        user_id=client.session.customer.user_id,
        request_id=request_id,
        reserved_units=units,
        model="billing-test-model",
        key_hash="test-key-hash",
        now=client.now,
    )


@pytest.mark.asyncio
async def test_zero_balance_cannot_reserve_a_call(wallet_client: WalletClient) -> None:
    result: Final = await reserve(wallet_client, 1, uuid.uuid4().hex)
    assert isinstance(result, AuthError) and result.code == "insufficient_balance" and result.status == 402


@pytest.mark.asyncio
async def test_cache_hit_releases_hold_without_charging_the_original_response_cost(wallet_client: WalletClient) -> None:
    await fund(wallet_client, 1_000_000_000)
    request_id: Final = uuid.uuid4().hex
    await reserve(wallet_client, 500_000_000, request_id)
    store: Final = WalletRepository(wallet_client.database)
    context: Final = BillingContext(wallet_client.session.customer.user_id, request_id, "native-cache-test", store)
    response: Final = ModelResponse()
    response._hidden_params.update({"cache_hit": True, "response_cost": 0.25})
    token: Final = _CONTEXT.set(context)
    try:
        await WalletBillingHook().async_post_call_success_hook(
            {},
            UserAPIKeyAuth(user_id=wallet_client.session.customer.user_id),
            response,
        )
    finally:
        _CONTEXT.reset(token)
    balance: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    assert balance.available_units == 1_000_000_000 and balance.reserved_units == 0 and balance.debited_units == 0


@pytest.mark.asyncio
async def test_concurrent_calls_cannot_reserve_the_same_balance(wallet_client: WalletClient) -> None:
    await fund(wallet_client, 10_000_000_000)
    results: Final = await asyncio.gather(
        reserve(wallet_client, 6_000_000_000, uuid.uuid4().hex),
        reserve(wallet_client, 6_000_000_000, uuid.uuid4().hex),
    )
    assert sum(isinstance(result, AuthError) for result in results) == 1
    balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    assert balance.available_units == 4_000_000_000 and balance.reserved_units == 6_000_000_000


@pytest.mark.asyncio
async def test_reviewed_old_hold_settles_and_audits_once(wallet_client: WalletClient) -> None:
    await fund(wallet_client, 10_000_000_000)
    request_id: Final = uuid.uuid4().hex
    store: Final = WalletRepository(wallet_client.database)
    await store.reserve_call(
        wallet_client.session.customer.user_id,
        request_id,
        6_000_000_000,
        "test-model",
        "test-key-hash",
        wallet_client.now - timedelta(hours=2),
    )
    first: Final = await reconcile_call(
        wallet_client.database,
        request_id,
        3_000_000_000,
        "test-admin",
        "verified native and provider cost",
        wallet_client.now,
    )
    duplicate: Final = await reconcile_call(
        wallet_client.database,
        request_id,
        3_000_000_000,
        "test-admin",
        "verified native and provider cost",
        wallet_client.now,
    )
    assert not isinstance(first, AuthError) and first == duplicate
    balance: Final = await store.balance(wallet_client.session.customer.user_id)
    assert (
        not isinstance(balance, AuthError) and balance.available_units == 7_000_000_000 and balance.reserved_units == 0
    )
    audit: Final = await wallet_client.database.query_raw(
        'SELECT id FROM "CommerceAuditEvent" WHERE target_id=$1', request_id
    )
    assert len(audit) == 1


@pytest.mark.asyncio
async def test_reconciliation_will_not_release_a_recent_inflight_request(wallet_client: WalletClient) -> None:
    await fund(wallet_client, 10_000_000_000)
    request_id: Final = uuid.uuid4().hex
    await reserve(wallet_client, 6_000_000_000, request_id)
    result: Final = await reconcile_call(
        wallet_client.database, request_id, 0, "test-admin", "not old enough", wallet_client.now
    )
    assert isinstance(result, AuthError) and result.code == "call_still_recent"
    balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError) and balance.reserved_units == 6_000_000_000


@pytest.mark.asyncio
async def test_final_deployment_quote_can_only_increase_a_hold_with_available_funds(
    wallet_client: WalletClient,
) -> None:
    await fund(wallet_client, 10_000_000_000)
    request_id: Final = uuid.uuid4().hex
    await reserve(wallet_client, 6_000_000_000, request_id)
    store: Final = WalletRepository(wallet_client.database)
    assert (
        await store.authorize_deployment(
            wallet_client.session.customer.user_id, request_id, 8_000_000_000, wallet_client.now
        )
        is None
    )
    assert (
        await store.authorize_deployment(
            wallet_client.session.customer.user_id, request_id, 7_000_000_000, wallet_client.now
        )
        is None
    )
    denied: Final = await store.authorize_deployment(
        wallet_client.session.customer.user_id, request_id, 11_000_000_000, wallet_client.now
    )
    assert isinstance(denied, AuthError) and denied.code == "insufficient_balance"
    balance: Final = await store.balance(wallet_client.session.customer.user_id)
    assert (
        not isinstance(balance, AuthError)
        and balance.available_units == 2_000_000_000
        and balance.reserved_units == 8_000_000_000
    )
    await store.release_undispatched_call(wallet_client.session.customer.user_id, request_id, wallet_client.now)
    restored: Final = await store.balance(wallet_client.session.customer.user_id)
    assert (
        not isinstance(restored, AuthError)
        and restored.available_units == 2_000_000_000
        and restored.reserved_units == 8_000_000_000
    )


@pytest.mark.asyncio
async def test_actual_cost_releases_difference_and_duplicate_settlement_is_idempotent(
    wallet_client: WalletClient,
) -> None:
    await fund(wallet_client, 10_000_000_000)
    request_id: Final = uuid.uuid4().hex
    assert not isinstance(await reserve(wallet_client, 6_000_000_000, request_id), AuthError)
    store: Final = WalletRepository(wallet_client.database)
    results: Final = await asyncio.gather(
        store.settle_call(
            wallet_client.session.customer.user_id, request_id, 3_000_000_000, "success", wallet_client.now
        ),
        store.settle_call(
            wallet_client.session.customer.user_id, request_id, 3_000_000_000, "success", wallet_client.now
        ),
    )
    assert results[0] == results[1] and not isinstance(results[0], AuthError)
    balance: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    assert balance.available_units == 7_000_000_000 and balance.reserved_units == 0
    assert balance.debited_units == 3_000_000_000
    ledger: Final = await store.transactions(wallet_client.session.customer.user_id, 100, 0)
    assert len(tuple(entry for entry in ledger.items if entry.kind == "usage")) == 1


@pytest.mark.asyncio
async def test_failure_releases_hold_and_other_customer_cannot_settle_it(wallet_client: WalletClient) -> None:
    await fund(wallet_client, 10_000_000_000)
    request_id: Final = uuid.uuid4().hex
    await reserve(wallet_client, 6_000_000_000, request_id)
    store: Final = WalletRepository(wallet_client.database)
    denied: Final = await store.settle_call(
        wallet_client.other_session.customer.user_id, request_id, 0, "failure", wallet_client.now
    )
    assert isinstance(denied, AuthError) and denied.status == 404
    result: Final = await store.settle_call(
        wallet_client.session.customer.user_id, request_id, 0, "failure", wallet_client.now
    )
    assert not isinstance(result, AuthError)
    balance: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    assert balance.available_units == 10_000_000_000 and balance.reserved_units == 0 and balance.debited_units == 0


@pytest.mark.asyncio
async def test_unexpected_overage_blocks_calls_and_recharge_repays_debt(wallet_client: WalletClient) -> None:
    await fund(wallet_client, 10_000_000_000)
    request_id: Final = uuid.uuid4().hex
    await reserve(wallet_client, 5_000_000_000, request_id)
    store: Final = WalletRepository(wallet_client.database)
    result: Final = await store.settle_call(
        wallet_client.session.customer.user_id, request_id, 12_000_000_000, "success", wallet_client.now
    )
    assert not isinstance(result, AuthError)
    balance: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    assert balance.available_units == 0 and balance.debt_units == 2_000_000_000
    assert isinstance(await reserve(wallet_client, 1, uuid.uuid4().hex), AuthError)
    await fund(wallet_client, 1_000_000_000)
    partial: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(partial, AuthError)
    assert partial.debt_units == 1_000_000_000 and partial.available_units == 0
    await fund(wallet_client, 4_000_000_000)
    repaid: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(repaid, AuthError)
    assert repaid.debt_units == 0 and repaid.available_units == 3_000_000_000


@pytest.mark.asyncio
async def test_reservation_survives_new_repository_and_changed_replays_cannot_change_its_cost(
    wallet_client: WalletClient,
) -> None:
    await fund(wallet_client, 10_000_000_000)
    request_id: Final = uuid.uuid4().hex
    await reserve(wallet_client, 6_000_000_000, request_id)
    duplicate: Final = await reserve(wallet_client, 1, request_id)
    assert isinstance(duplicate, AuthError) and duplicate.code == "idempotency_conflict"
    store: Final = WalletRepository(wallet_client.database)
    balance: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError) and balance.reserved_units == 6_000_000_000
    await store.settle_call(
        wallet_client.session.customer.user_id, request_id, 3_000_000_000, "success", wallet_client.now
    )
    changed: Final = await store.settle_call(
        wallet_client.session.customer.user_id, request_id, 0, "failure", wallet_client.now
    )
    assert isinstance(changed, AuthError) and changed.code == "idempotency_conflict"


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ("disconnect", "partial-stream", "post-call-guardrail"))
async def test_uncertain_paid_failures_do_not_refund_the_entire_hold(wallet_client: WalletClient, kind: str) -> None:
    await fund(wallet_client, 10_000_000_000)
    request_id: Final = uuid.uuid4().hex
    await reserve(wallet_client, 6_000_000_000, request_id)
    store: Final = WalletRepository(wallet_client.database)
    await store.mark_call_dispatched(wallet_client.session.customer.user_id, request_id, wallet_client.now)
    context: Final = BillingContext(
        user_id=wallet_client.session.customer.user_id,
        request_id=request_id,
        native_request_id="native-test",
        store=store,
        output_started=kind == "partial-stream",
    )
    exception: Final = (
        APIStatusError(
            "scripted stream failure",
            response=httpx.Response(503, request=httpx.Request("POST", "https://provider.example")),
            body={},
        )
        if kind == "partial-stream"
        else HTTPException(499 if kind == "disconnect" else 403, detail="scripted failure")
    )
    token: Final = _CONTEXT.set(context)
    try:
        await WalletBillingHook().async_post_call_failure_hook(
            request_data={},
            original_exception=exception,
            user_api_key_dict=UserAPIKeyAuth(user_id=wallet_client.session.customer.user_id),
        )
    finally:
        _CONTEXT.reset(token)
    balance: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    assert balance.available_units == 4_000_000_000 and balance.reserved_units == 6_000_000_000
