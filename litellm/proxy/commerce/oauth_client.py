from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Final, Protocol

import httpx2 as httpx
from pydantic import BaseModel, ConfigDict, EmailStr, Field, TypeAdapter

from litellm.models.commerce_auth import AuthError, ExternalIdentity, OAuthFlow, ProviderID
from litellm.proxy.commerce.config import AccountSettings, ProviderSettings
from litellm.proxy.commerce.security import AuthSecurity

if TYPE_CHECKING:
    from authlib.integrations.httpx_client import AsyncOAuth2Client


class ProviderEndpoints(BaseModel):
    model_config = ConfigDict(frozen=True)
    authorize: str
    token: str
    userinfo: str
    jwks: str | None = None


def endpoints(provider: ProviderID) -> ProviderEndpoints:
    match provider:
        case "github":
            return ProviderEndpoints(
                authorize="https://github.com/login/oauth/authorize",
                token="https://github.com/login/oauth/access_token",
                userinfo="https://api.github.com/user",
            )
        case "google":
            return ProviderEndpoints(
                authorize="https://accounts.google.com/o/oauth2/v2/auth",
                token="https://oauth2.googleapis.com/token",
                userinfo="https://openidconnect.googleapis.com/v1/userinfo",
                jwks="https://www.googleapis.com/oauth2/v3/certs",
            )
        case "nodeloc":
            return ProviderEndpoints(
                authorize="https://www.nodeloc.com/oauth-provider/authorize",
                token="https://www.nodeloc.com/oauth-provider/token",
                userinfo="https://www.nodeloc.com/oauth-provider/userinfo",
                jwks="https://www.nodeloc.com/.well-known/jwks.json",
            )


