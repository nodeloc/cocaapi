import asyncio
import json
from typing import Final

import httpx
import pytest
from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_gateway import PlaygroundInput
from litellm.proxy._types import UserAPIKeyAuth
from litellm.proxy.common_utils.user_api_key_cache import UserApiKeyCache
from pydantic import SecretStr
from pydantic import ValidationError

from litellm.proxy.commerce.native_gateway import LocalNativeGateway, billing_rejection, playground_response_error


@pytest.mark.asyncio
@pytest.mark.parametrize("limit", (None, 8192))
async def test_playground_uses_a_bounded_default_and_preserves_the_selected_output_limit(limit: int | None) -> None:
    async def respond(request: httpx.Request) -> httpx.Response:
        body: Final = json.loads(request.content)
        assert body["max_tokens"] == (4096 if limit is None else limit)
        assert body["stream"] is False
        return httpx.Response(200, json={"choices": [{"message": {"content": "answer"}, "finish_reason": "stop"}]})

    gateway: Final = LocalNativeGateway(httpx.MockTransport(respond), SecretStr("server-only-master"))
    body: Final = {"api_key": "sk-test-only-personal-key", "model": "priced-model", "prompt": "hello"}
    result: Final = await gateway.chat(
        PlaygroundInput.model_validate(body if limit is None else {**body, "max_tokens": limit})
    )
    assert not isinstance(result, AuthError) and result.content == "answer"


@pytest.mark.parametrize("content", ("partial answer", None))
@pytest.mark.asyncio
async def test_playground_preserves_length_finish_reason_even_when_reasoning_uses_the_entire_limit(
    content: str | None,
) -> None:
    gateway: Final = LocalNativeGateway(
        httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": content}, "finish_reason": "length"}],
                    "usage": {"prompt_tokens": 2, "completion_tokens": 1, "total_tokens": 3},
                },
            )
        ),
        SecretStr("server-only-master"),
    )
    result: Final = await gateway.chat(
        PlaygroundInput(api_key=SecretStr("sk-test-only-personal-key"), model="priced-model", prompt="hello")
    )
    assert not isinstance(result, AuthError)
    assert result.model_dump()["finish_reason"] == "length" and result.content == (content or "")


@pytest.mark.parametrize("limit", (0, -1, 32769, True, "4096"))
def test_playground_rejects_invalid_output_limits(limit: object) -> None:
    with pytest.raises(ValidationError):
        PlaygroundInput.model_validate(
            {"api_key": "sk-test-only-personal-key", "model": "priced-model", "prompt": "hello", "max_tokens": limit}
        )


def test_playground_can_continue_after_a_long_answer_without_expanding_user_message_limits() -> None:
    body: Final = {
        "api_key": "sk-test-only-personal-key",
        "model": "priced-model",
        "messages": (
            {"role": "assistant", "content": "answer " * 3000},
            {"role": "user", "content": "continue"},
        ),
    }
    assert PlaygroundInput.model_validate(body).messages[0].content == "answer " * 3000
    with pytest.raises(ValidationError):
        PlaygroundInput.model_validate({**body, "messages": ({"role": "user", "content": "a" * 8001},)})
    with pytest.raises(ValidationError):
        PlaygroundInput.model_validate(
            {**body, "messages": tuple({"role": "assistant", "content": "a" * 100000} for _ in range(3))}
        )


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
