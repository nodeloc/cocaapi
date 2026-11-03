from datetime import datetime, timedelta, timezone
from typing import Final
from urllib.parse import parse_qs, urlsplit

from litellm.models.commerce_payment import StoredOrder

CHECKOUT_LIFETIME: Final = timedelta(minutes=30)


def checkout_deadline(order: StoredOrder) -> datetime | None:
    if order.provider != "goepay":
        return order.expires_at
    local: Final = min(order.created_at + CHECKOUT_LIFETIME, order.expires_at or order.created_at + CHECKOUT_LIFETIME)
    if not order.checkout_url:
        return local
    try:
        query: Final = parse_qs(urlsplit(order.checkout_url).query, keep_blank_values=True, max_num_fields=32)
        values: Final = query.get("expires")
        if values is None:
            return local
        if len(values) != 1 or not values[0].isascii() or not values[0].isdigit() or len(values[0]) > 12:
            return order.created_at
        timestamp: Final = int(values[0])
        if timestamp <= 0:
            return order.created_at
        return min(local, datetime.fromtimestamp(timestamp, tz=timezone.utc))
    except (ValueError, OverflowError, OSError):
        return order.created_at
