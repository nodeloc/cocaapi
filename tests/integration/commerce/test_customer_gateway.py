from datetime import timedelta
from typing import Final
from uuid import uuid4

import pytest

from .conftest import WalletClient
from .gateway_support import gateway_client
from litellm.proxy._types import hash_token


async def grant(client: WalletClient) -> None:
    await client.database.execute_raw(
        """UPDATE "LiteLLM_UserTable" SET models=ARRAY['granted-model'],max_budget=20
        WHERE user_id=$1""",
        client.session.customer.user_id,
    )


async def seed_key(client: WalletClient, owner: str, alias: str) -> str:
    raw: Final = "sk-" + uuid4().hex
    await client.database.execute_raw(
        """INSERT INTO "LiteLLM_VerificationToken" (token,user_id,key_alias,models)
        VALUES ($1,$2,$3,ARRAY['granted-model'])""",
        hash_token(raw),
        owner,
        alias,
    )
    return raw


@pytest.mark.asyncio
async def test_customer_gateway_starts_with_no_unassigned_model_access(gateway_client: WalletClient) -> None:
    response: Final = await gateway_client.http.get("/account/api/v1/gateway/access")
    assert response.status_code == 200
    assert response.json()["models"] == []
    assert response.json()["max_budget_usd"] == 0
    assert response.json()["can_create_key"] is False


@pytest.mark.asyncio
async def test_gateway_data_requires_customer_session(gateway_client: WalletClient) -> None:
    gateway_client.http.cookies.clear()
    for path in ("access", "keys", "usage", "logs"):
        response: Final = await gateway_client.http.get("/account/api/v1/gateway/" + path)
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_keys_ignore_forged_owner_and_never_return_native_hashes(gateway_client: WalletClient) -> None:
    own: Final = await seed_key(gateway_client, gateway_client.session.customer.user_id, "personal")
    other: Final = await seed_key(gateway_client, gateway_client.other_session.customer.user_id, "other-person")
    response: Final = await gateway_client.http.get(
        "/account/api/v1/gateway/keys", params={"user_id": gateway_client.other_session.customer.user_id}
    )
    assert response.status_code == 200
    assert [row["name"] for row in response.json()["items"]] == ["personal"]
    assert own not in response.text and other not in response.text
    assert hash_token(own) not in response.text
    forged: Final = gateway_client.accounts.security.seal(hash_token(other))
    denied: Final = await gateway_client.http.post("/account/api/v1/gateway/keys/" + forged + "/delete")
    assert denied.status_code == 404
    rows: Final = await gateway_client.database.query_raw(
        'SELECT token FROM "LiteLLM_VerificationToken" WHERE token=$1', hash_token(other)
    )
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_key_creation_inherits_access_and_rejects_admin_fields(gateway_client: WalletClient) -> None:
    await grant(gateway_client)
    access: Final = await gateway_client.http.get("/account/api/v1/gateway/access")
    assert access.json()["models"] == ["granted-model"]
    assert access.json()["can_create_key"] is True
    forged: Final = await gateway_client.http.post(
        "/account/api/v1/gateway/keys",
        json={"name": "test", "user_id": gateway_client.other_session.customer.user_id, "max_budget": 999},
    )
    assert forged.status_code == 422
    created: Final = await gateway_client.http.post(
        "/account/api/v1/gateway/keys", json={"name": "personal", "expires_in_days": 30}
    )
    assert created.status_code == 201, created.text
    assert set(created.json()) == {"key"}
    assert created.json()["key"].startswith("sk-")
    keys: Final = await gateway_client.http.get("/account/api/v1/gateway/keys")
    assert created.json()["key"] not in keys.text and "server-only-master" not in created.text
    deleted: Final = await gateway_client.http.post(
        "/account/api/v1/gateway/keys/" + keys.json()["items"][0]["id"] + "/delete"
    )
    assert deleted.status_code == 200
    remaining: Final = await gateway_client.http.get("/account/api/v1/gateway/keys")
    assert remaining.json()["items"] == []


@pytest.mark.asyncio
async def test_key_creation_requires_budget_verification_and_csrf(gateway_client: WalletClient) -> None:
    blocked: Final = await gateway_client.http.post("/account/api/v1/gateway/keys", json={"name": "test"})
    assert blocked.status_code == 403
    await grant(gateway_client)
    csrf: Final = await gateway_client.http.post(
        "/account/api/v1/gateway/keys", json={"name": "test"}, headers={"X-CSRF-Token": "wrong"}
    )
    assert csrf.status_code == 403 and csrf.json()["detail"] == "invalid_csrf"
    await gateway_client.database.execute_raw(
        'UPDATE "CommerceCustomer" SET email_verified=false WHERE user_id=$1', gateway_client.session.customer.user_id
    )
    unverified: Final = await gateway_client.http.post("/account/api/v1/gateway/keys", json={"name": "test"})
    assert unverified.status_code == 403 and unverified.json()["detail"] == "email_verification_required"


