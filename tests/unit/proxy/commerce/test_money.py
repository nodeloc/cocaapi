import pytest

from litellm.models.commerce_auth import AuthError
from litellm.proxy.commerce.wallet_service import parse_usd


@pytest.mark.parametrize("value,units", [("0.01", 10_000_000), ("5.50", 5_500_000_000), ("100000", 100_000_000_000_000)])
def test_decimal_credit_amount_is_exact(value: str, units: int) -> None:
    assert parse_usd(value) == units


@pytest.mark.parametrize("value", ["0", "-1", "NaN", "Infinity", "1e3", "0.001", "1.234", "100001", " 1", "1 ", "1,000", "01", "1."])
def test_invalid_or_overprecise_credit_amount_is_rejected(value: str) -> None:
    assert isinstance(parse_usd(value), AuthError)
