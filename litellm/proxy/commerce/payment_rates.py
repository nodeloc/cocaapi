import json
from collections.abc import Callable
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_UP, Decimal
from typing import Final, Literal

import httpx
from pydantic import Field, ValidationError

from litellm.models.commerce_auth import AuthError, FrozenModel
from litellm.models.commerce_payment import ExchangeRate, PaymentQuote
from litellm.models.commerce_wallet import UNITS_PER_USD
from litellm.proxy.commerce.auth_service import utcnow


class ReferenceRate(FrozenModel):
    rate_date: date = Field(alias="date")
    base: Literal["USD"]
    quote: Literal["CNY"]
    rate: Decimal = Field(gt=0, max_digits=24, decimal_places=12, allow_inf_nan=False)


def quote_cny(credit_units: int, rate: ExchangeRate, now: datetime) -> PaymentQuote | AuthError:
    if not timedelta(0) <= now.astimezone(timezone(timedelta(hours=8))).date() - rate.rate_date <= timedelta(days=7):
        return AuthError("exchange_rate_unavailable", 503)
    if not -timedelta(minutes=5) <= now - rate.fetched_at <= timedelta(hours=36):
        return AuthError("exchange_rate_unavailable", 503)
    amount: Final = (Decimal(credit_units) / UNITS_PER_USD * rate.rate).quantize(Decimal("0.01"), rounding=ROUND_UP)
    return PaymentQuote(
        amount=format(amount, ".2f"), asset="CNY", rate=rate.rate, rate_date=rate.rate_date, fetched_at=rate.fetched_at
    )


async def fetch_reference_rate(
    clock: Callable[[], datetime] = utcnow, transport: httpx.AsyncBaseTransport | None = None
) -> ExchangeRate | AuthError:
    try:
        async with httpx.AsyncClient(
            timeout=15, transport=transport, follow_redirects=False, trust_env=False
        ) as client:
            response: Final = await client.get("https://api.frankfurter.dev/v2/rate/USD/CNY")
        if response.status_code != 200 or len(response.content) > 16_384:
            return AuthError("exchange_rate_unavailable", 503)
        payload: Final = ReferenceRate.model_validate(json.loads(response.content, parse_float=str))
        snapshot: Final = ExchangeRate(rate=payload.rate, rate_date=payload.rate_date, fetched_at=clock())
        check: Final = quote_cny(UNITS_PER_USD, snapshot, clock())
        return check if isinstance(check, AuthError) else snapshot
    except (ValueError, TypeError, ValidationError, httpx.HTTPError):
        return AuthError("exchange_rate_unavailable", 503)
