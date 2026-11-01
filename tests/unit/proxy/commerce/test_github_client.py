from datetime import datetime, timedelta, timezone
from typing import Final
from urllib.parse import parse_qs, urlsplit

import httpx2 as httpx
import pytest
from pydantic import SecretStr

from litellm.models.commerce_auth import ExternalIdentity, OAuthFlow
from litellm.proxy.commerce.config import AccountSettings, ProviderSettings
from litellm.proxy.commerce.oauth_client import ProviderClient
from litellm.proxy.commerce.security import AuthSecurity


@pytest.mark.asyncio
@pytest.mark.parametrize("verified", [True, False])
async def test_github_uses_numeric_identity_and_only_primary_verified_email(verified: bool) -> None:
    security: Final = AuthSecurity("test-github-secret" * 8)
    provider: Final = ProviderSettings(
        id="github",
        label="GitHub",
        client_id="test-client",
        client_secret=SecretStr("test-secret"),
        issuer="https://github.com",
    )
    settings: Final = AccountSettings(secret=SecretStr("test-github-secret" * 8), providers=(provider,))
    flow: Final = OAuthFlow(
        state_hash="state",
        browser_hash="browser",
        provider="github",
        intent="reauth",
        nonce=security.seal("nonce"),
        verifier=security.seal("v" * 64),
        return_path="/account/profile/",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )

    def upstream(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            form: Final = parse_qs(request.content.decode())
            assert form["code_verifier"] == ["v" * 64]
            return httpx.Response(200, json={"access_token": "test-access-token", "token_type": "Bearer"})
        if request.url.path == "/user/emails":
            return httpx.Response(
                200,
                json=[
                    {"email": "primary@example.com", "primary": True, "verified": verified},
                    {"email": "secondary@example.com", "primary": False, "verified": True},
                ],
            )
        return httpx.Response(
            200, json={"id": 12345, "login": "changeable-name", "email": "untrusted-profile@example.com"}
        )

    client: Final = ProviderClient(settings, security, httpx.MockTransport(upstream))
    result: Final = await client.exchange(provider, "code", flow)
    assert isinstance(result, ExternalIdentity)
    assert result.subject == "12345"
    assert result.email == ("primary@example.com" if verified else None)
    assert result.email_verified == verified
    url: Final = await client.authorize(provider, "state", flow)
    assert isinstance(url, str)
    query: Final = parse_qs(urlsplit(url).query)
    assert query["prompt"] == ["select_account"]
    assert query["code_challenge_method"] == ["S256"]
