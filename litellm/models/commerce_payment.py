from collections.abc import Mapping
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Protocol, TypeAlias

from pydantic import AliasChoices, AwareDatetime, Field, field_serializer

from litellm.models.commerce_auth import AuthError, FrozenModel, Session

NetworkId: TypeAlias = Literal["tron", "ethereum", "bsc", "alipay", "wxpay"]
PaymentAsset: TypeAlias = Literal["USDT", "CNY"]
OrderStatus: TypeAlias = Literal["creating", "pending", "paid", "expired", "review"]


class ExchangeRate(FrozenModel):
    rate: Decimal = Field(gt=0, max_digits=24, decimal_places=12, allow_inf_nan=False)
    rate_date: date
    fetched_at: AwareDatetime


class PaymentQuote(FrozenModel):
    amount: str
    asset: PaymentAsset
    rate: Decimal | None = None
    rate_date: date | None = None
    fetched_at: AwareDatetime | None = None


class PaymentNetwork(FrozenModel):
    id: NetworkId
    label: str


class PaymentMethods(FrozenModel):
    enabled: bool
    networks: tuple[PaymentNetwork, ...]
    redemption_enabled: bool
    asset: PaymentAsset = "USDT"


class RechargeInput(FrozenModel):
    amount_usd: str = Field(min_length=1, max_length=16)
    network: NetworkId


class RechargeOrder(FrozenModel):
    id: str
    user_id: str
    credit_units: int
    network: NetworkId
    asset: PaymentAsset = "USDT"
    provider: str
    status: OrderStatus
    amount_usdt: str | None
    payment_amount: str | None = None
    quote: PaymentQuote | None = None
    checkout_url: str | None
    checkout_expires_at: datetime | None = None
    external_id: str | None
    expires_at: datetime | None
    paid_at: datetime | None
    review_reason: str | None
    created_at: datetime

    @field_serializer("credit_units")
    def serialize_units(self, value: int) -> str:
        return str(value)


class StoredOrder(RechargeOrder):
    request_key: str
    merchant_account_id: str
    quote: PaymentQuote | None = Field(default=None, validation_alias=AliasChoices("quote_snapshot", "quote"))


class OrderIntent(FrozenModel):
    id: str
    user_id: str
    credit_units: int
    network: NetworkId
    provider: str
    merchant_account_id: str
    request_key: str
    now: datetime
    quote: PaymentQuote | None = None


class CreatedOrder(FrozenModel):
    order: StoredOrder
    created: bool


class GatewayInvoice(FrozenModel):
    merchant_order_id: str = Field(min_length=1, max_length=128)
    merchant_account_id: str = Field(min_length=1, max_length=128)
    external_id: str = Field(min_length=1, max_length=128)
    amount: str = Field(min_length=1, max_length=40, validation_alias=AliasChoices("amount", "amount_usdt"))
    asset: str = Field(min_length=1, max_length=12)
    network: str = Field(min_length=1, max_length=30)
    checkout_url: str = Field(min_length=1, max_length=2048)
    expires_at: AwareDatetime | None


class VerifiedPayment(FrozenModel):
    merchant_order_id: str = Field(min_length=1, max_length=128)
    merchant_account_id: str = Field(min_length=1, max_length=128)
    external_id: str = Field(min_length=1, max_length=128)
    amount: str = Field(min_length=1, max_length=40, validation_alias=AliasChoices("amount", "amount_usdt"))
    asset: str = Field(min_length=1, max_length=12)
    network: str = Field(min_length=1, max_length=30)
    status: Literal["pending", "paid", "expired"]
    paid_at: AwareDatetime | None = None


class PaymentNotification(FrozenModel):
    event_id: str = Field(min_length=1, max_length=128)
    merchant_order_id: str = Field(min_length=1, max_length=128)
    merchant_account_id: str | None = None
    external_id: str | None = None
    amount: str | None = None
    network: str | None = None


class PaymentGateway(Protocol):
    @property
    def provider_id(self) -> str: ...
    @property
    def merchant_account_id(self) -> str: ...
    @property
    def checkout_origins(self) -> tuple[str, ...]: ...
    def available_networks(self) -> tuple[PaymentNetwork, ...]: ...
    async def quote_payment(self, credit_units: int, network: NetworkId) -> PaymentQuote | AuthError: ...
    async def create_payment(self, order: StoredOrder) -> GatewayInvoice | AuthError: ...
    async def fetch_payment(
        self, order: StoredOrder, *, recover_checkout: bool = False
    ) -> VerifiedPayment | GatewayInvoice | AuthError: ...
    async def verify_notification(
        self, raw_body: bytes, headers: Mapping[str, str]
    ) -> PaymentNotification | AuthError: ...


class OrderPage(FrozenModel):
    items: tuple[RechargeOrder, ...]
    has_more: bool


class StoredOrderPage(FrozenModel):
    items: tuple[StoredOrder, ...]
    has_more: bool


class PaymentStore(Protocol):
    async def request_order(
        self, session: Session, request_key: str, now: datetime
    ) -> StoredOrder | AuthError | None: ...
    async def create_order(self, session: Session, intent: OrderIntent) -> CreatedOrder | AuthError: ...
    async def get_order(self, order_id: str, user_id: str | None) -> StoredOrder | None: ...
    async def orders(self, user_id: str | None, search: str, limit: int, offset: int) -> StoredOrderPage: ...
    async def save_invoice(
        self, order: StoredOrder, invoice: GatewayInvoice, now: datetime
    ) -> StoredOrder | AuthError: ...
    async def reconcile(
        self,
        order: StoredOrder,
        receipt: VerifiedPayment,
        notification: PaymentNotification | None,
        review_reason: str | None,
        actor_id: str,
        now: datetime,
    ) -> StoredOrder | AuthError: ...
