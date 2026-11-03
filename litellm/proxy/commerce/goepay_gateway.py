from collections.abc import Awaitable, Callable, Mapping
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Final
from urllib.parse import parse_qsl, urljoin, urlsplit

from pydantic import ValidationError

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_payment import (
    ExchangeRate,
    GatewayInvoice,
    NetworkId,
    PaymentNetwork,
    PaymentNotification,
    PaymentQuote,
    StoredOrder,
    VerifiedPayment,
)
from litellm.proxy.commerce.auth_service import utcnow
from litellm.proxy.commerce.goepay_protocol import GoepayClient
from litellm.proxy.commerce.payment_checkout import checkout_deadline
from litellm.proxy.commerce.payment_rates import quote_cny

_BUSINESS_ZONE: Final = timezone(timedelta(hours=8))


class GoepayGateway:
    provider_id = "goepay"

    def __init__(
        self,
        client: GoepayClient,
        rates: Callable[[], Awaitable[ExchangeRate | None]],
        public_url: str,
        clock: Callable[[], datetime] = utcnow,
        recover_checkout: bool = False,
    ) -> None:
        self.client = client
        self.rates = rates
        self.public_url = public_url
        self.clock = clock
        self.recover_checkout = recover_checkout

    @property
    def merchant_account_id(self) -> str:
        return self.client.merchant_id

    @property
    def checkout_origins(self) -> tuple[str, ...]:
        return (self.client.origin,)

    def available_networks(self) -> tuple[PaymentNetwork, ...]:
        return (PaymentNetwork(id="alipay", label="支付宝"), PaymentNetwork(id="wxpay", label="微信支付"))

    async def quote_payment(self, credit_units: int, network: NetworkId) -> PaymentQuote | AuthError:
        rate: Final = await self.rates()
        if rate is None:
            return AuthError("exchange_rate_unavailable", 503)
        return quote_cny(credit_units, rate, self.clock())

    def _receipt(self, order: StoredOrder, fields: Mapping[str, str]) -> VerifiedPayment | AuthError:
        try:
            amount: Final = Decimal(fields.get("money", ""))
            if (fields.get("pid"), fields.get("out_trade_no"), fields.get("type")) != (
                order.merchant_account_id,
                order.id,
                order.network,
            ):
                return AuthError("gateway_invalid_response", 502)
            if (
                not amount.is_finite()
                or amount <= 0
                or order.payment_amount is None
                or amount != Decimal(order.payment_amount)
            ):
                return AuthError("gateway_invalid_response", 502)
            external: Final = fields.get("trade_no", "")
            if not external or len(external) > 128 or (order.external_id is not None and external != order.external_id):
                return AuthError("gateway_invalid_response", 502)
            status: Final = fields.get("status")
            refunded: Final = Decimal(fields.get("refundmoney", "0"))
            if not refunded.is_finite() or refunded != 0:
                return AuthError("payment_under_review", 503)
            if status not in {"0", "1"}:
                return AuthError("payment_under_review", 503)
            paid_at: Final = (
                datetime.strptime(fields.get("endtime", ""), "%Y-%m-%d %H:%M:%S")
                .replace(tzinfo=_BUSINESS_ZONE)
                .astimezone(timezone.utc)
                if status == "1"
                else None
            )
            if paid_at is not None and (
                paid_at > self.clock() + timedelta(minutes=5) or paid_at < order.created_at - timedelta(minutes=5)
            ):
                return AuthError("gateway_invalid_response", 502)
            return VerifiedPayment(
                merchant_order_id=order.id,
                merchant_account_id=order.merchant_account_id,
                external_id=external,
                amount=fields["money"],
                asset="CNY",
                network=order.network,
                status="paid" if status == "1" else "pending",
                paid_at=paid_at,
            )
        except (ValueError, InvalidOperation):
            return AuthError("gateway_invalid_response", 502)

    async def create_payment(self, order: StoredOrder) -> GatewayInvoice | AuthError:
        deadline: Final = checkout_deadline(order)
        if deadline is not None and deadline <= self.clock():
            return AuthError("checkout_expired", 409)
        if order.payment_amount is None or order.asset != "CNY" or order.network not in {"alipay", "wxpay"}:
            return AuthError("gateway_invalid_response", 502)
        result: Final = await self.client.call(
            "/api/pay/create",
            {
                "out_trade_no": order.id,
                "money": order.payment_amount,
                "type": order.network,
                "name": "CocaAPI 余额充值",
                "method": "jump",
                "notify_url": self.public_url + "/commerce/webhooks/goepay",
                "return_url": self.public_url + "/account/orders/",
            },
        )
        if isinstance(result, AuthError):
            return result
        external: Final = result.get("trade_no", "")
        checkout: Final = urljoin(self.client.origin, result.get("pay_info", ""))
        parsed: Final = urlsplit(checkout)
        if result.get("pay_type") != "jump" or not external or not result.get("pay_info"):
            return AuthError("gateway_invalid_response", 502)
        if (
            parsed.scheme != "https"
            or parsed.netloc != urlsplit(self.client.origin).netloc
            or parsed.username
            or parsed.fragment
        ):
            return AuthError("gateway_invalid_response", 502)
        if order.external_id is not None and external != order.external_id:
            return AuthError("gateway_invalid_response", 502)
        return GatewayInvoice(
            merchant_order_id=order.id,
            merchant_account_id=order.merchant_account_id,
            external_id=external,
            amount=order.payment_amount,
            asset="CNY",
            network=order.network,
            checkout_url=checkout,
            expires_at=None,
        )

    async def fetch_payment(
        self, order: StoredOrder, *, recover_checkout: bool = False
    ) -> VerifiedPayment | GatewayInvoice | AuthError:
        result: Final = await self.client.call("/api/pay/query", {"out_trade_no": order.id})
        if isinstance(result, AuthError):
            return result
        receipt: Final = self._receipt(order, result)
        if isinstance(receipt, AuthError):
            return receipt
        deadline: Final = checkout_deadline(order)
        if (
            receipt.status == "pending"
            and not order.checkout_url
            and self.recover_checkout
            and recover_checkout
            and (deadline is None or deadline > self.clock())
        ):
            invoice: Final = await self.create_payment(order)
            if isinstance(invoice, AuthError):
                return invoice
            if invoice.external_id != receipt.external_id:
                return AuthError("gateway_invalid_response", 502)
            return invoice
        return receipt

    async def verify_notification(self, raw_body: bytes, headers: Mapping[str, str]) -> PaymentNotification | AuthError:
        try:
            pairs: Final = parse_qsl(
                raw_body.decode("utf-8"),
                keep_blank_values=True,
                strict_parsing=True,
                max_num_fields=32,
                errors="strict",
            )
            if len(frozenset(key for key, _ in pairs)) != len(pairs):
                return AuthError("invalid_signature", 401)
            fields: Final = dict(pairs)
            if not self.client.signature.verify(fields):
                return AuthError("invalid_signature", 401)
            if fields.get("pid") != self.merchant_account_id or fields.get("trade_status") != "TRADE_SUCCESS":
                return AuthError("invalid_signature", 401)
            if fields.get("type") not in {"alipay", "wxpay"}:
                return AuthError("invalid_signature", 401)
            if not fields.get("trade_no") or not fields.get("out_trade_no") or not fields.get("money"):
                return AuthError("invalid_signature", 401)
            return PaymentNotification(
                event_id=fields["trade_no"] + ":paid",
                merchant_order_id=fields["out_trade_no"],
                merchant_account_id=fields["pid"],
                external_id=fields["trade_no"],
                amount=fields["money"],
                network=fields["type"],
            )
        except (ValueError, ValidationError):
            return AuthError("invalid_signature", 401)
