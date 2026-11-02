import os
import uuid
from collections.abc import Mapping
from contextvars import ContextVar
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Final

from fastapi import HTTPException
from litellm._logging import verbose_proxy_logger
from litellm.integrations.custom_logger import CustomLogger
from litellm.litellm_core_utils.core_helpers import get_metadata_variable_name_from_kwargs
from litellm.litellm_core_utils.litellm_logging import Logging
from litellm.models.commerce_auth import AuthError
from litellm.proxy._types import UserAPIKeyAuth
from litellm.proxy.commerce.auth_service import utcnow
from litellm.repositories.commerce_auth_repository import AccountDatabase, AccountRepository
from openai import APIStatusError
from prisma.errors import PrismaError
from starlette.types import ASGIApp, Receive, Scope, Send

import litellm
from litellm.proxy.commerce.billing_pricing import (
    bounded_request,
    client_overrides,
    cost_units,
    deployment_request,
    object_mapping,
    quote_units,
    selected_model,
)
from litellm.repositories.commerce_wallet_repository import WalletRepository

_TOKEN: Final = "_cocaapi_wallet_request"
_BILLING_ERRORS: Final = (PrismaError, OSError, ValueError, RuntimeError, TypeError, LookupError)
_BILLED_ROUTES: Final = frozenset(
    {
        "/chat/completions",
        "/v1/chat/completions",
        "/completions",
        "/v1/completions",
        "/responses",
        "/v1/responses",
        "/messages",
        "/v1/messages",
        "/embeddings",
        "/v1/embeddings",
    }
)
_READ_ROUTES: Final = frozenset(
    {
        "/models",
        "/v1/models",
        "/model/info",
        "/v1/model/info",
        "/model_group/info",
        "/utils/token_counter",
        "/utils/supported_openai_params",
    }
)
_CALL_TYPES: Final = frozenset(
    {
        "completion",
        "acompletion",
        "text_completion",
        "atext_completion",
        "embedding",
        "aembedding",
        "responses",
        "aresponses",
        "anthropic_messages",
        "aanthropic_messages",
    }
)


def configured_store() -> WalletRepository | None:
    if not os.environ.get("COCAAPI_AUTH_SECRET"):
        return None
    from litellm.proxy.proxy_server import prisma_client

    if prisma_client is None:
        raise HTTPException(503, detail="wallet_billing_unavailable")
    database: Final[AccountDatabase] = prisma_client.writer_db  # pyright: ignore[reportAssignmentType]  # Native Prisma proxy
    return WalletRepository(database)


async def customer_check(store: WalletRepository, user_id: str | None) -> bool:
    if not user_id:
        return False
    customer: Final = await AccountRepository(store.database).get_customer(user_id)
    if customer is None:
        return False
    if not customer.enabled:
        raise HTTPException(403, detail="account_unavailable")
    if not customer.email_verified:
        raise HTTPException(403, detail="email_verification_required")
    return True


async def guard_wallet_route(auth: UserAPIKeyAuth, route: str, data: Mapping[str, object]) -> None:
    store: Final = configured_store()
    if store is None:
        return
    try:
        customer: Final = await customer_check(store, auth.user_id)
    except HTTPException:
        raise
    except _BILLING_ERRORS:
        raise HTTPException(503, detail="wallet_billing_unavailable") from None
    azure_route: Final = route.startswith("/openai/deployments/") and route.endswith(
        ("/chat/completions", "/embeddings", "/completions")
    )
    if customer and route not in _BILLED_ROUTES and route not in _READ_ROUTES and not azure_route:
        raise HTTPException(403, detail="wallet_route_not_supported")
    if customer and client_overrides(data):
        raise HTTPException(400, detail="wallet_request_not_supported")
    if customer and auth.team_id is not None:
        raise HTTPException(403, detail="wallet_route_not_supported")
    if customer and route not in _READ_ROUTES and os.environ.get("COCAAPI_BILLING_MAINTENANCE", "").lower() == "true":
        raise HTTPException(503, detail="wallet_billing_unavailable")


