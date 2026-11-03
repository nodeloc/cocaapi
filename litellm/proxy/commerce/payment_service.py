import re
import uuid
from collections.abc import Callable, Mapping
from datetime import datetime
from decimal import Decimal
from typing import Final
from urllib.parse import urlsplit

from litellm.models.commerce_auth import AuthError, Session
from litellm.models.commerce_payment import (
    GatewayInvoice,
    OrderIntent,
    OrderPage,
    PaymentGateway,
    PaymentMethods,
    PaymentNotification,
    PaymentStore,
    RechargeInput,
    RechargeOrder,
    StoredOrder,
    VerifiedPayment,
)
from litellm.proxy.commerce.auth_service import utcnow
from litellm.proxy.commerce.payment_checkout import checkout_deadline
from litellm.proxy.commerce.wallet_service import parse_usd


def usdt_amount(value: str) -> Decimal | None:
    if not re.fullmatch(r"[0-9]{1,10}(?:\.[0-9]{1,18})?", value):
        return None
    amount: Final = Decimal(value)
    return amount if 0 < amount <= Decimal("1000000000") else None


class PaymentService:
    def __init__(self, store: PaymentStore, gateway: PaymentGateway, clock: Callable[[], datetime] = utcnow) -> None:
        self.store = store
        self.gateway = gateway
        self.clock = clock

    @property
    def enabled(self) -> bool:
        return bool(self.gateway.available_networks() and self.gateway.merchant_account_id)

    def methods(self, redemption_enabled: bool) -> PaymentMethods:
        return PaymentMethods(
            enabled=self.enabled,
            networks=self.gateway.available_networks() if self.enabled else (),
            redemption_enabled=redemption_enabled,
            asset="CNY"
            if any(item.id in {"alipay", "wxpay"} for item in self.gateway.available_networks())
            else "USDT",
        )

    def public(self, order: StoredOrder) -> RechargeOrder:
        deadline: Final = checkout_deadline(order)
        expired: Final = order.status == "pending" and deadline is not None and deadline <= self.clock()
        return RechargeOrder(
            id=order.id,
            user_id=order.user_id,
            credit_units=order.credit_units,
            network=order.network,
            asset=order.asset,
            provider=order.provider,
            status="expired" if expired else order.status,
            amount_usdt=order.amount_usdt,
            payment_amount=order.payment_amount or order.amount_usdt,
            quote=order.quote,
            checkout_url=order.checkout_url if order.status == "pending" and not expired else None,
            checkout_expires_at=deadline,
            external_id=order.external_id,
            expires_at=order.expires_at,
            paid_at=order.paid_at,
            review_reason=order.review_reason,
            created_at=order.created_at,
        )

    async def create(self, session: Session, body: RechargeInput, request_id: str) -> RechargeOrder | AuthError:
        if not session.customer.email_verified:
            return AuthError("email_verification_required", 403)
        if not self.enabled:
            return AuthError("payment_unavailable", 503)
        if body.network not in tuple(network.id for network in self.gateway.available_networks()):
            return AuthError("network_unavailable", 422)
        units: Final = parse_usd(body.amount_usd)
        if isinstance(units, AuthError):
            return units
        request_key: Final = session.customer.user_id + ":" + request_id
        previous: Final = await self.store.request_order(session, request_key, self.clock())
        if isinstance(previous, AuthError):
            return previous
        if previous is not None:
            if (previous.credit_units, previous.network) != (units, body.network):
                return AuthError("idempotency_conflict", 409)
            if previous.provider == "goepay" and previous.status == "creating":
                return await self.refresh(previous.id, session.customer.user_id, session.customer.user_id)
            return self.public(previous)
        quote: Final = await self.gateway.quote_payment(units, body.network)
        if isinstance(quote, AuthError):
            return quote
        created: Final = await self.store.create_order(
            session,
            OrderIntent(
                id=uuid.uuid4().hex,
                user_id=session.customer.user_id,
                credit_units=units,
                network=body.network,
                provider=self.gateway.provider_id,
                merchant_account_id=self.gateway.merchant_account_id,
                request_key=request_key,
                now=self.clock(),
                quote=quote,
            ),
        )
        if isinstance(created, AuthError):
            return created
        if not created.created:
            return self.public(created.order)
        invoice: Final = await self.gateway.create_payment(created.order)
        if isinstance(invoice, AuthError):
            return invoice
        return await self._save_invoice(created.order, invoice)

    async def _save_invoice(self, order: StoredOrder, invoice: GatewayInvoice) -> RechargeOrder | AuthError:
        parsed: Final = urlsplit(invoice.checkout_url)
        origin: Final = f"{parsed.scheme}://{parsed.netloc}"
        if (invoice.merchant_order_id, invoice.merchant_account_id, invoice.asset, invoice.network) != (
            order.id,
            order.merchant_account_id,
            order.asset,
            order.network,
        ):
            return AuthError("gateway_invalid_response", 502)
        if (
            usdt_amount(invoice.amount) is None
            or (order.payment_amount is not None and usdt_amount(invoice.amount) != usdt_amount(order.payment_amount))
            or (invoice.expires_at is not None and invoice.expires_at <= self.clock())
            or (invoice.expires_at is None and order.provider != "goepay")
            or parsed.scheme != "https"
            or parsed.username
            or parsed.fragment
            or origin not in self.gateway.checkout_origins
        ):
            return AuthError("gateway_invalid_response", 502)
        stored: Final = await self.store.save_invoice(order, invoice, self.clock())
        return stored if isinstance(stored, AuthError) else self.public(stored)

    async def get(self, order_id: str, user_id: str) -> RechargeOrder | AuthError:
        order: Final = await self.store.get_order(order_id, user_id)
        return self.public(order) if order else AuthError("order_not_found", 404)

    async def orders(self, user_id: str | None, search: str, limit: int, offset: int) -> OrderPage:
        page: Final = await self.store.orders(user_id, search, limit, offset)
        return OrderPage(items=tuple(self.public(order) for order in page.items), has_more=page.has_more)

    def review_reason(self, order: StoredOrder, receipt: VerifiedPayment) -> str | None:
        if (receipt.merchant_order_id, receipt.merchant_account_id) != (
            order.id,
            order.merchant_account_id,
        ) or (order.external_id is not None and receipt.external_id != order.external_id):
            return "payment_identity_mismatch"
        if receipt.asset != order.asset or receipt.network != order.network:
            return "payment_asset_mismatch"
        if (
            (order.payment_amount or order.amount_usdt) is None
            or usdt_amount(receipt.amount) is None
            or usdt_amount(receipt.amount) != usdt_amount(order.payment_amount or order.amount_usdt or "")
        ):
            return "payment_amount_mismatch"
        if receipt.status == "paid" and (
            receipt.paid_at is None
            or (order.expires_at is not None and receipt.paid_at > order.expires_at)
            or (order.expires_at is None and order.provider != "goepay")
        ):
            return "payment_time_mismatch"
        return None

    async def refresh(
        self, order_id: str, user_id: str | None, actor_id: str, notification: PaymentNotification | None = None
    ) -> RechargeOrder | AuthError:
        order: Final = await self.store.get_order(order_id, user_id)
        if order is None:
            return AuthError("order_not_found", 404)
        if order.status == "paid":
            return self.public(order)
        if (
            not self.enabled
            or order.provider != self.gateway.provider_id
            or order.merchant_account_id != self.gateway.merchant_account_id
        ):
            return AuthError("payment_unavailable", 503)
        receipt: Final = await self.gateway.fetch_payment(order, recover_checkout=notification is None)
        if isinstance(receipt, AuthError):
            return receipt
        if isinstance(receipt, GatewayInvoice):
            return await self._save_invoice(order, receipt)
        result: Final = await self.store.reconcile(
            order, receipt, notification, self.review_reason(order, receipt), actor_id, self.clock()
        )
        return result if isinstance(result, AuthError) else self.public(result)

    async def notify(self, provider: str, body: bytes, headers: Mapping[str, str]) -> RechargeOrder | AuthError:
        if not self.enabled or provider != self.gateway.provider_id:
            return AuthError("payment_unavailable", 503)
        notification: Final = await self.gateway.verify_notification(body, headers)
        if isinstance(notification, AuthError):
            return notification
        original: Final = await self.store.get_order(notification.merchant_order_id, None)
        if original is None:
            return AuthError("order_not_found", 404)
        if provider == "goepay" and (
            original.provider != provider
            or notification.merchant_account_id != original.merchant_account_id
            or (original.external_id is not None and notification.external_id != original.external_id)
            or notification.network != original.network
            or usdt_amount(notification.amount or "")
            != usdt_amount(original.payment_amount or original.amount_usdt or "")
        ):
            return AuthError("gateway_invalid_response", 502)
        return await self.refresh(notification.merchant_order_id, None, "payment:" + provider, notification)
