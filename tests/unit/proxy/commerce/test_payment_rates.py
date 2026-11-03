from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Final

import httpx
import pytest

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_payment import ExchangeRate
from litellm.proxy.commerce.payment_rates import fetch_reference_rate, quote_cny

NOW: Final = datetime(2026, 1, 5, 12, tzinfo=timezone.utc)


def rate(**changes: object) -> ExchangeRate:
    return ExchangeRate.model_validate({"rate": "7.1234", "rate_date": NOW.date(), "fetched_at": NOW, **changes})


def test_quote_rounds_payable_cny_up_and_keeps_an_immutable_rate_snapshot() -> None:
    quote: Final = quote_cny(1_000_000_000, rate(), NOW)
    assert not isinstance(quote, AuthError)
    assert quote.amount == "7.13" and quote.asset == "CNY" and quote.rate == Decimal("7.1234")
    assert quote.rate_date == NOW.date() and quote.fetched_at == NOW
    tiny: Final = quote_cny(10_000_000, rate(), NOW)
    assert not isinstance(tiny, AuthError) and tiny.amount == "0.08"


@pytest.mark.parametrize(
    "changes",
    (
        {"fetched_at": NOW - timedelta(hours=37)},
        {"rate_date": NOW.date() - timedelta(days=8)},
        {"rate_date": NOW.date() + timedelta(days=1)},
        {"fetched_at": NOW + timedelta(minutes=6)},
    ),
)
def test_quote_refuses_stale_or_future_rates(changes: dict[str, object]) -> None:
    result: Final = quote_cny(1_000_000_000, rate(**changes), NOW)
    assert isinstance(result, AuthError) and result.code == "exchange_rate_unavailable"


@pytest.mark.asyncio
async def test_reference_client_parses_decimal_rates_without_binary_floats() -> None:
    transport: Final = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            text='{"date":"2026-01-05","base":"USD","quote":"CNY","rate":7.1234}',
            headers={"Content-Type": "application/json"},
        )
    )
    result: Final = await fetch_reference_rate(lambda: NOW, transport)
    assert not isinstance(result, AuthError) and result.rate == Decimal("7.1234")


@pytest.mark.parametrize(
    "fields", ({"base": "EUR"}, {"quote": "EUR"}, {"rate": "NaN"}, {"rate": "-1"}, {"date": "bad"})
)
@pytest.mark.asyncio
async def test_reference_client_rejects_wrong_pairs_or_invalid_rates(fields: dict[str, str]) -> None:
    transport: Final = httpx.MockTransport(
        lambda request: httpx.Response(
            200, json={"date": str(NOW.date()), "base": "USD", "quote": "CNY", "rate": "7.1234", **fields}
        )
    )
    result: Final = await fetch_reference_rate(lambda: NOW, transport)
    assert isinstance(result, AuthError) and result.code == "exchange_rate_unavailable"