@dataclass(frozen=True, slots=True)
class BillingContext:
    user_id: str
    request_id: str
    native_request_id: str
    store: WalletRepository
    success_seen: bool = False
    output_started: bool = False
    streaming: bool = False
    model: str = ""
    route: str = ""


_CONTEXT: Final[ContextVar[BillingContext | None]] = ContextVar("cocaapi_wallet_billing", default=None)


class WalletBillingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        token: Final = _CONTEXT.set(None)

        async def tracked_send(message: Mapping[str, object]) -> None:
            current: Final = _CONTEXT.get()
            if current is not None and message.get("type") == "http.response.body" and message.get("body"):
                _CONTEXT.set(replace(current, output_started=True))
            await send(dict(message))

        try:
            await self.app(scope, receive, tracked_send)
        finally:
            context: Final = _CONTEXT.get()
            try:
                if context is not None:
                    await context.store.review_incomplete_call(context.user_id, context.request_id, utcnow())
            except _BILLING_ERRORS:
                verbose_proxy_logger.error("Wallet reservation retained for reconciliation")
            finally:
                _CONTEXT.reset(token)


class WalletBillingHook(CustomLogger):
    async def async_pre_call_hook(
        self, user_api_key_dict: UserAPIKeyAuth, cache: object, data: Mapping[str, object], call_type: str
    ) -> dict[str, object] | None:  # mutable-ok: CustomLogger requires a dict replacement payload
        store: Final = configured_store()
        if store is None:
            return None
        try:
            if not await customer_check(store, user_api_key_dict.user_id):
                return None
            if call_type not in _CALL_TYPES:
                raise HTTPException(403, detail="wallet_route_not_supported")
            user_id: Final = user_api_key_dict.user_id
            if user_id is None:
                raise HTTPException(403, detail="account_unavailable")
            balance: Final = await store.balance(user_id)
            if isinstance(balance, AuthError):
                raise HTTPException(balance.status, detail=balance.code)
            if balance.available_units == 0 or balance.debt_units:
                raise HTTPException(402, detail="insufficient_balance")
            prepared: Final = bounded_request(data, call_type)
            if isinstance(prepared, AuthError):
                raise HTTPException(prepared.status, detail=prepared.code)
            from litellm.proxy.proxy_server import llm_router

            quote: Final = await quote_units(prepared, user_api_key_dict.request_route or "", llm_router)
            if isinstance(quote, AuthError):
                raise HTTPException(quote.status, detail=quote.code)
            request_id: Final = uuid.uuid4().hex
            native_id: Final = prepared.get("litellm_call_id")
            model: Final = prepared.get("model")
            if not isinstance(native_id, str) or not isinstance(model, str):
                raise HTTPException(503, detail="wallet_billing_unavailable")
            result: Final = await store.reserve_call(
                user_id, request_id, quote, model, user_api_key_dict.api_key or "", utcnow(), native_id
            )
            if isinstance(result, AuthError):
                raise HTTPException(result.status, detail=result.code)
            _CONTEXT.set(
                BillingContext(
                    user_id,
                    request_id,
                    native_id,
                    store,
                    streaming=prepared.get("stream") is True,
                    model=model,
                    route=user_api_key_dict.request_route or "",
                )
            )
            metadata_key: Final = get_metadata_variable_name_from_kwargs(prepared)
            return {**prepared, metadata_key: {**object_mapping(prepared.get(metadata_key)), _TOKEN: request_id}}
        except HTTPException:
            raise
        except _BILLING_ERRORS:
            raise HTTPException(503, detail="wallet_billing_unavailable") from None

    async def async_pre_call_deployment_hook(self, kwargs: Mapping[str, object], call_type: object) -> None:
        context: Final = _CONTEXT.get()
        if context is not None:
            try:
                from litellm.proxy.proxy_server import llm_router

                model: Final = selected_model(kwargs, llm_router)
                if isinstance(model, AuthError):
                    raise HTTPException(model.status, detail=model.code)
                prepared: Final = deployment_request(kwargs, model, str(getattr(call_type, "value", call_type)))
                if isinstance(prepared, AuthError):
                    raise HTTPException(prepared.status, detail=prepared.code)
                quote: Final = await quote_units(prepared, context.route, llm_router)
                if isinstance(quote, AuthError):
                    raise HTTPException(quote.status, detail=quote.code)
                result: Final = await context.store.authorize_deployment(
                    context.user_id, context.request_id, quote, utcnow()
                )
                if isinstance(result, AuthError):
                    raise HTTPException(result.status, detail=result.code)

            except _BILLING_ERRORS:
                raise HTTPException(503, detail="wallet_billing_unavailable") from None

    async def async_post_call_success_hook(
        self, data: Mapping[str, object], user_api_key_dict: UserAPIKeyAuth, response: object
    ) -> None:
        context: Final = _CONTEXT.get()
        if context is None or context.user_id != user_api_key_dict.user_id:
            return
        _CONTEXT.set(replace(context, success_seen=True))
        try:
            logging_obj: Final = data.get("litellm_logging_obj")
            hidden: Final = object_mapping(getattr(response, "_hidden_params", None))
            cached: Final = hidden.get("cache_hit") is True
            logged_cost: Final = hidden.get("response_cost")
            computed: Final = (
                0
                if cached
                else logged_cost
                if logged_cost is not None
                else logging_obj.response_cost_calculator(result=response)
                if isinstance(logging_obj, Logging)
                else None
            )
            await settle(context, computed)
        except HTTPException:
            raise
        except _BILLING_ERRORS:
            raise HTTPException(503, detail="wallet_billing_unavailable") from None

    async def async_log_success_event(
        self, kwargs: Mapping[str, object], response_obj: object, start_time: datetime, end_time: datetime
    ) -> None:
        context: Final = _CONTEXT.get()
        if context is None or not context.streaming or not event_matches(kwargs, context):
            return
        try:
            cost: Final = kwargs.get("response_cost")
            await settle(context, cost)
        except (*_BILLING_ERRORS, HTTPException):
            verbose_proxy_logger.error("Wallet settlement pending for request %s", context.request_id)

    async def async_post_call_failure_hook(
        self,
        request_data: Mapping[str, object],
        original_exception: Exception,
        user_api_key_dict: UserAPIKeyAuth,
        traceback_str: str | None = None,
    ) -> None:
        context: Final = _CONTEXT.get()
        if context is None or context.user_id != user_api_key_dict.user_id or context.success_seen:
            return
        await context.store.release_undispatched_call(context.user_id, context.request_id, utcnow())
        free_failure: Final = (
            isinstance(original_exception, APIStatusError) and not context.output_started and not context.streaming
        )
        if free_failure:
            await context.store.settle_call(context.user_id, context.request_id, 0, "failure", utcnow())


