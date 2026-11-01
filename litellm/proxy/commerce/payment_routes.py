from typing import Annotated, Final, TypeAlias
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_payment import OrderPage, PaymentGateway, PaymentMethods, RechargeInput, RechargeOrder
from litellm.proxy.commerce.account_routes import (
    AccountRoute,
    CurrentSession,
    MessageView,
    Service,
    guard,
    raise_public,
)
from litellm.proxy.commerce.admin_wallet_routes import AdminDep
from litellm.proxy.commerce.billing_config import redemption_security
from litellm.proxy.commerce.payment_gateway import UnconfiguredGateway
from litellm.proxy.commerce.payment_service import PaymentService
from litellm.repositories.commerce_payment_repository import PaymentRepository


def get_gateway() -> PaymentGateway:
    return UnconfiguredGateway()


GatewayDep: TypeAlias = Annotated[PaymentGateway, Depends(get_gateway)]


def get_payment_service(accounts: Service, gateway: GatewayDep) -> PaymentService:
    from litellm.proxy.proxy_server import prisma_client
    from litellm.repositories.commerce_auth_repository import AccountDatabase

    if prisma_client is None:
        raise_public(AuthError("account_service_unavailable", 503))
    db: Final[AccountDatabase] = prisma_client.writer_db  # pyright: ignore[reportAssignmentType]  # __getattr__ proxy
    return PaymentService(PaymentRepository(db), gateway)


PaymentDep: TypeAlias = Annotated[PaymentService, Depends(get_payment_service)]
router: Final = APIRouter(dependencies=[Depends(guard)], route_class=AccountRoute)
admin_router: Final = APIRouter(prefix="/commerce/admin/v1", tags=["Commerce management"], route_class=AccountRoute)
webhook_router: Final = APIRouter(prefix="/commerce/webhooks", tags=["Payment notifications"], route_class=AccountRoute)


@router.get("/payment-methods", response_model=PaymentMethods)
async def methods(session: CurrentSession, payments: PaymentDep) -> PaymentMethods:
    return payments.methods(redemption_security() is not None)


@router.post("/recharge-orders", response_model=RechargeOrder, status_code=201)
async def create_order(
    body: RechargeInput,
    request_key: Annotated[UUID, Header(alias="Idempotency-Key")],
    session: CurrentSession,
    payments: PaymentDep,
    accounts: Service,
) -> RechargeOrder:
    if not await accounts.rate_limit("recharge-create", session.customer.user_id, 5):
        raise_public(AuthError("too_many_attempts", 429))
    result: Final = await payments.create(session, body, str(request_key))
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@router.get("/recharge-orders", response_model=OrderPage)
async def orders(
    session: CurrentSession,
    payments: PaymentDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
) -> OrderPage:
    return await payments.orders(session.customer.user_id, "", limit, offset)


@router.get("/recharge-orders/{order_id}", response_model=RechargeOrder)
async def order(order_id: str, session: CurrentSession, payments: PaymentDep) -> RechargeOrder:
    result: Final = await payments.get(order_id, session.customer.user_id)
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@router.post("/recharge-orders/{order_id}/refresh", response_model=RechargeOrder)
async def refresh(order_id: str, session: CurrentSession, payments: PaymentDep, accounts: Service) -> RechargeOrder:
    if not session.customer.email_verified:
        raise_public(AuthError("email_verification_required", 403))
    if not await accounts.rate_limit("recharge-refresh", session.customer.user_id, 10):
        raise_public(AuthError("too_many_attempts", 429))
    result: Final = await payments.refresh(order_id, session.customer.user_id, session.customer.user_id)
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@admin_router.get("/recharge-orders", response_model=OrderPage)
async def admin_orders(
    admin: AdminDep,
    payments: PaymentDep,
    search: Annotated[str, Query(max_length=128)] = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
) -> OrderPage:
    return await payments.orders(None, search.strip(), limit, offset)


@admin_router.post("/recharge-orders/{order_id}/refresh", response_model=RechargeOrder)
async def admin_refresh(order_id: str, admin: AdminDep, payments: PaymentDep) -> RechargeOrder:
    result: Final = await payments.refresh(order_id, None, admin.user_id)
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@webhook_router.post("/{provider}", response_model=MessageView)
async def notify(provider: str, request: Request, payments: PaymentDep) -> MessageView:
    if not payments.enabled or provider != payments.gateway.provider_id:
        raise_public(AuthError("payment_unavailable", 503))
    body: Final = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > 65_536:
            raise_public(AuthError("notification_too_large", 413))
        body.extend(chunk)
    result: Final = await payments.notify(provider, bytes(body), request.headers)
    if isinstance(result, AuthError):
        raise_public(result)
    return MessageView()