@pytest.mark.asyncio
async def test_usage_scopes_by_key_ownership_not_the_untrusted_user_field(gateway_client: WalletClient) -> None:
    own: Final = await seed_key(gateway_client, gateway_client.session.customer.user_id, "own")
    other: Final = await seed_key(gateway_client, gateway_client.other_session.customer.user_id, "other")
    own_id: Final = uuid4().hex
    other_id: Final = uuid4().hex
    for request_id, raw, user, cost in (
        (own_id, own, gateway_client.other_session.customer.user_id, 1.25),
        (other_id, other, gateway_client.session.customer.user_id, 8.0),
    ):
        await gateway_client.database.execute_raw(
            """INSERT INTO "LiteLLM_SpendLogs" (request_id,call_type,api_key,"user",spend,total_tokens,
            prompt_tokens,completion_tokens,"startTime","endTime",model,model_group,status,api_base,messages)
            VALUES ($1,'completion',$2,$3,$4,12,7,5,$5::timestamptz,$5::timestamptz,'deployment-private','granted-model','success','https://private-upstream','{"secret":"prompt-private"}')""",
            request_id,
            hash_token(raw),
            user,
            cost,
            gateway_client.now,
        )
    await gateway_client.database.execute_raw(
        """INSERT INTO "LiteLLM_SpendLogs" (request_id,call_type,api_key,"startTime","endTime")
        VALUES ($1,'GET /v1/models',$2,$3::timestamptz,$3::timestamptz)""",
        uuid4().hex,
        hash_token(own),
        gateway_client.now,
    )
    summary: Final = await gateway_client.http.get(
        "/account/api/v1/gateway/usage", params={"days": 7, "user_id": gateway_client.other_session.customer.user_id}
    )
    assert summary.status_code == 200, summary.text
    assert len(summary.json()["daily_models"]) == 1
    assert summary.json()["daily_models"][0]["model"] == "granted-model"
    assert summary.json()["daily_models"][0]["spend_usd"] == 1.25
    local: Final = await gateway_client.http.get("/account/api/v1/gateway/usage", params={"timezone_offset": -480})
    assert local.json()["daily"][0]["day"] == (gateway_client.now + timedelta(hours=8)).date().isoformat()
    assert local.json()["daily_models"][0]["day"] == local.json()["daily"][0]["day"]
    assert summary.json()["totals"] == {
        "requests": 1,
        "prompt_tokens": 7,
        "completion_tokens": 5,
        "total_tokens": 12,
        "spend_usd": 1.25,
        "successful_requests": 1,
        "failed_requests": 0,
        "response_time_ms": 0.0,
        "timed_requests": 1,
    }
    logs: Final = await gateway_client.http.get("/account/api/v1/gateway/logs")
    assert [row["request_id"] for row in logs.json()["items"]] == [own_id]
    filtered: Final = await gateway_client.http.get(
        "/account/api/v1/gateway/logs",
        params={
            "search": own_id[:8],
            "model": "granted-model",
            "status": "success",
            "sort_by": "spend",
            "sort_order": "asc",
        },
    )
    assert [row["request_id"] for row in filtered.json()["items"]] == [own_id]
    assert filtered.json()["items"][0]["prompt_tokens"] == 7
    assert filtered.json()["items"][0]["completion_tokens"] == 5
    assert filtered.json()["items"][0]["ended_at"] is not None
    assert (
        "deployment-private" not in logs.text
        and "private-upstream" not in logs.text
        and "prompt-private" not in logs.text
    )
    await gateway_client.database.execute_raw(
        """INSERT INTO "LiteLLM_DeletedVerificationToken" (id,token,user_id,models)
        VALUES ($1,$2,$3,ARRAY['granted-model'])""",
        uuid4().hex,
        hash_token(own),
        gateway_client.session.customer.user_id,
    )
    await gateway_client.database.execute_raw('DELETE FROM "LiteLLM_VerificationToken" WHERE token=$1', hash_token(own))
    history: Final = await gateway_client.http.get("/account/api/v1/gateway/usage")
    assert history.json()["totals"]["requests"] == 1
    assert history.json()["totals"]["spend_usd"] == 1.25


@pytest.mark.asyncio
async def test_playground_rejects_other_keys_and_models_before_native_request(gateway_client: WalletClient) -> None:
    await grant(gateway_client)
    own: Final = await seed_key(gateway_client, gateway_client.session.customer.user_id, "own")
    other: Final = await seed_key(gateway_client, gateway_client.other_session.customer.user_id, "other")
    wrong_key: Final = await gateway_client.http.post(
        "/account/api/v1/gateway/playground", json={"api_key": other, "model": "granted-model", "prompt": "hello"}
    )
    assert wrong_key.status_code == 404
    wrong_model: Final = await gateway_client.http.post(
        "/account/api/v1/gateway/playground", json={"api_key": own, "model": "restricted-model", "prompt": "hello"}
    )
    assert wrong_model.status_code == 403
    own_result: Final = await gateway_client.http.post(
        "/account/api/v1/gateway/playground", json={"api_key": own, "model": "granted-model", "prompt": "hello"}
    )
    assert own_result.status_code == 200
    assert own_result.json()["content"] == "isolated completion"
    assert "internal" not in own_result.json()


