import httpx
import pytest
from pydantic import SecretStr

from litellm.proxy._types import UserAPIKeyAuth
from litellm.proxy.commerce.native_gateway import LocalNativeGateway
from litellm.proxy.common_utils.user_api_key_cache import UserApiKeyCache


@pytest.mark.asyncio
async def test_customer_key_delete_evicts_a_previously_authenticated_token() -> None:
    token = 'a' * 64
    cache = UserApiKeyCache()
    cache.set_cache(token, UserAPIKeyAuth(user_id='customer-a'), model_type=UserAPIKeyAuth)
    gateway = LocalNativeGateway(httpx.MockTransport(lambda request: httpx.Response(200, json={'deleted_keys':[token]})),
                                 SecretStr('server-only-master'), key_cache=cache)
    result = await gateway.delete_key(token, 'customer-a')
    assert result is None
    assert cache.get_cache(token, model_type=UserAPIKeyAuth) is None
