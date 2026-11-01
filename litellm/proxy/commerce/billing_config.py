import os
from collections.abc import Mapping
from typing import Final

from litellm.proxy.commerce.security import AuthSecurity


def redemption_security(values: Mapping[str, str] = os.environ) -> AuthSecurity | None:
    secret: Final = values.get("COCAAPI_REDEMPTION_SECRET", "")
    return AuthSecurity(secret) if len(secret) >= 32 else None
