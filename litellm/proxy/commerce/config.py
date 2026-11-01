import os
from collections.abc import Mapping
from typing import Final, Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, TypeAdapter, field_validator

from litellm.models.commerce_auth import FrozenModel, ProviderID


class ProviderSettings(FrozenModel):
    id: ProviderID
    label: str
    client_id: str
    client_secret: SecretStr
    issuer: str
    discovery_url: str | None = None
    pkce: bool = True


class AccountSettings(FrozenModel):
    public_url: str = "https://cocaapi.com"
    registration_enabled: bool = False
    secret: SecretStr = Field(min_length=32)
    providers: tuple[ProviderSettings, ...] = ()
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_from: str = ""
    smtp_security: Literal["starttls", "tls"] = "starttls"
    trusted_proxies: tuple[str, ...] = ()

    @field_validator("public_url")
    @classmethod
    def validate_public_url(cls, value: str) -> str:
        parsed: Final = urlsplit(value)
        if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}):
            raise ValueError("Account origin must use HTTPS")
        if parsed.path not in {"", "/"} or parsed.query or parsed.fragment or parsed.username:
            raise ValueError("Account origin must not contain credentials, a path or a query")
        return value.rstrip("/")

    @property
    def secure_cookies(self) -> bool:
        return self.public_url.startswith("https://")

    @property
    def email_ready(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)

    def provider(self, provider_id: str) -> ProviderSettings | None:
        return next((provider for provider in self.providers if provider.id == provider_id), None)


def provider_from_credentials(provider_id: ProviderID, client_id: str, client_secret: str) -> ProviderSettings:
    match provider_id:
        case "github":
            return ProviderSettings(
                id=provider_id,
                label="GitHub",
                client_id=client_id,
                client_secret=SecretStr(client_secret),
                issuer="https://github.com",
            )
        case "google":
            return ProviderSettings(
                id=provider_id,
                label="Google",
                client_id=client_id,
                client_secret=SecretStr(client_secret),
                issuer="https://accounts.google.com",
                discovery_url="https://accounts.google.com/.well-known/openid-configuration",
            )
        case "nodeloc":
            return ProviderSettings(
                id=provider_id,
                label="NodeLoc",
                client_id=client_id,
                client_secret=SecretStr(client_secret),
                issuer="https://www.nodeloc.com",
                discovery_url="https://www.nodeloc.com/oauth-provider/.well-known/openid-configuration",
            )


def _provider(values: Mapping[str, str], provider_id: ProviderID) -> ProviderSettings | None:
    prefix: Final = "COCAAPI_" + provider_id.upper()
    client_id: Final = values.get(prefix + "_CLIENT_ID", "")
    client_secret: Final = values.get(prefix + "_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        return None
    return provider_from_credentials(provider_id, client_id, client_secret)


def load_settings(values: Mapping[str, str] = os.environ) -> AccountSettings | None:
    secret: Final = values.get("COCAAPI_AUTH_SECRET", "")
    if not secret:
        return None
    candidates: Final = (
        _provider(values, "github"),
        _provider(values, "google"),
        _provider(values, "nodeloc"),
    )
    return AccountSettings(
        public_url=values.get("COCAAPI_PUBLIC_URL", values.get("PROXY_BASE_URL", "https://cocaapi.com")),
        registration_enabled=values.get("COCAAPI_REGISTRATION_ENABLED", "false").lower() == "true",
        secret=SecretStr(secret),
        providers=tuple(provider for provider in candidates if provider is not None),
        smtp_host=values.get("COCAAPI_SMTP_HOST", ""),
        smtp_port=int(values.get("COCAAPI_SMTP_PORT", "587")),
        smtp_username=values.get("COCAAPI_SMTP_USERNAME", ""),
        smtp_password=SecretStr(values.get("COCAAPI_SMTP_PASSWORD", "")),
        smtp_from=values.get("COCAAPI_SMTP_FROM", ""),
        smtp_security=TypeAdapter[Literal["starttls", "tls"]](Literal["starttls", "tls"]).validate_python(
            values.get("COCAAPI_SMTP_SECURITY", "starttls")
        ),
        trusted_proxies=tuple(
            value.strip() for value in values.get("COCAAPI_TRUSTED_PROXIES", "").split(",") if value.strip()
        ),
    )
