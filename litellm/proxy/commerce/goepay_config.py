import os
from collections.abc import Mapping
from functools import lru_cache
from pathlib import Path
from typing import Final
from urllib.parse import urlsplit

from pydantic import Field, ValidationError, field_validator

from litellm.models.commerce_auth import AuthError, FrozenModel
from litellm.proxy.commerce.goepay_protocol import GoepaySignature


class GoepaySettings(FrozenModel):
    origin: str
    merchant_id: str = Field(pattern=r"^[1-9][0-9]{0,17}$")
    private_key_file: str
    public_key_file: str
    recover_checkout: bool = False

    @field_validator("origin")
    @classmethod
    def validate_origin(cls, value: str) -> str:
        parsed: Final = urlsplit(value)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in {"", "/"}
        ):
            raise ValueError("Payment origin must use HTTPS without a path or credentials")
        return value.rstrip("/")


def goepay_settings(values: Mapping[str, str] = os.environ) -> GoepaySettings | None:
    if values.get("COCAAPI_GOEPAY_ENABLED", "").lower() != "true":
        return None
    try:
        return GoepaySettings(
            origin=values.get("COCAAPI_GOEPAY_ORIGIN", ""),
            merchant_id=values.get("COCAAPI_GOEPAY_MERCHANT_ID", ""),
            private_key_file=values.get("COCAAPI_GOEPAY_PRIVATE_KEY_FILE", "/run/cocaapi-payments/merchant.pem"),
            public_key_file=values.get("COCAAPI_GOEPAY_PUBLIC_KEY_FILE", "/run/cocaapi-payments/platform.pem"),
            recover_checkout=values.get("COCAAPI_GOEPAY_RECOVER_CHECKOUT", "").lower() == "true",
        )
    except ValidationError:
        return None


@lru_cache(maxsize=1)
def goepay_signature(private_key_file: str, public_key_file: str) -> GoepaySignature | AuthError:
    try:
        private: Final = Path(private_key_file).read_bytes()
        public: Final = Path(public_key_file).read_bytes()
        if len(private) > 16_384 or len(public) > 16_384:
            return AuthError("payment_unavailable", 503)
        return GoepaySignature.from_pem(private, public)
    except OSError:
        return AuthError("payment_unavailable", 503)
