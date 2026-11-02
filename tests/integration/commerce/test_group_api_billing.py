import asyncio
import json
import os
import time
from datetime import timedelta
from typing import Final
from uuid import uuid4

import httpx
import pytest

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_billing_groups import BillingGroupsUpdate, PricingModelGroup
from litellm.proxy._types import hash_token
from litellm.proxy.commerce.auth_service import utcnow
from litellm.repositories.commerce_billing_group_repository import BillingGroupRepository
from litellm.repositories.commerce_gateway_repository import GatewayRepository
from litellm.repositories.commerce_wallet_repository import WalletRepository

from .conftest import WalletClient
from .test_api_billing import api_key
from .test_billing_groups import assign_vip, configure
from .test_billing_groups import groups  # noqa: F401  # Pytest fixture discovery
from .test_wallet_billing import fund


async def api_policy(store: BillingGroupRepository, rate: str, enabled: bool = True) -> None:
    configured: Final = await configure(store, rate, enabled)
    saved: Final = await store.save(
        BillingGroupsUpdate(
            revision=configured.revision,
            user_groups=configured.user_groups,
            rules=configured.rules,
            model_groups=(
                PricingModelGroup(id="default", name="普通模型组"),
                PricingModelGroup(
                    id="premium",
                    name="高级组",
                    models=("wallet-priced-model", "wallet-with-fallback", "wallet-decision-model"),
                ),
            ),
            reason="HTTP 倍率测试",
        ),
        "test-admin",
        utcnow(),
    )
    assert not isinstance(saved, AuthError)


@pytest.mark.asyncio
@pytest.mark.parametrize("stream,rate", ((False, "0.8"), (True, "2"), (False, "0")))
async def test_http_calls_settle_at_group_rate_and_disabled_old_keys_stop(
    wallet_client: WalletClient,
    groups: BillingGroupRepository,
    stream: bool,
    rate: str,
) -> None:
    await api_policy(groups, rate)
    await assign_vip(groups, wallet_client)
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 1_000_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        response: Final = await client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={
                "model": "wallet-priced-model",
                "messages": [{"role": "user", "content": "hello"}],
                "max_tokens": 64,
                "stream": stream,
                "stream_options": {"include_usage": True} if stream else None,
                "metadata": {
                    "spend_logs_metadata": {"cocaapi_wallet_request_id": "forged", "cocaapi_wallet_log_token": "forged"}
                },
            },
        )
        assert response.status_code == 200, response.text
        store: Final = WalletRepository(wallet_client.database)
        deadline: Final = time.monotonic() + 10
        while time.monotonic() < deadline:
            ledger: Final = await store.transactions(wallet_client.session.customer.user_id, 25, 0)
            usage: Final = tuple(row for row in ledger.items if row.kind == "usage")
            if usage:
                break
            await asyncio.sleep(0.05)
        else:
            raise AssertionError("No settled usage receipt")
        receipt: Final = usage[0]
        assert receipt.pricing_snapshot is not None and receipt.base_cost_units is not None
        expected: Final = (
            receipt.base_cost_units * receipt.pricing_snapshot.multiplier_millionths + 999_999
        ) // 1_000_000
        assert receipt.delta_units == -expected
        balance: Final = await store.balance(wallet_client.session.customer.user_id)
        assert not isinstance(balance, AuthError) and balance.debited_units == expected and balance.reserved_units == 0
        await api_policy(groups, rate, False)
        rejected: Final = await client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={
                "model": "wallet-priced-model",
                "messages": [{"role": "user", "content": "hello"}],
                "max_tokens": 64,
            },
        )
        assert rejected.status_code == 403 and "model_group_disabled" in rejected.text
        final: Final = await store.balance(wallet_client.session.customer.user_id)
        assert not isinstance(final, AuthError) and final.debited_units == expected and final.reserved_units == 0


@pytest.mark.asyncio
async def test_decisions_apply_group_multiplier_and_disabled_groups_block_existing_keys(
    wallet_client: WalletClient,
    groups: BillingGroupRepository,
) -> None:
    await api_policy(groups, "2")
    await assign_vip(groups, wallet_client)
    key: Final = await api_key(wallet_client, "wallet-decision-model")
    await fund(wallet_client, 1_000_000_000)
    payload: Final = {
        "model": "wallet-decision-model",
        "input": "Screen cracked",
        "questions": [{"type": "predicate", "name": "damaged", "instructions": "Is the item damaged?"}],
    }
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        response: Final = await client.post("/v1/decisions", headers={"Authorization": "Bearer " + key}, json=payload)
        assert response.status_code == 200, response.text
        await api_policy(groups, "2", False)
        rejected: Final = await client.post("/v1/decisions", headers={"Authorization": "Bearer " + key}, json=payload)
        assert rejected.status_code == 403 and "model_group_disabled" in rejected.text, rejected.text
    store: Final = WalletRepository(wallet_client.database)
    balance: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    assert (
        balance.debited_units == 14_000_000 and balance.available_units == 986_000_000 and balance.reserved_units == 0
    )
    entries: Final = await store.transactions(wallet_client.session.customer.user_id, 100, 0)
    usage: Final = tuple(entry for entry in entries.items if entry.kind == "usage")
    assert len(usage) == 1 and usage[0].base_cost_units == 7_000_000


