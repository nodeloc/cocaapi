from typing import Final
from uuid import uuid4

import pytest

from .conftest import WalletClient


@pytest.mark.asyncio
async def test_unconfigured_gateway_never_creates_a_payable_order(wallet_client: WalletClient) -> None:
    methods: Final = await wallet_client.http.get("/account/api/v1/payment-methods")
    assert methods.status_code == 200, methods.text
    assert methods.json()["enabled"] is False
    assert methods.json()["networks"] == []
    response: Final = await wallet_client.http.post("/account/api/v1/recharge-orders",
        headers={"Idempotency-Key": str(uuid4())}, json={"amount_usd": "10", "network": "tron"})
    assert response.status_code == 503
    balance: Final = await wallet_client.http.get("/account/api/v1/wallet")
    assert balance.json()["available_units"] == "0"
import asyncio
import uuid
from datetime import timedelta
from prisma.errors import RawQueryError

import pytest

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_payment import RechargeInput, RechargeOrder
from litellm.proxy.commerce.payment_routes import get_payment_service
from litellm.proxy.commerce.payment_service import PaymentService
from litellm.repositories.commerce_payment_repository import PaymentRepository
from .payment_support import TestGateway


def payments(wallet_client):
    gateway = TestGateway(wallet_client.now)
    service = PaymentService(PaymentRepository(wallet_client.database), gateway, lambda: wallet_client.now)
    wallet_client.app.dependency_overrides[get_payment_service] = lambda: service
    return service, gateway


@pytest.mark.asyncio
async def test_duplicate_notifications_and_refresh_credit_once(wallet_client):
    service, gateway = payments(wallet_client)
    request_id = uuid.uuid4().hex
    body = RechargeInput(amount_usd="12.34", network="tron")
    order = await service.create(wallet_client.session, body, request_id)
    assert isinstance(order, RechargeOrder)
    replay = await service.create(wallet_client.session, body, request_id)
    assert replay == order and gateway.create_calls == 1
    conflict = await service.create(wallet_client.session, RechargeInput(amount_usd="20", network="tron"), request_id)
    assert isinstance(conflict, AuthError) and conflict.status == 409
    notification = {"merchant_order_id": order.id, "event_id": uuid.uuid4().hex}
    forged = await wallet_client.http.post("/commerce/webhooks/test-gateway", json=notification)
    assert forged.status_code == 401 and gateway.fetch_calls == 0
    responses = await asyncio.gather(*(
        wallet_client.http.post("/commerce/webhooks/test-gateway", json=notification,
            headers={"X-Test-Signature": "test-only-valid"}) for _ in range(4)))
    assert all(response.status_code == 200 for response in responses)
    balance = await wallet_client.http.get("/account/api/v1/wallet")
    assert balance.json()["available_units"] == "12340000000"
    ledger = await wallet_client.http.get("/account/api/v1/wallet/transactions")
    assert len(ledger.json()["items"]) == 1
    assert isinstance(await service.get(order.id, wallet_client.other_session.customer.user_id), AuthError)
    public = (await wallet_client.http.get("/account/api/v1/recharge-orders")).json()["items"][0]
    assert "merchant_account_id" not in public and "request_key" not in public


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["merchant_order_id", "merchant_account_id", "external_id", "asset", "network", "amount_usdt"])
async def test_payment_mismatch_requires_review_without_credit(wallet_client, field):
    service, gateway = payments(wallet_client)
    order = await service.create(wallet_client.session, RechargeInput(amount_usd="10", network="tron"), uuid.uuid4().hex)
    assert isinstance(order, RechargeOrder)
    gateway.mismatch = field
    result = await service.refresh(order.id, wallet_client.session.customer.user_id, "test")
    assert isinstance(result, RechargeOrder) and result.status == "review"
    assert (await wallet_client.http.get("/account/api/v1/wallet")).json()["available_units"] == "0"


