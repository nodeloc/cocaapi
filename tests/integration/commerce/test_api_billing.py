import asyncio
import os
import time
import uuid
from contextlib import suppress
from decimal import Decimal
from typing import Final

import httpx
import pytest
from pydantic import SecretStr

from litellm.proxy._types import hash_token
from litellm.models.commerce_auth import AuthError, LoginResult
from litellm.proxy.commerce.auth_service import AccountService
from litellm.proxy.commerce.config import AccountSettings
from litellm.repositories.commerce_auth_repository import AccountRepository
from litellm.repositories.commerce_wallet_repository import WalletRepository

from .conftest import WalletClient
from .test_wallet_billing import fund


async def api_key(client: WalletClient, model: str = "wallet-priced-model") -> str:
    raw: Final = "sk-" + uuid.uuid4().hex
    await client.database.execute_raw(
        """UPDATE "LiteLLM_UserTable" SET models=ARRAY[$2],max_budget=100
        WHERE user_id=$1""",
        client.session.customer.user_id,
        model,
    )
    await client.database.execute_raw(
        """INSERT INTO "LiteLLM_VerificationToken" (token,user_id,models,key_type,allowed_routes)
        VALUES ($1,$2,ARRAY[$3],'llm_api',ARRAY['llm_api_routes'])""",
        hash_token(raw),
        client.session.customer.user_id,
        model,
    )
    return raw


@pytest.mark.asyncio
async def test_direct_api_zero_balance_never_reaches_the_provider(wallet_client: WalletClient) -> None:
    key: Final = await api_key(wallet_client)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        response: Final = await client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={"model": "wallet-priced-model", "messages": [{"role": "user", "content": "hello"}], "max_tokens": 64},
        )
    assert response.status_code == 402, response.text
    assert "insufficient_balance" in response.text


@pytest.mark.asyncio
async def test_direct_api_charges_native_cost_and_ignores_forged_owner_and_call_id(wallet_client: WalletClient) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 1_000_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        for _ in range(2):
            response: Final = await client.post(
                "/v1/chat/completions",
                headers={"Authorization": "Bearer " + key, "x-litellm-call-id": "repeated-client-controlled-id"},
                json={
                    "model": "wallet-priced-model",
                    "messages": [{"role": "user", "content": "hello"}],
                    "max_tokens": 64,
                    "user": wallet_client.other_session.customer.user_id,
                    "metadata": {
                        "_cocaapi_wallet_request": "forged",
                        "user_api_key_user_id": wallet_client.other_session.customer.user_id,
                    },
                },
            )
            assert response.status_code == 200, response.text
    store: Final = WalletRepository(wallet_client.database)
    balance: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    native_cost: Final = int(Decimal(response.headers["x-litellm-response-cost"]) * 1_000_000_000)
    assert balance.debited_units == native_cost * 2 and native_cost > 0
    assert balance.available_units == 1_000_000_000 - native_cost * 2 and balance.reserved_units == 0
    rows: Final = await store.transactions(wallet_client.session.customer.user_id, 100, 0)
    assert len(tuple(row for row in rows.items if row.kind == "usage")) == 2
    other: Final = await store.balance(wallet_client.other_session.customer.user_id)
    assert not isinstance(other, AuthError) and other.debited_units == 0


@pytest.mark.asyncio
async def test_positive_but_insufficient_balance_rejects_maximum_cost(wallet_client: WalletClient) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 10_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        response: Final = await client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={"model": "wallet-priced-model", "messages": [{"role": "user", "content": "hello"}], "max_tokens": 64},
        )
    assert response.status_code == 402, response.text
    balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError) and balance.available_units == 10_000_000 and balance.reserved_units == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("stream", (False, True))
async def test_provider_failure_releases_nonstream_cost_or_retains_stream_cost_for_review(
    wallet_client: WalletClient, stream: bool
) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 1_000_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        response: Final = await client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={
                "model": "wallet-priced-model",
                "messages": [{"role": "user", "content": "fail-before-response"}],
                "max_tokens": 64,
                "stream": stream,
            },
        )
    assert response.status_code >= 400
    balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    assert balance.debited_units == 0
    assert balance.available_units + balance.reserved_units == 1_000_000_000
    if stream:
        assert balance.reserved_units > 0
        rows: Final = await wallet_client.database.query_raw(
            'SELECT status FROM "CommerceCallReservation" WHERE user_id=$1 LIMIT 1',
            wallet_client.session.customer.user_id,
        )
        assert rows[0]["status"] == "review"
    else:
        assert balance.reserved_units == 0


