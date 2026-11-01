import base64
import hashlib
import hmac
import secrets
from typing import Final

from cryptography.fernet import Fernet, InvalidToken
from pydantic import ValidationError

from litellm.models.commerce_auth import MailPayload


def safe_return_path(path: str) -> str:
    return path if path in {"/account/profile/", "/account/security/"} else "/account/profile/"


class AuthSecurity:
    def __init__(self, secret: str) -> None:
        self._key = hashlib.sha256(("cocaapi-account-auth:" + secret).encode()).digest()
        self._cipher = Fernet(base64.urlsafe_b64encode(self._key))

    def digest(self, token: str, purpose: str) -> str:
        return hmac.new(self._key, (purpose + ":" + token).encode(), hashlib.sha256).hexdigest()

    def csrf(self, browser: str) -> str:
        return self.digest(browser, "csrf")

    def matches_csrf(self, browser: str, token: str) -> bool:
        return bool(browser and token) and secrets.compare_digest(self.csrf(browser), token)

    def seal(self, value: str) -> str:
        return self._cipher.encrypt(value.encode()).decode()

    def unseal(self, value: str) -> str | None:
        try:
            return self._cipher.decrypt(value.encode()).decode()
        except (InvalidToken, UnicodeError, ValueError):
            return None

    def open_mail(self, value: str) -> MailPayload | None:
        plaintext: Final = self.unseal(value)
        if plaintext is None:
            return None
        try:
            return MailPayload.model_validate_json(plaintext)
        except ValidationError:
            return None