class GitHubUser(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: int = Field(gt=0, strict=True)
    login: str


class GitHubEmail(BaseModel):
    model_config = ConfigDict(frozen=True)
    email: EmailStr
    primary: bool
    verified: bool


class OIDCUser(BaseModel):
    model_config = ConfigDict(frozen=True)
    sub: str = Field(min_length=1, max_length=255)
    email: EmailStr | None = None
    email_verified: bool = Field(default=False, strict=True)
    name: str = ""


class OAuthClient(Protocol):
    async def authorize(self, provider: ProviderSettings, state: str, flow: OAuthFlow) -> str | AuthError: ...
    async def exchange(
        self, provider: ProviderSettings, code: str, flow: OAuthFlow
    ) -> ExternalIdentity | AuthError: ...


class ProviderClient:
    def __init__(
        self, settings: AccountSettings, security: AuthSecurity, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self.settings = settings
        self.security = security
        self.transport = transport

    def callback(self, provider: ProviderSettings) -> str:
        return f"{self.settings.public_url}/account/api/v1/oauth/{provider.id}/callback"

    @asynccontextmanager
    async def _http(self, provider: ProviderSettings) -> AsyncIterator["AsyncOAuth2Client"]:
        from authlib.integrations.httpx_client import AsyncOAuth2Client

        client: Final = AsyncOAuth2Client(
            provider.client_id,
            provider.client_secret.get_secret_value(),
            redirect_uri=self.callback(provider),
            scope="read:user user:email" if provider.id == "github" else "openid profile email",
            code_challenge_method="S256",
            token_endpoint_auth_method="client_secret_post",
            transport=self.transport,
            timeout=15,
            follow_redirects=False,
            headers={"Accept": "application/json", "User-Agent": "CocaAPI/1.0"},
        )
        try:
            yield client
        finally:
            await client.aclose()  # pyright: ignore[reportAttributeAccessIssue]  # Authlib has a dynamic HTTPX base

    async def authorize(self, provider: ProviderSettings, state: str, flow: OAuthFlow) -> str | AuthError:
        verifier: Final = self.security.unseal(flow.verifier)
        nonce: Final = self.security.unseal(flow.nonce)
        if not verifier or not nonce:
            return AuthError("invalid_authorization")
        async with self._http(provider) as client:
            url, _ = client.create_authorization_url(
                endpoints(provider.id).authorize,
                state=state,
                code_verifier=verifier,
                nonce=nonce,
                **(
                    {"prompt": "select_account" if provider.id != "nodeloc" else "login"}
                    if flow.intent == "reauth"
                    else {}
                ),
                **({"max_age": 0} if flow.intent == "reauth" and provider.id != "github" else {}),
            )
            return url

    async def exchange(self, provider: ProviderSettings, code: str, flow: OAuthFlow) -> ExternalIdentity | AuthError:
        from authlib.integrations.base_client.errors import OAuthError
        from authlib.oauth2.rfc6749.errors import OAuth2Error
        from joserfc.errors import JoseError
        from pydantic import ValidationError

        verifier: Final = self.security.unseal(flow.verifier)
        nonce: Final = self.security.unseal(flow.nonce)
        if not verifier or not nonce:
            return AuthError("invalid_authorization")
        urls: Final = endpoints(provider.id)
        try:
            async with self._http(provider) as client:
                token: Final = await client.fetch_token(
                    urls.token, code=code, code_verifier=verifier, grant_type="authorization_code"
                )
                response: Final = await client.request("GET", urls.userinfo)
                response.raise_for_status()
                if provider.id == "github":
                    user: Final = GitHubUser.model_validate(response.json())
                    emails_response: Final = await client.request("GET", "https://api.github.com/user/emails")
                    emails_response.raise_for_status()
                    emails: Final = TypeAdapter(tuple[GitHubEmail, ...]).validate_python(emails_response.json())
                    verified: Final = next((email for email in emails if email.primary and email.verified), None)
                    return ExternalIdentity(
                        issuer=provider.issuer,
                        subject=str(user.id),
                        name=user.login,
                        email=str(verified.email).lower() if verified else None,
                        email_verified=verified is not None,
                    )
                from authlib.oidc.core import CodeIDToken
                from joserfc import jwt
                from joserfc.jwk import KeySet

                if urls.jwks is None:
                    return AuthError("provider_unavailable", 503)
                keys_response: Final = await client.request("GET", urls.jwks, withhold_token=True)
                keys_response.raise_for_status()
                decoded: Final = jwt.decode(
                    TypeAdapter(str).validate_python(token.get("id_token")),
                    KeySet.import_key_set(keys_response.json()),
                    algorithms=["RS256"],
                )
                claims: Final = CodeIDToken(
                    decoded.claims,
                    decoded.header,
                    {"iss": {"essential": True, "value": provider.issuer}},
                    {"client_id": provider.client_id, "nonce": nonce, "access_token": token["access_token"]},
                )
                claims.validate(leeway=30)
                userinfo: Final = OIDCUser.model_validate(response.json())
                if userinfo.sub != claims["sub"] or claims.get("nonce") != nonce:
                    return AuthError("invalid_authorization")
                if flow.intent == "reauth":
                    auth_time: Final = claims.get("auth_time")
                    if (
                        not isinstance(auth_time, int)
                        or not -30 <= datetime.now(timezone.utc).timestamp() - auth_time <= 300
                    ):
                        return AuthError("reauthentication_required", 403)
                return ExternalIdentity(
                    issuer=provider.issuer,
                    subject=userinfo.sub,
                    name=userinfo.name[:255],
                    email=str(userinfo.email).lower() if userinfo.email and userinfo.email_verified else None,
                    email_verified=userinfo.email_verified and userinfo.email is not None,
                )
        except OAuthError as error:
            return AuthError(
                "provider_credentials_invalid" if error.error == "invalid_client" else "provider_authorization_failed",
                502,
            )
        except (httpx.HTTPError, OAuth2Error, JoseError, ValidationError, ValueError, KeyError):
            return AuthError("provider_authorization_failed", 502)