@pytest.mark.asyncio
@pytest.mark.parametrize("gateway_client", ["default-team"], indirect=True)
async def test_default_team_key_is_deleted_before_any_secret_reaches_customer(gateway_client: WalletClient) -> None:
    await grant(gateway_client)
    result: Final = await gateway_client.http.post("/account/api/v1/gateway/keys", json={"name": "personal"})
    assert result.status_code == 503
    assert result.json() == {"detail": "personal_key_unavailable"}
    rows: Final = await gateway_client.database.query_raw(
        'SELECT token FROM "LiteLLM_VerificationToken" WHERE user_id=$1', gateway_client.session.customer.user_id
    )
    assert rows == []


@pytest.mark.asyncio
async def test_native_all_proxy_grant_is_visible_in_customer_catalog(gateway_client: WalletClient) -> None:
    await gateway_client.database.execute_raw(
        "UPDATE \"LiteLLM_UserTable\" SET models=ARRAY['all-proxy-models'],max_budget=20 WHERE user_id=$1",
        gateway_client.session.customer.user_id,
    )
    result: Final = await gateway_client.http.get("/account/api/v1/gateway/access")
    assert result.status_code == 200
    assert result.json()["models"] == ["granted-model", "restricted-model"]
    assert result.json()["can_create_key"] is True


@pytest.mark.asyncio
async def test_no_default_models_takes_precedence_over_other_grants(gateway_client: WalletClient) -> None:
    await gateway_client.database.execute_raw(
        "UPDATE \"LiteLLM_UserTable\" SET models=ARRAY['no-default-models','granted-model'],max_budget=20 WHERE user_id=$1",
        gateway_client.session.customer.user_id,
    )
    result: Final = await gateway_client.http.get("/account/api/v1/gateway/access")
    assert result.status_code == 200
    assert result.json()["models"] == []
    assert result.json()["can_create_key"] is False


@pytest.mark.asyncio
async def test_native_chat_preserves_conversation_and_rejects_ungranted_models(gateway_client: WalletClient) -> None:
    await grant(gateway_client)
    raw: Final = await seed_key(gateway_client, gateway_client.session.customer.user_id, "conversation")
    result: Final = await gateway_client.http.post(
        "/account/api/v1/gateway/playground",
        json={
            "api_key": raw,
            "model": "granted-model",
            "messages": [
                {"role": "system", "content": "Keep answers short"},
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "hi"},
                {"role": "user", "content": "continue"},
            ],
        },
    )
    assert result.status_code == 200, result.text
    assert result.json()["content"] == "isolated completion"


@pytest.mark.asyncio
async def test_native_key_expiry_and_model_subset_are_bounded(gateway_client: WalletClient) -> None:
    await grant(gateway_client)
    bad: Final = await gateway_client.http.post(
        "/account/api/v1/gateway/keys",
        json={
            "name": "restricted",
            "models": ["restricted-model"],
            "duration": "1h",
        },
    )
    assert bad.status_code == 403
    excessive: Final = await gateway_client.http.post(
        "/account/api/v1/gateway/keys", json={"name": "too-long", "duration": "9999d"}
    )
    assert excessive.status_code == 422


@pytest.mark.asyncio
async def test_native_key_detail_is_owned_and_usage_window_is_bounded(gateway_client: WalletClient) -> None:
    own: Final = await seed_key(gateway_client, gateway_client.session.customer.user_id, "detail")
    other: Final = await seed_key(gateway_client, gateway_client.other_session.customer.user_id, "private")
    own_id: Final = gateway_client.accounts.security.seal(hash_token(own))
    other_id: Final = gateway_client.accounts.security.seal(hash_token(other))
    allowed: Final = await gateway_client.http.get("/account/api/v1/gateway/keys/" + own_id)
    assert allowed.status_code == 200 and allowed.json()["name"] == "detail"
    assert own not in allowed.text and hash_token(own) not in allowed.text
    forbidden: Final = await gateway_client.http.get("/account/api/v1/gateway/keys/" + other_id)
    assert forbidden.status_code == 404
    bad_range: Final = await gateway_client.http.get(
        "/account/api/v1/gateway/usage",
        params={
            "start_time": "2020-01-01T00:00:00Z",
            "end_time": gateway_client.now.isoformat(),
        },
    )
    assert bad_range.status_code == 422
    naive_range: Final = await gateway_client.http.get(
        "/account/api/v1/gateway/logs",
        params={
            "start_time": "2020-01-01T00:00:00",
            "end_time": gateway_client.now.isoformat(),
        },
    )
    assert naive_range.status_code == 422
