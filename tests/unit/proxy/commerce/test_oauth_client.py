from datetime import datetime, timedelta, timezone
from typing import Final
from urllib.parse import parse_qs, urlsplit

import httpx2 as httpx
import pytest
from joserfc import jwt
from joserfc.jwk import RSAKey
from pydantic import SecretStr

from litellm.models.commerce_auth import AuthError, ExternalIdentity, OAuthFlow
from litellm.proxy.commerce.config import AccountSettings, ProviderSettings, provider_from_credentials
from litellm.proxy.commerce.oauth_client import ProviderClient
from litellm.proxy.commerce.security import AuthSecurity


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "provider_id,issuer", [("google", "https://accounts.google.com"), ("nodeloc", "https://www.nodeloc.com")]
)
@pytest.mark.parametrize(
    "fault",
    [
        None,
        "nonce",
        "issuer",
        "audience",
        "expired",
        "signature",
        "subject",
        "reauth_valid",
        "reauth_missing",
        "reauth_stale",
    ],
)
async def test_oidc_identity_requires_valid_signature_claims_and_matching_userinfo(provider_id, issuer, fault):
    now: Final = datetime.now(timezone.utc)
    security: Final = AuthSecurity("unit-test-secret" * 8)
    provider: Final = ProviderSettings.model_validate(
        {
            "id": provider_id,
            "label": provider_id,
            "issuer": issuer,
            "client_id": "test-client",
            "client_secret": "test-secret",
        }
    )
    settings: Final = AccountSettings(secret=SecretStr("unit-test-secret" * 8), providers=(provider,))
    flow: Final = OAuthFlow.model_validate(
        {
            "state_hash": "test",
            "browser_hash": "browser",
            "provider": provider_id,
            "intent": "reauth" if fault and fault.startswith("reauth") else "login",
            "nonce": security.seal("expected-nonce"),
            "verifier": security.seal("x" * 64),
            "return_path": "/account/profile/",
            "expires_at": now + timedelta(minutes=10),
        }
    )
    key: Final = RSAKey.generate_key(2048, parameters={"kid": "test"})
    signed: Final = jwt.encode(
        {"alg": "RS256", "kid": "test"},
        {
            "iss": "https://evil.test" if fault == "issuer" else issuer,
            "aud": "other-client" if fault == "audience" else provider.client_id,
            "sub": "subject-123",
            "nonce": "wrong-nonce" if fault == "nonce" else "expected-nonce",
            "iat": int(now.timestamp()) - 60,
            "auth_time": None
            if fault == "reauth_missing"
            else int(now.timestamp()) - (600 if fault == "reauth_stale" else 60),
            "exp": int(now.timestamp()) + (-120 if fault == "expired" else 300),
        },
        RSAKey.generate_key(2048, parameters={"kid": "test"}) if fault == "signature" else key,
    )

    def upstream(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            form: Final = parse_qs(request.content.decode())
            assert form["code_verifier"] == ["x" * 64]
            assert form["redirect_uri"] == [f"https://cocaapi.com/account/api/v1/oauth/{provider_id}/callback"]
            return httpx.Response(
                200, json={"access_token": "provider-token", "token_type": "Bearer", "id_token": signed}
            )
        if "certs" in request.url.path or "jwks" in request.url.path:
            assert "authorization" not in request.headers
            return httpx.Response(200, json={"keys": [key.as_dict(private=False)]})
        assert request.headers["authorization"] == "Bearer provider-token"
        return httpx.Response(
            200,
            json={
                "sub": "other-subject" if fault == "subject" else "subject-123",
                "email": "user@example.com",
                "email_verified": True,
                "name": "Test",
            },
        )

    client: Final = ProviderClient(settings, security, httpx.MockTransport(upstream))
    result: Final = await client.exchange(provider, "test-code", flow)
    if fault and fault != "reauth_valid":
        assert isinstance(result, AuthError)
    else:
        assert isinstance(result, ExternalIdentity)
        assert result.subject == "subject-123"
        assert result.issuer == issuer
        assert result.email == "user@example.com"
        assert result.email_verified
    authorize: Final = await client.authorize(provider, "public-state", flow)
    assert isinstance(authorize, str)
    query: Final = parse_qs(urlsplit(authorize).query)
    assert query["code_challenge_method"] == ["S256"]
    assert query["state"] == ["public-state"]
    assert query["nonce"] == ["expected-nonce"]
    assert "client_secret" not in query
    if flow.intent == "reauth":
        assert query["max_age"] == ["0"]
        assert query["prompt"] == ["select_account" if provider_id == "google" else "login"]


@pytest.mark.asyncio
@pytest.mark.parametrize("error", ["invalid_client", "invalid_grant", "access_denied", "whitespace"])
async def test_provider_token_rejection_is_handled_and_pasted_credentials_are_normalized(error):
    security = AuthSecurity("unit-test-secret" * 8)
    provider = provider_from_credentials(
        "nodeloc",
        " client \r\n" if error == "whitespace" else "client",
        " secret \r\n" if error == "whitespace" else "secret",
    )
    flow = OAuthFlow(
        state_hash="test",
        browser_hash="browser",
        provider="nodeloc",
        intent="login",
        nonce=security.seal("nonce"),
        verifier=security.seal("x" * 64),
        return_path="/account/profile/",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )

    def upstream(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        form = parse_qs(request.content.decode())
        assert form["client_id"] == ["client"]
        assert form["client_secret"] == ["secret"]
        return httpx.Response(
            400,
            json={
                "error": "invalid_grant" if error == "whitespace" else error,
                "error_description": "must-not-be-echoed",
            },
        )

    settings = AccountSettings(secret=SecretStr("unit-test-secret" * 8), providers=(provider,))
    result = await ProviderClient(settings, security, httpx.MockTransport(upstream)).exchange(
        provider, "test-code", flow
    )
    assert isinstance(result, AuthError)
    assert result.code == (
        "provider_credentials_invalid" if error == "invalid_client" else "provider_authorization_failed"
    )