@pytest.mark.asyncio
async def test_uncertain_creation_is_recovered_by_lookup_not_recreated(wallet_client):
    service, gateway = payments(wallet_client)
    gateway.timeout = True
    key = uuid.uuid4().hex
    body = RechargeInput(amount_usd="10", network="tron")
    assert isinstance(await service.create(wallet_client.session, body, key), AuthError)
    retry = await service.create(wallet_client.session, body, key)
    assert isinstance(retry, RechargeOrder) and retry.status == "creating" and gateway.create_calls == 1
    early = await wallet_client.http.post("/commerce/webhooks/test-gateway", json={"merchant_order_id": retry.id, "event_id": uuid.uuid4().hex}, headers={"X-Test-Signature": "test-only-valid"})
    assert early.status_code == 503
    assert (await wallet_client.http.get("/account/api/v1/wallet")).json()["available_units"] == "0"
    gateway.recover_invoice = True
    recovered = await service.refresh(retry.id, wallet_client.session.customer.user_id, "test")
    assert isinstance(recovered, RechargeOrder) and recovered.status == "pending" and gateway.create_calls == 1


@pytest.mark.asyncio
async def test_payment_before_deadline_can_be_confirmed_after_expiry(wallet_client):
    service, gateway = payments(wallet_client)
    order = await service.create(wallet_client.session, RechargeInput(amount_usd="10", network="tron"), uuid.uuid4().hex)
    assert isinstance(order, RechargeOrder)
    later = PaymentService(service.store, gateway, lambda: wallet_client.now + timedelta(hours=1))
    result = await later.refresh(order.id, wallet_client.session.customer.user_id, "test")
    assert isinstance(result, RechargeOrder) and result.status == "paid"
    assert (await wallet_client.http.get("/account/api/v1/wallet")).json()["available_units"] == "10000000000"


@pytest.mark.asyncio
async def test_late_payment_is_not_credited(wallet_client):
    service, gateway = payments(wallet_client)
    order = await service.create(wallet_client.session, RechargeInput(amount_usd="10", network="tron"), uuid.uuid4().hex)
    assert isinstance(order, RechargeOrder)
    gateway.paid_at = wallet_client.now + timedelta(hours=2)
    result = await service.refresh(order.id, wallet_client.session.customer.user_id, "test")
    assert isinstance(result, RechargeOrder) and result.review_reason == "payment_time_mismatch"
    assert (await wallet_client.http.get("/account/api/v1/wallet")).json()["available_units"] == "0"


@pytest.mark.asyncio
async def test_paid_state_failure_rolls_back_credit_and_can_retry(wallet_client):
    service, gateway = payments(wallet_client)
    order = await service.create(wallet_client.session, RechargeInput(amount_usd="10", network="tron"), uuid.uuid4().hex)
    assert isinstance(order, RechargeOrder)
    token = uuid.uuid4().hex
    await wallet_client.database.execute_raw(f'''CREATE FUNCTION payment_reject_{token}() RETURNS TRIGGER LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'injected final order failure'; END; $$''')
    await wallet_client.database.execute_raw(f'''CREATE TRIGGER payment_reject_{token} BEFORE UPDATE ON "CommerceRechargeOrder"
        FOR EACH ROW WHEN (NEW.id='{order.id}' AND NEW.status='paid') EXECUTE FUNCTION payment_reject_{token}()''')
    try:
        with pytest.raises(RawQueryError):
            await service.refresh(order.id, wallet_client.session.customer.user_id, "test")
        assert (await wallet_client.http.get("/account/api/v1/wallet")).json()["available_units"] == "0"
        assert (await wallet_client.http.get("/account/api/v1/wallet/transactions")).json()["items"] == []
    finally:
        await wallet_client.database.execute_raw(f'DROP TRIGGER payment_reject_{token} ON "CommerceRechargeOrder"')
        await wallet_client.database.execute_raw(f'DROP FUNCTION payment_reject_{token}()')
    result = await service.refresh(order.id, wallet_client.session.customer.user_id, "test")
    assert isinstance(result, RechargeOrder) and result.status == "paid"
    assert (await wallet_client.http.get("/account/api/v1/wallet")).json()["available_units"] == "10000000000"
