import asyncio
from typing import Final

import httpx
import pytest
from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_gateway import PlaygroundInput
from litellm.proxy._types import UserAPIKeyAuth
from litellm.proxy.common_utils.user_api_key_cache import UserApiKeyCache
from pydantic import SecretStr

from litellm.proxy.commerce.native_gateway import LocalNativeGateway, billing_rejection, playground_response_error


@pytest.mark.asyncio
async def test_customer_key_delete_evicts_a_previously_authenticated_token() -> None:
    token = "a" * 64
    cache = UserApiKeyCache()
    cache.set_cache(token, UserAPIKeyAuth(user_id="customer-a"), model_type=UserAPIKeyAuth)
    gateway: Final = LocalNativeGateway(
        httpx.MockTransport(lambda request: httpx.Response(200, json={"deleted_keys": [token]})),
        SecretStr("server-only-master"),
        key_cache=cache,
    )
    result = await gateway.delete_key(token, "customer-a")
    assert result is None
    assert cache.get_cache(token, model_type=UserAPIKeyAuth) is None


def test_native_wallet_rejection_preserves_the_public_balance_error() -> None:
    response = httpx.Response(402, json={"error": {"message": "insufficient_balance"}})
    result = billing_rejection(response)
    assert result is not None and result.status == 402 and result.code == "insufficient_balance"


def test_unrelated_provider_errors_are_not_misreported_as_customer_balance_errors() -> None:
    response = httpx.Response(402, json={"error": {"message": "Provider billing rejected the request"}})
    assert billing_rejection(response) is None


@pytest.mark.asyncio
async def test_playground_accepts_extended_native_usage_without_exposing_provider_fields() -> None:
    gateway: Final = LocalNativeGateway(
        httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={
                    "id": "completion-example",
                    "choices": [{"message": {"role": "assistant", "content": "OK"}}],
                    "usage": {
                        "prompt_tokens": 11,
                        "completion_tokens": 2,
                        "total_tokens": 13,
                        "prompt_tokens_details": {"cached_tokens": 1},
                        "completion_tokens_details": {"reasoning_tokens": 0},
                        "cost": 0,
                        "is_byok": False,
                    },
                },
            )
        ),
        SecretStr("server-only-master"),
    )
    result: Final = await gateway.chat(
        PlaygroundInput(api_key=SecretStr("sk-test-only-personal-key"), model="priced-model", prompt="hello")
    )
    assert not isinstance(result, AuthError)
    assert result.content == "OK" and result.request_id == "completion-example"
    assert result.usage is not None
    assert result.model_dump()["usage"] == {"prompt_tokens": 11, "completion_tokens": 2, "total_tokens": 13}


@pytest.mark.asyncio
async def test_playground_response_validation_does_not_leak_to_concurrent_direct_requests() -> None:
    entered: Final = asyncio.Event()
    finish: Final = asyncio.Event()

    async def respond(request: httpx.Request) -> httpx.Response:
        assert isinstance(playground_response_error({"choices": []}), AuthError)
        entered.set()
        await finish.wait()
        return httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}]})

    gateway: Final = LocalNativeGateway(httpx.MockTransport(respond), SecretStr("server-only-master"))
    pending: Final = asyncio.create_task(
        gateway.chat(
            PlaygroundInput(api_key=SecretStr("sk-test-only-personal-key"), model="priced-model", prompt="hello")
        )
    )
    try:
        await asyncio.wait_for(entered.wait(), timeout=5)
        assert playground_response_error({"choices": []}) is None
    finally:
        finish.set()
    result: Final = await pending
    assert not isinstance(result, AuthError) and result.content == "OK"
    assert playground_response_error({"choices": []}) is None
