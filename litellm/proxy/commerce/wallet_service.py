import re
from decimal import Decimal
from typing import Final

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_wallet import UNITS_PER_USD


def parse_usd(value: str) -> int | AuthError:
    if not re.fullmatch(r"(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,2})?", value):
        return AuthError("invalid_amount", 422)
    amount: Final = Decimal(value)
    if amount < Decimal("0.01") or amount > Decimal("100000"):
        return AuthError("invalid_amount", 422)
    return int(amount * UNITS_PER_USD)