def event_matches(kwargs: Mapping[str, object], context: BillingContext) -> bool:
    params: Final = object_mapping(kwargs.get("litellm_params"))
    candidates: Final = (
        object_mapping(params.get("metadata")),
        object_mapping(params.get("litellm_metadata")),
        object_mapping(kwargs.get("metadata")),
        object_mapping(kwargs.get("litellm_metadata")),
    )
    if any(metadata.get("client_disconnected") is True for metadata in candidates):
        return False
    metadata: Final = object_mapping(params.get("litellm_metadata") or params.get("metadata"))
    direct: Final = object_mapping(kwargs.get("litellm_metadata") or kwargs.get("metadata"))
    call_id: Final = kwargs.get("litellm_call_id")
    return call_id == context.native_request_id and (metadata.get(_TOKEN) or direct.get(_TOKEN)) == context.request_id


async def settle(context: BillingContext, cost: object) -> None:
    units: Final = cost_units(cost)
    if isinstance(units, AuthError):
        raise HTTPException(units.status, detail=units.code)
    result: Final = await context.store.settle_call(context.user_id, context.request_id, units, "success", utcnow())
    if isinstance(result, AuthError):
        raise HTTPException(503, detail="wallet_billing_unavailable")


def install_wallet_billing() -> None:
    if os.environ.get("COCAAPI_AUTH_SECRET") and not litellm.logging_callback_manager.get_custom_loggers_for_type(
        WalletBillingHook
    ):
        litellm.logging_callback_manager.add_litellm_callback(WalletBillingHook())
