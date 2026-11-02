import json
import secrets
from collections.abc import AsyncIterator
from typing import Final

import httpx
import pytest_asyncio
import pytest
from pydantic import SecretStr

from litellm.proxy._types import hash_token
from litellm.proxy.commerce.gateway_routes import get_gateway_service
from litellm.proxy.commerce.gateway_service import GatewayService
from litellm.proxy.commerce.native_gateway import LocalNativeGateway
from litellm.repositories.commerce_gateway_repository import GatewayRepository
from .conftest import WalletClient


@pytest_asyncio.fixture
async def gateway_client(wallet_client: WalletClient, request: pytest.FixtureRequest) -> AsyncIterator[WalletClient]:
    default_team: Final = getattr(request, "param", "") == "default-team"

    async def native(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/models":
            return httpx.Response(
                200, json={"data": [{"id": "granted-model", "private": "hidden"}, {"id": "restricted-model"}]}
            )
        body: Final = json.loads(request.content)
        if request.url.path == "/key/generate":
            assert request.headers["Authorization"] == "Bearer server-only-master"
            assert body["user_id"] == wallet_client.session.customer.user_id
            assert body["models"] == ["granted-model"]
            assert body["max_budget"] is None and body["budget_duration"] is None
            assert body["key_type"] == "llm_api"
            assert "team_id" not in body and "permissions" not in body
            raw: Final = "sk-" + secrets.token_urlsafe(32)
            await wallet_client.database.execute_raw(
                """INSERT INTO "LiteLLM_VerificationToken" (token,user_id,key_alias,models,max_budget,team_id,key_type,allowed_routes)
                VALUES ($1,$2,$3,ARRAY['granted-model'],NULL,$4,'llm_api',ARRAY['llm_api_routes'])""",
                hash_token(raw),
                body["user_id"],
                body["key_alias"],
                "injected-default-team" if default_team else None,
            )
            return httpx.Response(200, json={"key": raw, "private": "never exposed"})
        if request.url.path == "/key/delete":
            assert request.headers["Authorization"] == "Bearer server-only-master"
            await wallet_client.database.execute_raw(
                'DELETE FROM "LiteLLM_VerificationToken" WHERE token=$1', body["keys"][0]
            )
            return httpx.Response(200, json={"deleted_keys": body["keys"]})
        assert request.url.path == "/v1/chat/completions"
        assert request.headers["Authorization"].startswith("Bearer sk-")
        assert body["max_tokens"] == 4096 and body["stream"] is False
        if len(body["messages"]) > 1:
            assert body["messages"] == [
                {"role": "system", "content": "Keep answers short"},
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "hi"},
                {"role": "user", "content": "continue"},
            ]
        assert "user_id" not in body and "api_key" not in body
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "isolated completion"}}], "internal": "hidden"}
        )

    gateway: Final = GatewayService(
        GatewayRepository(wallet_client.database),
        LocalNativeGateway(httpx.MockTransport(native), SecretStr("server-only-master")),
        wallet_client.accounts.security,
    )
    wallet_client.app.dependency_overrides[get_gateway_service] = lambda: gateway
    yield wallet_client
