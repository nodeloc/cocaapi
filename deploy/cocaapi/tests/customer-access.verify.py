import asyncio
import os
import secrets
from typing import Final
from urllib.parse import urlsplit

import httpx
from litellm.proxy._types import hash_token
from litellm.proxy.commerce.security import AuthSecurity
from prisma import Prisma


async def main() -> None:
    assert urlsplit(os.environ["DATABASE_URL"]).path == "/cocaapi_wallet_test"
    origin: Final = os.environ["COCAAPI_PUBLIC_URL"]
    assert origin == "http://localhost:4400"
    models: Final = tuple(os.environ["COCAAPI_DEFAULT_MODELS"].split(","))
    database: Final = Prisma()
    await database.connect()
    try:
        async with httpx.AsyncClient(base_url=origin, headers={"Origin": origin}, timeout=30) as client:
            current: Final = await client.get(
                "/commerce/admin/v1/login-settings",
                headers={"Authorization": "Bearer " + os.environ["LITELLM_MASTER_KEY"]},
            )
            assert current.status_code == 200
            settings: Final = await client.put(
                "/commerce/admin/v1/login-settings",
                headers={"Authorization": "Bearer " + os.environ["LITELLM_MASTER_KEY"]},
                json={
                    "revision": current.json()["revision"],
                    "registration_enabled": True,
                    "providers": [
                        {"id": provider, "enabled": False, "client_id": ""}
                        for provider in ("github", "google", "nodeloc")
                    ],
                },
            )
            assert settings.status_code == 200, settings.status_code
            methods: Final = await client.get("/account/api/v1/auth-methods")
            assert methods.status_code == 200
            client.headers["X-CSRF-Token"] = methods.json()["csrf_token"]
            email: Final = "access-" + secrets.token_hex(8) + "@example.com"
            password: Final = secrets.token_urlsafe(32) + "Aa1!"
            registered: Final = await client.post(
                "/account/api/v1/register", json={"email": email, "password": password}
            )
            assert registered.status_code == 201, registered.status_code
            rows: Final = await database.query_raw(
                'SELECT u.user_id,u.models,u.max_budget,u.user_role,m.payload FROM "LiteLLM_UserTable" u '
                'JOIN "CommerceMailOutbox" m USING(user_id) WHERE u.user_email=$1',
                email,
            )
            assert rows[0]["models"] == list(models) and rows[0]["max_budget"] is None
            assert rows[0]["user_role"] == "internal_user"
            message: Final = AuthSecurity(os.environ["COCAAPI_AUTH_SECRET"]).open_mail(rows[0]["payload"])
            assert message is not None
            verified: Final = await client.post("/account/api/v1/verify-email", json={"token": message.token})
            assert verified.status_code == 200
            login: Final = await client.post("/account/api/v1/login", json={"email": email, "password": password})
            assert login.status_code == 200
            me: Final = await client.get("/account/api/v1/me")
            client.headers["X-CSRF-Token"] = me.json()["csrf_token"]
            access: Final = await client.get("/account/api/v1/gateway/access")
            assert access.status_code == 200 and access.json()["can_create_key"]
            assert set(access.json()["models"]) == set(models)
            created: Final = await client.post(
                "/account/api/v1/gateway/keys",
                json={"name": "access-regression-" + secrets.token_hex(8), "models": ["all-proxy-models"]},
            )
            assert created.status_code == 201, created.status_code
            key_rows: Final = await database.query_raw(
                'SELECT models FROM "LiteLLM_VerificationToken" WHERE token=$1', hash_token(created.json()["key"])
            )
            assert set(key_rows[0]["models"]) == set(models)
            headers: Final = {"Authorization": "Bearer " + created.json()["key"]}
            available: Final = await client.get("/v1/models", headers=headers)
            assert available.status_code == 200
            assert {model["id"] for model in available.json()["data"]} == set(models)
            rejected: Final = await client.post(
                "/v1/chat/completions",
                headers=headers,
                json={"model": models[0], "messages": [{"role": "user", "content": "hello"}], "max_tokens": 8},
            )
            assert rejected.status_code == 402 and "insufficient_balance" in rejected.text
            admin: Final = await client.get("/commerce/admin/v1/login-settings", headers=headers)
            assert admin.status_code == 403
            print(
                "Registration with stored login settings, scoped Key creation, model list and zero-balance rejection verified"
            )
    finally:
        await database.disconnect()


asyncio.run(main())
