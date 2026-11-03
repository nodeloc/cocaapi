from datetime import datetime, timedelta, timezone
from typing import Final

import pytest

from litellm.models.commerce_payment import StoredOrder
from litellm.proxy.commerce.payment_checkout import CHECKOUT_LIFETIME, checkout_deadline

NOW: Final = datetime(2030, 1, 1, tzinfo=timezone.utc)


def order(query: str, *, provider: str = "goepay", expires_at: datetime | None = None) -> StoredOrder:
    return StoredOrder(
        id="checkout-test",
        user_id="customer",
        credit_units=1_000_000_000,
        network="alipay",
        asset="CNY",
        provider=provider,
        status="pending",
        amount_usdt=None,
        payment_amount="7.00",
        checkout_url="https://pay.example.test/checkout/test?" + query,
        external_id="external-test",
        expires_at=expires_at,
        paid_at=None,
        review_reason=None,
        created_at=NOW,
        request_key="request-test",
        merchant_account_id="merchant-test",
    )


def test_signed_link_deadline_and_local_deadline_use_the_earlier_time() -> None:
    earlier: Final = NOW + CHECKOUT_LIFETIME / 2
    later: Final = NOW + CHECKOUT_LIFETIME * 2
    assert checkout_deadline(order(f"expires={int(earlier.timestamp())}&token=opaque")) == earlier
    assert checkout_deadline(order(f"expires={int(later.timestamp())}&token=opaque")) == NOW + CHECKOUT_LIFETIME
    assert checkout_deadline(order("token=opaque")) == NOW + CHECKOUT_LIFETIME


@pytest.mark.parametrize(
    "query",
    (
        "expires=bad",
        "expires=",
        "expires=0",
        "expires=-1",
        "expires=99999999999999999999999",
        "expires=1893456001&expires=1893459999",
        "expires=1893456000.5",
    ),
)
def test_invalid_or_ambiguous_deadline_cannot_leave_a_payable_link(query: str) -> None:
    deadline: Final = checkout_deadline(order(query))
    assert deadline is not None and deadline <= NOW


def test_existing_payment_deadline_is_preserved_for_other_gateways() -> None:
    deadline: Final = NOW + timedelta(hours=1)
    assert checkout_deadline(order("expires=invalid", provider="test-gateway", expires_at=deadline)) == deadline
    assert checkout_deadline(order("", expires_at=NOW + timedelta(seconds=1))) == NOW + timedelta(seconds=1)
