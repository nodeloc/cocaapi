import httpx
import pytest
from pydantic import SecretStr

from litellm.proxy._types import UserAPIKeyAuth
from litellm.proxy.commerce.native_gateway import LocalNativeGateway, billing_rejection
from litellm.proxy.common_utils.user_api_key_cache import UserApiKeyCache


@pytest.mark.asyncio
async def test_customer_key_delete_evicts_a_previously_authenticated_token() -> None:
    token = "a" * 64
    cache = UserApiKeyCache()
    cache.set_cache(token, UserAPIKeyAuth(user_id="customer-a"), model_type=UserAPIKeyAuth)
    gateway = LocalNativeGateway(
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
