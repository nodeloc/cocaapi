import json
from collections.abc import Mapping
from datetime import datetime, timedelta
from decimal import Decimal

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_payment import GatewayInvoice, PaymentNetwork, PaymentNotification, StoredOrder, VerifiedPayment


class TestGateway:
    __test__ = False
    provider_id = "test-gateway"
    merchant_account_id = "isolated-test-merchant"
    checkout_origins = ("https://payments.example.test",)

    def __init__(self, now: datetime) -> None:
        self.now = now
        self.create_calls = 0
        self.fetch_calls = 0
        self.timeout = False
        self.recover_invoice = False
        self.mismatch = ""
        self.paid_at = now

    def available_networks(self) -> tuple[PaymentNetwork, ...]:
        return (PaymentNetwork(id="tron", label="TRON"),)

    def invoice(self, order: StoredOrder) -> GatewayInvoice:
        return GatewayInvoice(merchant_order_id=order.id, merchant_account_id=self.merchant_account_id,
            external_id="payment-"+order.id, amount_usdt=str(Decimal(order.credit_units)/Decimal(1_000_000_000)),
            asset="USDT", network=order.network, checkout_url="https://payments.example.test/"+order.id,
            expires_at=self.now+timedelta(minutes=30))

    async def create_payment(self, order: StoredOrder) -> GatewayInvoice | AuthError:
        self.create_calls += 1
        return AuthError("gateway_timeout", 503) if self.timeout else self.invoice(order)

    async def fetch_payment(self, order: StoredOrder) -> VerifiedPayment | GatewayInvoice:
        self.fetch_calls += 1
        if self.recover_invoice:
            return self.invoice(order)
        values = self.invoice(order).model_dump(exclude={"checkout_url", "expires_at"})
        if self.mismatch:
            values[self.mismatch] = "999" if self.mismatch == "amount_usdt" else "wrong"
        return VerifiedPayment.model_validate({**values, "status": "paid", "paid_at": self.paid_at})

    async def verify_notification(self, raw_body: bytes, headers: Mapping[str, str]) -> PaymentNotification | AuthError:
        if headers.get("x-test-signature") != "test-only-valid":
            return AuthError("invalid_signature", 401)
        return PaymentNotification.model_validate(json.loads(raw_body))