@pytest.mark.asyncio
async def test_stream_completion_settles_once_and_refunds_unused_reservation(wallet_client: WalletClient) -> None:
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
                "stream": True,
                "stream_options": {"include_usage": True},
            },
        )
    assert response.status_code == 200 and "[DONE]" in response.text, response.text
    deadline: Final = time.monotonic() + 10
    store: Final = WalletRepository(wallet_client.database)
    while time.monotonic() < deadline:
        balance: Final = await store.balance(wallet_client.session.customer.user_id)
        assert not isinstance(balance, AuthError)
        if balance.reserved_units == 0:
            assert 0 < balance.debited_units < 1_000_000_000
            assert balance.available_units + balance.debited_units == 1_000_000_000
            return
        await asyncio.sleep(0.05)
    raise AssertionError("Completed stream did not settle its wallet reservation")


@pytest.mark.asyncio
async def test_customer_authorized_stream_delivers_before_completion_and_settles_once(
    wallet_client: WalletClient,
) -> None:
    key: Final = await api_key(wallet_client)
    await wallet_client.database.execute_raw('DELETE FROM "CommerceLoginConfiguration"')
    accounts: Final = AccountService(
        AccountRepository(wallet_client.database),
        AccountSettings(
            secret=SecretStr("billing-test-auth-secret-not-for-production-123456789"),
            public_url="http://localhost:4400",
        ),
    )
    login: Final = await accounts.new_session(wallet_client.session.customer)
    assert isinstance(login, LoginResult)
    auth: Final = {"Origin": "http://localhost:4400", "X-CSRF-Token": accounts.security.csrf(login.token)}
    payload: Final = {
        "model": "wallet-priced-model",
        "messages": [{"role": "user", "content": "delayed-stream"}],
        "max_tokens": 64,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    store: Final = WalletRepository(wallet_client.database)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        client.cookies.set("coca_session", login.token)
        preflight: Final = await client.post(
            "/account/api/v1/gateway/playground/authorize",
            json={"api_key": key, "model": payload["model"], "prompt": "delayed-stream", "max_tokens": 64},
            headers=auth,
        )
        assert preflight.status_code == 200, preflight.text
        denied: Final = await client.post(
            "/v1/chat/completions", json=payload, headers={"Authorization": "Bearer " + key}
        )
        assert denied.status_code == 402 and "insufficient_balance" in denied.text
        await fund(wallet_client, 1_000_000_000)
        async with client.stream(
            "POST", "/v1/chat/completions", json=payload, headers={"Authorization": "Bearer " + key}
        ) as response:
            assert response.status_code == 200
            lines: Final = response.aiter_lines()
            async for line in lines:
                if "Billing test response" in line:
                    break
            else:
                raise AssertionError("No incremental content arrived")
            first_at: Final = time.monotonic()
            during: Final = await store.balance(wallet_client.session.customer.user_id)
            assert not isinstance(during, AuthError) and during.reserved_units > 0 and during.debited_units == 0
            remaining: Final = tuple([line async for line in lines])
            assert any("[DONE]" in line for line in remaining)
            assert time.monotonic() - first_at > 1
    deadline: Final = time.monotonic() + 10
    while time.monotonic() < deadline:
        balance: Final = await store.balance(wallet_client.session.customer.user_id)
        assert not isinstance(balance, AuthError)
        if balance.reserved_units == 0:
            assert 0 < balance.debited_units < 1_000_000_000
            assert balance.available_units + balance.debited_units == 1_000_000_000
            rows: Final = await store.transactions(wallet_client.session.customer.user_id, 100, 0)
            assert len(tuple(row for row in rows.items if row.kind == "usage")) == 1
            return
        await asyncio.sleep(0.05)
    raise AssertionError("Authorized stream did not settle")


@pytest.mark.asyncio
@pytest.mark.parametrize("stream", (False, True))
async def test_provider_stated_cost_cannot_override_customer_platform_pricing(
    wallet_client: WalletClient, stream: bool
) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 1_000_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        response: Final = await client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={
                "model": "wallet-priced-model",
                "messages": [{"role": "user", "content": "priced-provider-cost"}],
                "max_tokens": 64,
                "stream": stream,
                "stream_options": {"include_usage": True} if stream else None,
            },
        )
        assert response.status_code == 200, response.text
    store: Final = WalletRepository(wallet_client.database)
    deadline: Final = time.monotonic() + 10
    while time.monotonic() < deadline:
        balance: Final = await store.balance(wallet_client.session.customer.user_id)
        assert not isinstance(balance, AuthError)
        if balance.reserved_units == 0:
            assert balance.debited_units == 17_000_000
            rows: Final = await store.transactions(wallet_client.session.customer.user_id, 100, 0)
            assert len(tuple(row for row in rows.items if row.kind == "usage")) == 1
            return
        await asyncio.sleep(0.05)
    raise AssertionError("Provider-cost request did not settle")


