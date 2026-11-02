import asyncio
from types import MappingProxyType
from typing import Final

import httpx
from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_gateway import (
    CreateGatewayKey,
    GatewayAccess,
    PlaygroundInput,
    PlaygroundOutput,
    PlaygroundUsage,
)
from litellm.proxy.auth.auth_checks import (  # pyright: ignore[reportMissingTypeStubs]  # Native auth namespace has no stubs
    check_model_access_helper,
)
from litellm.proxy.common_utils.auth_cache_invalidation_pubsub import (  # pyright: ignore[reportMissingTypeStubs]  # Native cache namespace has no stubs
    evict_and_broadcast,
)
from litellm.proxy.common_utils.user_api_key_cache import (  # pyright: ignore[reportMissingTypeStubs]  # Native cache namespace has no stubs
    UserApiKeyCache,
)
from litellm.router import Router
from pydantic import BaseModel, SecretStr, ValidationError


class NativeModel(BaseModel):
    id: str
    model_config = {"frozen": True}


class NativeModels(BaseModel):
    data: tuple[NativeModel, ...]
    model_config = {"frozen": True}


class NativeCreatedKey(BaseModel):
    key: SecretStr
    model_config = {"frozen": True}


class NativeMessage(BaseModel):
    content: str
    model_config = {"frozen": True}


class NativeChoice(BaseModel):
    message: NativeMessage
    model_config = {"frozen": True}


class NativeCompletion(BaseModel):
    choices: tuple[NativeChoice, ...]
    id: str | None = None
    created: int | None = None
    usage: PlaygroundUsage | None = None
    model_config = {"frozen": True}


class NativeError(BaseModel):
    message: str = ""
    model_config = {"frozen": True}


class NativeErrorEnvelope(BaseModel):
    error: NativeError | None = None
    detail: str = ""
    model_config = {"frozen": True}


def billing_rejection(response: httpx.Response) -> AuthError | None:
    codes: Final = MappingProxyType(
        {
            "insufficient_balance": 402,
            "wallet_pricing_unavailable": 503,
            "wallet_billing_unavailable": 503,
            "wallet_request_not_supported": 400,
            "wallet_route_not_supported": 403,
        }
    )
    try:
        envelope: Final = NativeErrorEnvelope.model_validate_json(response.content)
    except ValidationError:
        return None
    message: Final = envelope.detail or (envelope.error.message if envelope.error else "")
    return next(
        (
            AuthError(code, status)
            for code, status in codes.items()
            if response.status_code == status and code in message
        ),
        None,
    )


class LocalNativeGateway:
    def __init__(
        self,
        transport: httpx.AsyncBaseTransport,
        master_key: SecretStr,
        router: Router | None = None,
        key_cache: UserApiKeyCache | None = None,
    ) -> None:
        self.transport = transport
        self.master_key = master_key
        self.router = router
        self.key_cache = key_cache

    async def request(
        self, method: str, path: str, body: object = None, key: SecretStr | None = None, user_id: str | None = None
    ) -> httpx.Response | AuthError:
        try:
            async with httpx.AsyncClient(transport=self.transport, base_url="http://127.0.0.1", timeout=60) as client:
                response: Final = await asyncio.wait_for(
                    client.request(
                        method,
                        path,
                        json=body,
                        headers={
                            "Authorization": "Bearer " + (key or self.master_key).get_secret_value(),
                            **({"litellm-changed-by": user_id} if user_id else {}),
                        },
                    ),
                    timeout=60,
                )
            if response.is_success:
                return response
            billing_error: Final = billing_rejection(response) if key else None
            if billing_error is not None:
                return billing_error
            return AuthError(
                "model_request_rejected" if key else "gateway_request_failed",
                403 if key and response.status_code in {400, 401, 402, 403, 429} else 502,
            )
        except (httpx.HTTPError, asyncio.TimeoutError):
            return AuthError("gateway_unavailable", 503)

    async def models(self, grants: tuple[str, ...]) -> tuple[str, ...] | AuthError:
        if "no-default-models" in grants:
            return ()
        response: Final = await self.request("GET", "/v1/models")
        if isinstance(response, AuthError):
            return response
        try:
            return tuple(
                model.id
                for model in NativeModels.model_validate_json(response.content).data
                if check_model_access_helper(model=model.id, llm_router=self.router, models=list(grants))
            )
        except ValidationError:
            return AuthError("gateway_unavailable", 503)

    async def create_key(self, user_id: str, body: CreateGatewayKey, access: GatewayAccess) -> SecretStr | AuthError:
        response: Final = await self.request(
            "POST",
            "/key/generate",
            {
                "user_id": user_id,
                "key_alias": body.name.strip(),
                "duration": body.duration or f"{body.expires_in_days}d",
                "models": body.models if body.models is not None else access.models,
                "max_budget": None,
                "budget_duration": None,
                "rpm_limit": access.rpm_limit,
                "tpm_limit": access.tpm_limit,
                "key_type": "llm_api",
                "metadata": {"commerce_customer": user_id},
            },
            user_id=user_id,
        )
        if isinstance(response, AuthError):
            return response
        try:
            return NativeCreatedKey.model_validate_json(response.content).key
        except ValidationError:
            return AuthError("gateway_request_failed", 502)

    async def delete_key(self, token: str, user_id: str) -> AuthError | None:
        response: Final = await self.request("POST", "/key/delete", {"keys": [token]}, user_id=user_id)
        if isinstance(response, AuthError):
            return response
        if self.key_cache is not None:
            await evict_and_broadcast(cache_keys=(token,), user_api_key_cache=self.key_cache)
        return None

    async def chat(self, body: PlaygroundInput) -> PlaygroundOutput | AuthError:
        response: Final = await self.request(
            "POST",
            "/v1/chat/completions",
            {
                "model": body.model,
                "messages": (
                    [message.model_dump() for message in body.messages]
                    if body.messages
                    else [{"role": "user", "content": body.prompt}]
                ),
                "max_tokens": 512,
                "stream": False,
            },
            key=body.api_key,
        )
        if isinstance(response, AuthError):
            return response
        try:
            result: Final = NativeCompletion.model_validate_json(response.content)
            return (
                PlaygroundOutput(
                    content=result.choices[0].message.content,
                    request_id=result.id,
                    created=result.created,
                    usage=result.usage,
                )
                if result.choices
                else AuthError("model_request_rejected", 502)
            )
        except ValidationError:
            return AuthError("model_request_rejected", 502)
