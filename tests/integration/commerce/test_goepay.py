import asyncio
import base64
from datetime import timedelta, timezone
from decimal import Decimal
from typing import Final
from urllib.parse import parse_qs, urlencode
from uuid import uuid4

import httpx
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_payment import ExchangeRate, RechargeInput, RechargeOrder
from litellm.proxy.commerce.goepay_gateway import GoepayGateway
from litellm.proxy.commerce.goepay_protocol import GoepayClient, GoepaySignature, canonical_fields
from litellm.proxy.commerce.payment_checkout import CHECKOUT_LIFETIME
from litellm.proxy.commerce.payment_routes import get_payment_service
from litellm.proxy.commerce.payment_service import PaymentService
from litellm.repositories.commerce_exchange_repository import ExchangeRateRepository
from litellm.repositories.commerce_payment_repository import PaymentRepository

from .conftest import WalletClient

MERCHANT: Final = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PLATFORM: Final = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class Provider:
    def __init__(self, customer: WalletClient) -> None:
        self.customer = customer
        self.order_id = ""
        self.money = ""
        self.method = ""
        self.paid = False
        self.create_calls = 0
        self.query_fields: dict[str, str] = {}
        self.timeout_create = False
        self.reject_query = False

    def signed(self, fields: dict[str, str]) -> dict[str, str]:
        values: Final = {"timestamp": str(int(self.customer.now.timestamp())), "sign_type": "RSA", **fields}
        return {
            **values,
            "sign": base64.b64encode(
                PLATFORM.sign(canonical_fields(values, response=True), padding.PKCS1v15(), hashes.SHA256())
            ).decode(),
        }

    async def send(self, request: httpx.Request) -> httpx.Response:
        fields: Final = {key: values[0] for key, values in parse_qs(request.content.decode()).items()}
        MERCHANT.public_key().verify(
            base64.b64decode(fields["sign"]),
            canonical_fields(fields, response=False),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        if request.url.path == "/api/pay/create":
            self.create_calls += 1
            self.order_id, self.money, self.method = fields["out_trade_no"], fields["money"], fields["type"]
            assert fields["notify_url"] == "https://customer.example.test/commerce/webhooks/goepay"
            stored: Final = await PaymentRepository(self.customer.database).get_order(self.order_id, None)
            assert stored is not None and stored.payment_amount == self.money and stored.quote is not None
            if self.timeout_create:
                self.timeout_create = False
                raise httpx.ReadTimeout("Unknown create response", request=request)
            return httpx.Response(
                200,
                json=self.signed(
                    {
                        "code": "0",
                        "trade_no": "pay-" + self.order_id,
                        "pay_type": "jump",
                        "pay_info": "https://payments.example.test/checkout/" + self.order_id,
                    }
                ),
            )
        assert fields["out_trade_no"] == self.order_id
        if self.reject_query:
            return httpx.Response(503)
        return httpx.Response(
            200,
            json=self.signed(
                {
                    "code": "0",
                    "pid": "12",
                    "out_trade_no": self.order_id,
                    "trade_no": "pay-" + self.order_id,
                    "type": self.method,
                    "money": self.money,
                    "status": "1" if self.paid else "0",
                    "endtime": self.customer.now.astimezone(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M:%S")
                    if self.paid
                    else "",
                    **self.query_fields,
                }
            ),
        )

    def callback(self, **changes: str) -> str:
        return urlencode(
            self.signed(
                {
                    "pid": "12",
                    "out_trade_no": self.order_id,
                    "trade_no": "pay-" + self.order_id,
                    "type": self.method,
                    "money": self.money,
                    "trade_status": "TRADE_SUCCESS",
                    **changes,
                }
            )
        )


async def service(customer: WalletClient) -> tuple[PaymentService, Provider]:
    rates: Final = ExchangeRateRepository(customer.database)
    await customer.database.execute_raw('DELETE FROM "CommerceExchangeRate"')
    await rates.save(ExchangeRate(rate=Decimal("7.1234"), rate_date=customer.now.date(), fetched_at=customer.now))
    provider: Final = Provider(customer)
    client: Final = GoepayClient(
        "https://payments.example.test",
        "12",
        GoepaySignature(MERCHANT, PLATFORM.public_key(), lambda: customer.now),
        httpx.MockTransport(provider.send),
    )
    gateway: Final = GoepayGateway(
        client, rates.latest, "https://customer.example.test", lambda: customer.now, recover_checkout=True
    )
    payments: Final = PaymentService(PaymentRepository(customer.database), gateway, lambda: customer.now)
    customer.app.dependency_overrides[get_payment_service] = lambda: payments
    return payments, provider


@pytest.mark.asyncio
async def test_expired_checkout_is_hidden_but_verified_late_payment_still_credits_once(
    wallet_client: WalletClient,
) -> None:
    payments, provider = await service(wallet_client)
    created: Final = await payments.create(
        wallet_client.session, RechargeInput(amount_usd="10", network="alipay"), uuid4().hex
    )
    assert isinstance(created, RechargeOrder)
    deadline: Final = wallet_client.now + timedelta(seconds=5)
    await wallet_client.database.execute_raw(
        'UPDATE "CommerceRechargeOrder" SET checkout_url=$2 WHERE id=$1',
        created.id,
        "https://payments.example.test/checkout/test?expires=" + str(int(deadline.timestamp())),
    )
    later: Final = PaymentService(payments.store, payments.gateway, lambda: wallet_client.now + timedelta(minutes=2))
    expired: Final = await later.get(created.id, created.user_id)
    assert isinstance(expired, RechargeOrder) and expired.status == "expired" and expired.checkout_url is None
    assert expired.checkout_expires_at is not None and expired.checkout_expires_at <= later.clock()
    provider.paid = True
    provider.query_fields = {
        "endtime": (wallet_client.now + timedelta(seconds=30))
        .astimezone(timezone(timedelta(hours=8)))
        .strftime("%Y-%m-%d %H:%M:%S")
    }
    paid: Final = await later.refresh(created.id, created.user_id, created.user_id)
    assert isinstance(paid, RechargeOrder) and paid.status == "paid" and paid.checkout_url is None
    assert paid.paid_at is not None and paid.paid_at > expired.checkout_expires_at
    repeated: Final = await later.refresh(created.id, created.user_id, created.user_id)
    assert isinstance(repeated, RechargeOrder) and repeated.status == "paid"
    balance: Final = await wallet_client.http.get("/account/api/v1/wallet")
    assert balance.json()["available_units"] == str(created.credit_units)


@pytest.mark.asyncio
async def test_expired_uncertain_creation_is_queried_without_reissuing_checkout(wallet_client: WalletClient) -> None:
    payments, provider = await service(wallet_client)
    provider.timeout_create = True
    result: Final = await payments.create(
        wallet_client.session, RechargeInput(amount_usd="10", network="alipay"), uuid4().hex
    )
    assert isinstance(result, AuthError)
    assert isinstance(payments.gateway, GoepayGateway)
    later_time: Final = wallet_client.now + CHECKOUT_LIFETIME + timedelta(seconds=1)
    later_gateway: Final = GoepayGateway(
        payments.gateway.client,
        payments.gateway.rates,
        payments.gateway.public_url,
        lambda: later_time,
        recover_checkout=True,
    )
    later: Final = PaymentService(payments.store, later_gateway, lambda: later_time)
    checked: Final = await later.refresh(provider.order_id, wallet_client.session.customer.user_id, "test")
    assert isinstance(checked, RechargeOrder) and checked.status == "expired" and checked.checkout_url is None
    assert provider.create_calls == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ("alipay", "wxpay"))
async def test_goepay_get_callback_credits_once_with_a_locked_rate(wallet_client: WalletClient, method: str) -> None:
    payments, provider = await service(wallet_client)
    order: Final = await payments.create(
        wallet_client.session, RechargeInput.model_validate({"amount_usd": "10", "network": method}), uuid4().hex
    )
    assert (
        isinstance(order, RechargeOrder)
        and order.asset == "CNY"
        and order.payment_amount == "71.24"
        and order.amount_usdt is None
    )
    await ExchangeRateRepository(wallet_client.database).save(
        ExchangeRate(
            rate=Decimal("8"), rate_date=wallet_client.now.date(), fetched_at=wallet_client.now + timedelta(seconds=1)
        )
    )
    provider.paid = True
    responses: Final = await asyncio.gather(
        *(wallet_client.http.get("/commerce/webhooks/goepay?" + provider.callback()) for _ in range(5))
    )
    assert all(response.status_code == 200 and response.content == b"success" for response in responses)
    balance: Final = await wallet_client.http.get("/account/api/v1/wallet")
    assert balance.json()["available_units"] == "10000000000"
    ledger: Final = await wallet_client.http.get("/account/api/v1/wallet/transactions")
    assert len(ledger.json()["items"]) == 1 and provider.create_calls == 1


@pytest.mark.asyncio
async def test_goepay_callback_amount_mismatch_and_duplicate_query_fields_never_acknowledge_payment(
    wallet_client: WalletClient,
) -> None:
    payments, provider = await service(wallet_client)
    result: Final = await payments.create(
        wallet_client.session, RechargeInput(amount_usd="10", network="alipay"), uuid4().hex
    )
    assert not isinstance(result, AuthError)
    provider.paid = True
    wrong: Final = await wallet_client.http.get("/commerce/webhooks/goepay?" + provider.callback(money="0.01"))
    duplicate: Final = await wallet_client.http.get("/commerce/webhooks/goepay?" + provider.callback() + "&money=71.24")
    assert wrong.status_code != 200 and duplicate.status_code != 200
    assert (await wallet_client.http.get("/account/api/v1/wallet")).json()["available_units"] == "0"


@pytest.mark.asyncio
async def test_existing_order_retries_keep_the_original_quote_even_when_rates_are_unavailable(
    wallet_client: WalletClient,
) -> None:
    payments, provider = await service(wallet_client)
    request_id: Final = uuid4().hex
    body: Final = RechargeInput(amount_usd="10", network="alipay")
    first: Final = await payments.create(wallet_client.session, body, request_id)
    assert isinstance(first, RechargeOrder)
    await wallet_client.database.execute_raw('DELETE FROM "CommerceExchangeRate"')
    retry: Final = await payments.create(wallet_client.session, body, request_id)
    assert isinstance(retry, RechargeOrder) and retry.id == first.id and retry.payment_amount == first.payment_amount
    assert provider.create_calls == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "fields",
    (
        {"refundmoney": "0.01"},
        {"refundmoney": "bad"},
        {"refundmoney": "-1"},
        {"status": "2"},
        {"status": "3"},
        {"status": "4"},
        {"money": "0.01"},
        {"pid": "999"},
        {"type": "wxpay"},
    ),
)
async def test_goepay_rejects_refunded_frozen_or_mismatched_query_receipts(
    wallet_client: WalletClient, fields: dict[str, str]
) -> None:
    payments, provider = await service(wallet_client)
    order: Final = await payments.create(
        wallet_client.session, RechargeInput(amount_usd="10", network="alipay"), uuid4().hex
    )
    assert isinstance(order, RechargeOrder)
    provider.paid = True
    provider.query_fields = fields
    result: Final = await wallet_client.http.get("/commerce/webhooks/goepay?" + provider.callback())
    assert result.status_code != 200
    assert (await wallet_client.http.get("/account/api/v1/wallet")).json()["available_units"] == "0"