@pytest.mark.asyncio
async def test_batch_endpoint_cannot_bypass_wallet_billing(wallet_client: WalletClient) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 1_000_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        response: Final = await client.post(
            "/v1/batches",
            headers={"Authorization": "Bearer " + key},
            json={"input_file_id": "test-file", "endpoint": "/v1/chat/completions", "completion_window": "24h"},
        )
    assert response.status_code == 403 and "wallet_route_not_supported" in response.text, response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ("/v1/responses", "/v1/embeddings", "/v1/completions", "/v1/messages"))
async def test_supported_text_protocols_deduct_the_customer_wallet(wallet_client: WalletClient, endpoint: str) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 1_000_000_000)
    inputs: Final = (
        {"input": "hello"}
        if endpoint in {"/v1/responses", "/v1/embeddings"}
        else {"prompt": "hello"}
        if endpoint == "/v1/completions"
        else {"messages": [{"role": "user", "content": "hello"}]}
    )
    limits: Final = (
        {}
        if endpoint == "/v1/embeddings"
        else {"max_output_tokens" if endpoint == "/v1/responses" else "max_tokens": 32}
    )
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        response: Final = await client.post(
            endpoint,
            headers={"Authorization": "Bearer " + key, "anthropic-version": "2023-06-01"},
            json={"model": "wallet-priced-model", **inputs, **limits},
        )
    assert response.status_code == 200, response.text
    balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    assert balance.reserved_units == 0 and balance.debited_units > 0
    assert balance.available_units + balance.debited_units == 1_000_000_000


@pytest.mark.asyncio
@pytest.mark.parametrize("field,endpoint", (("system", "/v1/messages"), ("instructions", "/v1/responses")))
async def test_large_system_context_cannot_hide_billable_input(
    wallet_client: WalletClient, field: str, endpoint: str
) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 10_000_000)
    inputs: Final = (
        {"input": "hello"} if endpoint == "/v1/responses" else {"messages": [{"role": "user", "content": "hello"}]}
    )
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        response: Final = await client.post(
            endpoint,
            headers={"Authorization": "Bearer " + key, "anthropic-version": "2023-06-01"},
            json={
                "model": "wallet-priced-model",
                field: "large context " * 4000,
                **inputs,
                "max_output_tokens" if endpoint == "/v1/responses" else "max_tokens": 1,
            },
        )
    assert response.status_code == 402, response.text


@pytest.mark.asyncio
async def test_nested_max_tokens_cannot_replace_the_reserved_output_limit(wallet_client: WalletClient) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 50_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        response: Final = await client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={
                "model": "wallet-priced-model",
                "messages": [{"role": "user", "content": "hello"}],
                "max_tokens": 1,
                "extra_body": {"max_tokens": 4000},
            },
        )
    assert response.status_code in {400, 402}, response.text
    balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError) and balance.debited_units == 0


