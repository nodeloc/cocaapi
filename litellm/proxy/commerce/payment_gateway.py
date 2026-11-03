from collections.abc import Mapping

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_payment import (
    GatewayInvoice,
    NetworkId,
    PaymentNetwork,
    PaymentNotification,
    PaymentQuote,
    StoredOrder,
    VerifiedPayment,
)


class UnconfiguredGateway:
    @property
    def provider_id(self) -> str:
        return "unconfigured"

    @property
    def merchant_account_id(self) -> str:
        return ""

    @property
    def checkout_origins(self) -> tuple[str, ...]:
        return ()

    def available_networks(self) -> tuple[PaymentNetwork, ...]:
        return ()

    async def quote_payment(self, credit_units: int, network: NetworkId) -> PaymentQuote | AuthError:
        return AuthError("payment_unavailable", 503)

    async def create_payment(self, order: StoredOrder) -> GatewayInvoice | AuthError:
        return AuthError("payment_unavailable", 503)

    async def fetch_payment(
        self, order: StoredOrder, *, recover_checkout: bool = False
    ) -> VerifiedPayment | GatewayInvoice | AuthError:
        return AuthError("payment_unavailable", 503)

    async def verify_notification(self, raw_body: bytes, headers: Mapping[str, str]) -> PaymentNotification | AuthError:
        return AuthError("payment_unavailable", 503)