@pytest.mark.asyncio
async def test_goepay_preserves_checkout_when_an_initial_query_is_unavailable(wallet_client: WalletClient) -> None:
    payments, provider = await service(wallet_client)
    provider.reject_query = True
    order: Final = await payments.create(
        wallet_client.session, RechargeInput(amount_usd="10", network="alipay"), uuid4().hex
    )
    assert isinstance(order, RechargeOrder) and order.checkout_url and order.status == "pending"
    assert (await wallet_client.http.get("/account/api/v1/wallet")).json()["available_units"] == "0"


@pytest.mark.asyncio
async def test_goepay_confirms_a_paid_order_after_the_create_response_is_lost(wallet_client: WalletClient) -> None:
    payments, provider = await service(wallet_client)
    provider.timeout_create = True
    result: Final = await payments.create(
        wallet_client.session, RechargeInput(amount_usd="10", network="alipay"), uuid4().hex
    )
    assert isinstance(result, AuthError)
    provider.paid = True
    callback: Final = await wallet_client.http.get("/commerce/webhooks/goepay?" + provider.callback())
    assert callback.status_code == 200 and callback.content == b"success"
    assert provider.create_calls == 1
    assert (await wallet_client.http.get("/account/api/v1/wallet")).json()["available_units"] == "10000000000"


@pytest.mark.asyncio
async def test_checkout_recovery_only_replays_a_confirmed_unpaid_original_order_on_explicit_refresh(
    wallet_client: WalletClient,
) -> None:
    payments, provider = await service(wallet_client)
    provider.timeout_create = True
    request_id: Final = uuid4().hex
    body: Final = RechargeInput(amount_usd="10", network="alipay")
    assert isinstance(await payments.create(wallet_client.session, body, request_id), AuthError)
    notification: Final = await wallet_client.http.get("/commerce/webhooks/goepay?" + provider.callback())
    assert notification.status_code != 200 and provider.create_calls == 1
    recovered: Final = await payments.refresh(
        provider.order_id, wallet_client.session.customer.user_id, wallet_client.session.customer.user_id
    )
    assert isinstance(recovered, RechargeOrder) and recovered.checkout_url and recovered.status == "pending"
    assert recovered.id == provider.order_id and provider.create_calls == 2
    assert (await wallet_client.http.get("/account/api/v1/wallet")).json()["available_units"] == "0"