@pytest.mark.asyncio
async def test_two_workers_cannot_spend_one_wallet_concurrently(wallet_client: WalletClient) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 500_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:

        async def call() -> httpx.Response:
            return await client.post(
                "/v1/chat/completions",
                headers={"Authorization": "Bearer " + key},
                json={
                    "model": "wallet-priced-model",
                    "messages": [{"role": "user", "content": "delayed-response"}],
                    "max_tokens": 200,
                },
            )

        responses: Final = await asyncio.gather(call(), call())
    assert sorted(response.status_code for response in responses) == [200, 402]
    balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    assert balance.reserved_units == 0 and balance.available_units + balance.debited_units == 500_000_000


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "extra",
    (
        {"router_settings_override": {"default_litellm_params": {"max_tokens": 4000}}},
        {"model_info": {"input_cost_per_token": 0, "output_cost_per_token": 0}},
        {"service_tier": "priority"},
        {"speed": "fast"},
        {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "document", "source": {"type": "url", "url": "https://example.test/large.pdf"}}
                    ],
                }
            ]
        },
    ),
)
async def test_unpriced_client_overrides_are_rejected_before_provider(
    wallet_client: WalletClient, extra: dict[str, object]
) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 1_000_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        before: Final = await client.get("http://cocaapi-billing-test-upstream:9000")
        response: Final = await client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={
                "model": "wallet-priced-model",
                "messages": [{"role": "user", "content": "hello"}],
                "max_tokens": 1,
                **extra,
            },
        )
        after: Final = await client.get("http://cocaapi-billing-test-upstream:9000")
    assert response.status_code == 400, response.text
    assert before.json() == after.json()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "model,expected", (("wallet-with-fallback", 402), ("wallet-unpriced-model", 503), ("wallet-premium-model", 503))
)
async def test_unpriced_and_more_expensive_server_settings_fail_closed(
    wallet_client: WalletClient, model: str, expected: int
) -> None:
    key: Final = await api_key(wallet_client, model)
    await fund(wallet_client, 50_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        before: Final = await client.get("http://cocaapi-billing-test-upstream:9000")
        response: Final = await client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={"model": model, "messages": [{"role": "user", "content": "hello"}], "max_tokens": 1},
        )
        after: Final = await client.get("http://cocaapi-billing-test-upstream:9000")
    assert response.status_code == expected, response.text
    assert before.json() == after.json()


@pytest.mark.asyncio
async def test_client_disconnect_after_dispatch_does_not_refund_a_paid_request(wallet_client: WalletClient) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 1_000_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        before: Final = (await client.get("http://cocaapi-billing-test-upstream:9000")).json()["requests"]
        task: Final = asyncio.create_task(
            client.post(
                "/v1/chat/completions",
                headers={"Authorization": "Bearer " + key},
                json={
                    "model": "wallet-priced-model",
                    "messages": [{"role": "user", "content": "delayed-response"}],
                    "max_tokens": 64,
                },
            )
        )
        deadline: Final = time.monotonic() + 20
        while time.monotonic() < deadline:
            if (await client.get("http://cocaapi-billing-test-upstream:9000")).json()["requests"] > before:
                break
            await asyncio.sleep(0.05)
        else:
            raise AssertionError("Request never reached the upstream")
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    await asyncio.sleep(2)
    balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    assert balance.reserved_units + balance.debited_units > 0
    assert balance.available_units < 1_000_000_000


@pytest.mark.asyncio
async def test_partial_stream_is_not_refunded_as_a_free_provider_failure(wallet_client: WalletClient) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 1_000_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        response: Final = await client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={
                "model": "wallet-priced-model",
                "messages": [{"role": "user", "content": "fail-after-chunk"}],
                "max_tokens": 64,
                "stream": True,
                "stream_options": {"include_usage": True},
            },
        )
    assert "Billing test response" in response.text, response.text
    await asyncio.sleep(1)
    balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    assert balance.reserved_units + balance.debited_units > 0
    assert balance.available_units < 1_000_000_000


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ("/v1/responses", "/v1/messages"))
async def test_additional_text_stream_protocols_settle_the_hold(wallet_client: WalletClient, endpoint: str) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 1_000_000_000)
    inputs: Final = (
        {"input": "hello", "max_output_tokens": 32}
        if endpoint == "/v1/responses"
        else {"messages": [{"role": "user", "content": "hello"}], "max_tokens": 32}
    )
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        response: Final = await client.post(
            endpoint,
            headers={"Authorization": "Bearer " + key, "anthropic-version": "2023-06-01"},
            json={"model": "wallet-priced-model", **inputs, "stream": True},
        )
    assert response.status_code == 200, response.text
    deadline: Final = time.monotonic() + 10
    while time.monotonic() < deadline:
        balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
        assert not isinstance(balance, AuthError)
        if balance.reserved_units == 0:
            assert balance.debited_units > 0 and balance.available_units + balance.debited_units == 1_000_000_000
            return
        await asyncio.sleep(0.05)
    raise AssertionError("Completed stream did not settle")