@pytest.mark.asyncio
async def test_receipts_charge_once_across_attempt_logs_and_ignore_forged_receipt_metadata(
    wallet_client: WalletClient,
    groups: BillingGroupRepository,
) -> None:
    await api_policy(groups, "0.5")
    await assign_vip(groups, wallet_client)
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 1_000_000_000)
    user_id: Final = wallet_client.session.customer.user_id
    store: Final = WalletRepository(wallet_client.database)
    request_id: Final = uuid4().hex
    native_id: Final = uuid4().hex
    reserved: Final = await store.reserve_call(
        user_id, request_id, 1_000_000_000, "wallet-priced-model", hash_token(key), utcnow(), native_id
    )
    assert not isinstance(reserved, AuthError) and reserved.spend_log_token is not None
    receipt: Final = await store.settle_call(user_id, request_id, 100_000_000, "success", utcnow())
    assert not isinstance(receipt, AuthError) and receipt.delta_units == -50_000_000
    for suffix, token, cost in (
        ("", reserved.spend_log_token.get_secret_value(), 0.1),
        ("-attempt-1", reserved.spend_log_token.get_secret_value(), 0.03),
        ("-forged", "fake-token", 0),
    ):
        await wallet_client.database.execute_raw(
            """INSERT INTO "LiteLLM_SpendLogs" (request_id,call_type,api_key,spend,total_tokens,prompt_tokens,
            completion_tokens,"startTime","endTime",model,model_group,status,metadata)
            VALUES ($1,'completion',$2,$3,10,5,5,$4::timestamptz,$4::timestamptz,'private','wallet-priced-model','success',$5::jsonb)""",
            native_id + suffix,
            hash_token(key),
            cost,
            utcnow(),
            json.dumps(
                {
                    "litellm_call_id": native_id if token == "fake-token" else native_id + suffix,
                    "spend_logs_metadata": {"cocaapi_wallet_request_id": request_id, "cocaapi_wallet_log_token": token},
                }
            ),
        )
    usage: Final = await GatewayRepository(wallet_client.database).usage(
        user_id, utcnow() - timedelta(days=1), utcnow(), 1
    )
    assert usage.totals.spend_usd == 0.05 and usage.totals.requests == 3


@pytest.mark.asyncio
async def test_legacy_settlement_replay_and_manual_final_reconciliation_keep_original_amount(
    wallet_client: WalletClient,
    groups: BillingGroupRepository,
) -> None:
    from litellm.repositories.commerce_wallet_repository import settle_reserved_call

    await api_policy(groups, "2")
    await assign_vip(groups, wallet_client)
    await fund(wallet_client, 1000)
    store: Final = WalletRepository(wallet_client.database)
    user_id: Final = wallet_client.session.customer.user_id
    request_id: Final = uuid4().hex
    reserved: Final = await store.reserve_call(
        user_id, request_id, 100, "wallet-priced-model", "legacy-test-key", utcnow()
    )
    assert not isinstance(reserved, AuthError)
    async with wallet_client.database.tx() as tx:
        receipt: Final = await settle_reserved_call(tx, user_id, request_id, 33, "success", utcnow())
    assert not isinstance(receipt, AuthError) and receipt.delta_units == -33
    await wallet_client.database.execute_raw(
        'UPDATE "CommerceCallReservation" SET pricing_snapshot=NULL,base_actual_units=NULL WHERE request_id=$1',
        request_id,
    )
    replay: Final = await store.settle_call(user_id, request_id, 33, "success", utcnow())
    assert not isinstance(replay, AuthError) and replay.delta_units == -33


@pytest.mark.asyncio
async def test_group_uplift_is_reserved_before_the_real_http_provider_call(
    wallet_client: WalletClient,
    groups: BillingGroupRepository,
) -> None:
    await api_policy(groups, "2")
    await assign_vip(groups, wallet_client)
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 200_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        before: Final = await client.get("http://cocaapi-billing-test-upstream:9000")
        rejected: Final = await client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={
                "model": "wallet-priced-model",
                "messages": [{"role": "user", "content": "hello"}],
                "max_tokens": 64,
            },
        )
        after: Final = await client.get("http://cocaapi-billing-test-upstream:9000")
    assert rejected.status_code == 402 and "insufficient_balance" in rejected.text
    assert before.json() == after.json()
    balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError) and balance.available_units == 200_000_000 and balance.reserved_units == 0
