from datetime import datetime, timedelta
from typing import Annotated, Final, Literal, TypeAlias

import httpx
from fastapi import APIRouter, Depends, Path, Query
from pydantic import SecretStr

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_gateway import (
    CreatedGatewayKey,
    CreateGatewayKey,
    GatewayAccess,
    GatewayKey,
    GatewayKeys,
    GatewayLogs,
    GatewayUsage,
    PlaygroundInput,
    PlaygroundOutput,
)
from litellm.proxy.commerce.account_routes import (
    AccountRoute,
    CurrentSession,
    MessageView,
    Service,
    guard,
    raise_public,
)
from litellm.proxy.commerce.auth_service import utcnow
from litellm.proxy.commerce.gateway_service import GatewayService, usage_window
from litellm.proxy.commerce.native_gateway import LocalNativeGateway
from litellm.repositories.commerce_auth_repository import AccountDatabase
from litellm.repositories.commerce_gateway_repository import GatewayRepository


def get_gateway_service(accounts: Service) -> GatewayService:
    from litellm.proxy.proxy_server import app, llm_router, master_key, prisma_client, user_api_key_cache

    if prisma_client is None or not master_key:
        raise_public(AuthError("gateway_unavailable", 503))
    db: Final[AccountDatabase] = prisma_client.writer_db  # pyright: ignore[reportAssignmentType]  # Native Prisma proxy
    return GatewayService(
        GatewayRepository(db),
        LocalNativeGateway(httpx.ASGITransport(app=app), SecretStr(master_key), llm_router, user_api_key_cache),
        accounts.security,
    )


GatewayDep: TypeAlias = Annotated[GatewayService, Depends(get_gateway_service)]
Days: TypeAlias = Annotated[int, Query(ge=1, le=90)]
Filter: TypeAlias = Annotated[str | None, Query(max_length=256)]
Limit: TypeAlias = Annotated[int, Query(ge=1, le=100)]
Offset: TypeAlias = Annotated[int, Query(ge=0, le=100_000)]
router: Final = APIRouter(prefix="/gateway", dependencies=[Depends(guard)], route_class=AccountRoute)


def read_window(days: int, start_time: datetime | None, end_time: datetime | None) -> tuple[datetime, datetime]:
    now: Final = utcnow()
    if start_time is None and end_time is None:
        return usage_window(now, days)
    if start_time is None or end_time is None or start_time.tzinfo is None or end_time.tzinfo is None:
        raise_public(AuthError("invalid_request", 422))
    end: Final = min(now, end_time)
    if start_time >= end or end - start_time > timedelta(days=90):
        raise_public(AuthError("invalid_request", 422))
    return start_time, end


@router.get("/access", response_model=GatewayAccess)
async def access(session: CurrentSession, gateway: GatewayDep) -> GatewayAccess:
    result: Final = await gateway.access(session)
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@router.get("/keys", response_model=GatewayKeys)
async def keys(session: CurrentSession, gateway: GatewayDep, limit: Limit = 25, offset: Offset = 0) -> GatewayKeys:
    return await gateway.keys(session, limit, offset)


@router.get("/keys/{key_id}", response_model=GatewayKey)
async def key(session: CurrentSession, gateway: GatewayDep, key_id: Annotated[str, Path(max_length=512)]) -> GatewayKey:
    result: Final = await gateway.key(session, key_id)
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@router.post("/keys", response_model=CreatedGatewayKey, status_code=201)
async def create(
    body: CreateGatewayKey, session: CurrentSession, gateway: GatewayDep, accounts: Service
) -> CreatedGatewayKey:
    if not accounts.recently_authenticated(session):
        raise_public(AuthError("reauthentication_required", 403))
    if not await accounts.rate_limit("customer-key-create", session.customer.user_id, 5):
        raise_public(AuthError("too_many_attempts", 429))
    result: Final = await gateway.create(session, body)
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@router.post("/keys/{key_id}/delete", response_model=MessageView)
async def delete(
    session: CurrentSession, gateway: GatewayDep, accounts: Service, key_id: Annotated[str, Path(max_length=512)]
) -> MessageView:
    if not accounts.recently_authenticated(session):
        raise_public(AuthError("reauthentication_required", 403))
    result: Final = await gateway.delete(session, key_id)
    if isinstance(result, AuthError):
        raise_public(result)
    return MessageView()


@router.get("/usage", response_model=GatewayUsage)
async def usage(
    session: CurrentSession,
    gateway: GatewayDep,
    accounts: Service,
    days: Days = 30,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    timezone_offset: Annotated[int, Query(ge=-840, le=840)] = 0,
) -> GatewayUsage:
    if not await accounts.rate_limit("customer-usage-read", session.customer.user_id, 60):
        raise_public(AuthError("too_many_attempts", 429))
    start, end = read_window(days, start_time, end_time)
    return await gateway.store.usage(session.customer.user_id, start, end, days, timezone_offset)


@router.get("/logs", response_model=GatewayLogs)
async def logs(
    session: CurrentSession,
    gateway: GatewayDep,
    accounts: Service,
    days: Days = 30,
    limit: Limit = 25,
    offset: Offset = 0,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    model: Filter = None,
    request_id: Filter = None,
    status: Annotated[str | None, Query(pattern="^(success|failure)$")] = None,
    search: Filter = None,
    sort_by: Literal["startTime", "spend", "total_tokens", "request_duration_ms", "model"] = "startTime",
    sort_order: Literal["asc", "desc"] = "desc",
) -> GatewayLogs:
    if not await accounts.rate_limit("customer-logs-read", session.customer.user_id, 60):
        raise_public(AuthError("too_many_attempts", 429))
    start, end = read_window(days, start_time, end_time)
    return await gateway.store.logs(
        session.customer.user_id, start, end, limit, offset, model, request_id, status, search, sort_by, sort_order
    )


@router.post("/playground", response_model=PlaygroundOutput)
async def playground(
    body: PlaygroundInput, session: CurrentSession, gateway: GatewayDep, accounts: Service
) -> PlaygroundOutput:
    if not await accounts.rate_limit("customer-playground", session.customer.user_id, 6):
        raise_public(AuthError("too_many_attempts", 429))
    result: Final = await gateway.chat(session, body)
    if isinstance(result, AuthError):
        raise_public(result)
    return result