@pytest.mark.asyncio
async def test_deferred_guardrail_reroute_must_cover_the_final_model_price(wallet_client: WalletClient) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 50_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        before: Final = await client.get("http://cocaapi-billing-test-upstream:9000")
        response: Final = await client.post(
            "/v1/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={
                "model": "wallet-priced-model",
                "messages": [{"role": "user", "content": "reroute-expensive"}],
                "max_tokens": 1,
            },
        )
        after: Final = await client.get("http://cocaapi-billing-test-upstream:9000")
    assert response.status_code == 402, response.text
    assert before.json() == after.json()
    balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError) and balance.available_units == 50_000_000 and balance.reserved_units == 0


@pytest.mark.asyncio
async def test_stream_disconnect_retains_hold_instead_of_settling_estimated_partial_cost(
    wallet_client: WalletClient,
) -> None:
    key: Final = await api_key(wallet_client)
    await fund(wallet_client, 1_000_000_000)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        async with client.stream(
            "POST",
            "/v1/chat/completions",
            headers={"Authorization": "Bearer " + key},
            json={
                "model": "wallet-priced-model",
                "messages": [{"role": "user", "content": "delayed-stream"}],
                "max_tokens": 64,
                "stream": True,
                "stream_options": {"include_usage": True},
            },
        ) as response:
            assert response.status_code == 200
            async for line in response.aiter_lines():
                if "Billing test response" in line:
                    break
            else:
                raise AssertionError("No provider output received before disconnect")
    await asyncio.sleep(3)
    balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError)
    assert balance.reserved_units > 0 and balance.debited_units == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("prompt,expected_status", (
    ("playground wallet billing", 200), ("invalid-playground-response", 502),
))
async def test_customer_playground_uses_the_same_wallet_and_returns_insufficient_balance(
    wallet_client: WalletClient, prompt: str, expected_status: int,
) -> None:
    key: Final = await api_key(wallet_client)
    await wallet_client.database.execute_raw('DELETE FROM "CommerceLoginConfiguration"')
    accounts: Final = AccountService(
        AccountRepository(wallet_client.database),
        AccountSettings(
            secret=SecretStr("billing-test-auth-secret-not-for-production-123456789"),
            public_url="http://localhost:4400",
        ),
    )
    login: Final = await accounts.new_session(wallet_client.session.customer)
    assert isinstance(login, LoginResult)
    async with httpx.AsyncClient(base_url=os.environ["COCAAPI_NATIVE_BILLING_URL"], timeout=30) as client:
        client.cookies.set("coca_session", login.token)
        methods: Final = await client.get("/account/api/v1/auth-methods")
        assert methods.status_code == 200, methods.text
        headers: Final = {"Origin": "http://localhost:4400", "X-CSRF-Token": methods.json()["csrf_token"]}
        payload: Final = {"api_key": key, "model": "wallet-priced-model", "prompt": prompt}
        denied: Final = await client.post("/account/api/v1/gateway/playground", headers=headers, json=payload)
        assert denied.status_code == 402 and "insufficient_balance" in denied.text, denied.text
        await fund(wallet_client, 2_000_000_000)
        insufficient: Final = await client.post("/account/api/v1/gateway/playground", headers=headers, json=payload)
        assert insufficient.status_code == 402 and "insufficient_balance" in insufficient.text, insufficient.text
        await fund(wallet_client, 8_000_000_000)
        response: Final = await client.post("/account/api/v1/gateway/playground", headers=headers, json=payload)
        assert response.status_code == expected_status, response.text
    balance: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError) and balance.reserved_units == 0
    if expected_status == 502:
        assert balance.debited_units == 0
    else:
        assert balance.debited_units > 0
        assert response.json()["content"] == "Billing test response"
    assert balance.available_units + balance.debited_units == 10_000_000_000
