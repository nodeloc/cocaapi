from typing import Final

import pytest

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_billing_groups import BillingGroupCatalog
from litellm.proxy._types import LitellmUserRoles, UserAPIKeyAuth
from litellm.proxy.auth.user_api_key_auth import user_api_key_auth
from litellm.proxy.commerce.admin_billing_group_routes import get_billing_catalog
from litellm.repositories.commerce_billing_group_repository import BillingGroupRepository

from .conftest import WalletClient


@pytest.mark.asyncio
async def test_bulk_assignment_is_atomic_versioned_and_audited(wallet_client: WalletClient) -> None:
    client: Final = wallet_client.http
    wallet_client.app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(
        user_id="batch-admin", user_role=LitellmUserRoles.PROXY_ADMIN
    )
    headers: Final = {"Authorization": "Bearer batch-admin"}
    path: Final = "/commerce/admin/v1/billing-groups/members"
    ids: Final = (wallet_client.session.customer.user_id, wallet_client.other_session.customer.user_id)
    looked_up: Final = await client.post(path + "/lookup", headers=headers, json={"user_ids": [*ids, "system-account"]})
    assert looked_up.status_code == 200
    members: Final = looked_up.json()["items"]
    assert frozenset(member["user_id"] for member in members) == frozenset(ids)
    body: Final = {
        "group_id": "default",
        "reason": "批量归组验证",
        "members": [{"user_id": member["user_id"], "expected_version": member["version"]} for member in members],
    }
    repository: Final = BillingGroupRepository(wallet_client.database)
    first: Final = await repository.member(ids[0])
    assert not isinstance(first, AuthError)
    changed: Final = await client.post(
        path + "/" + ids[0],
        headers=headers,
        json={"group_id": "default", "expected_version": first.version, "reason": "并发修改"},
    )
    assert changed.status_code == 200
    before: Final = await repository.member(ids[1])
    assert not isinstance(before, AuthError)
    conflict: Final = await client.post(path + "/batch", headers=headers, json=body)
    assert conflict.status_code == 409
    assert await repository.member(ids[1]) == before
    refreshed: Final = await client.post(path + "/lookup", headers=headers, json={"user_ids": ids})
    targets: Final = refreshed.json()["items"]
    saved: Final = await client.post(
        path + "/batch",
        headers=headers,
        json={
            **body,
            "members": [{"user_id": member["user_id"], "expected_version": member["version"]} for member in targets],
        },
    )
    assert saved.status_code == 200
    assert all(
        member["version"] == next(value["version"] for value in targets if value["user_id"] == member["user_id"]) + 1
        for member in saved.json()["items"]
    )
    audit: Final = await wallet_client.database.query_raw(
        """SELECT target_id,details FROM "CommerceAuditEvent" WHERE actor_id='batch-admin'
        AND reason='批量归组验证' AND target_id=ANY($1::text[])""",
        list(ids),
    )
    assert len(audit) == len(ids)
    assert len(frozenset(str(row["details"]["batch_id"]) for row in audit)) == 1
    replay: Final = await client.post(path + "/batch", headers=headers, json=body)
    assert replay.status_code == 409


@pytest.mark.asyncio
async def test_group_lookup_is_read_only_and_batch_rejects_noncustomers(wallet_client: WalletClient) -> None:
    client: Final = wallet_client.http
    path: Final = "/commerce/admin/v1/billing-groups/members"
    uid: Final = wallet_client.session.customer.user_id
    wallet_client.app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(
        user_id="viewer", user_role=LitellmUserRoles.PROXY_ADMIN_VIEW_ONLY
    )
    assert (await client.post(path + "/lookup", json={"user_ids": [uid]})).status_code == 401
    headers: Final = {"Authorization": "Bearer viewer"}
    assert (await client.post(path + "/lookup", headers=headers, json={"user_ids": [uid]})).status_code == 200
    body: Final = {"group_id": "default", "reason": "授权验证", "members": [{"user_id": uid, "expected_version": 1}]}
    assert (await client.post(path + "/batch", headers=headers, json=body)).status_code == 403
    wallet_client.app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(
        user_id="admin", user_role=LitellmUserRoles.PROXY_ADMIN
    )
    missing: Final = await client.post(
        path + "/batch",
        headers=headers,
        json={
            **body,
            "members": [*body["members"], {"user_id": "system-account", "expected_version": 1}],
        },
    )
    assert missing.status_code == 404
    unchanged: Final = await BillingGroupRepository(wallet_client.database).member(uid)
    assert not isinstance(unchanged, AuthError) and unchanged.version == 1
    duplicate: Final = await client.post(
        path + "/batch", headers=headers, json={**body, "members": body["members"] * 2}
    )
    assert duplicate.status_code == 422


@pytest.mark.asyncio
async def test_group_admin_requires_full_admin_and_bearer_and_validates_catalog(wallet_client: WalletClient) -> None:
    client: Final = wallet_client.http
    path: Final = "/commerce/admin/v1/billing-groups"
    wallet_client.app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(
        user_id="test-admin", user_role=LitellmUserRoles.PROXY_ADMIN
    )
    wallet_client.app.dependency_overrides[get_billing_catalog] = lambda: BillingGroupCatalog(models=("granted-model",))
    assert (await client.get(path)).status_code == 401
    headers: Final = {"Authorization": "Bearer test-admin"}
    original: Final = await client.get(path, headers=headers)
    assert original.status_code == 200 and original.headers["Cache-Control"] == "no-store"
    policy: Final = {key: original.json()[key] for key in ("revision", "user_groups", "model_groups", "rules")}
    body: Final = {
        **policy,
        "reason": "测试组配置",
        "model_groups": [
            {"id": "default", "name": "普通模型组", "models": []},
            {"id": "premium", "name": "高级模型组", "models": ["not-in-catalog"]},
        ],
    }
    rejected: Final = await client.put(path, headers=headers, json=body)
    assert rejected.status_code == 422 and rejected.json()["detail"] == "billing_model_not_found"
    saved: Final = await client.put(path, headers=headers, json={**policy, "reason": "保存默认倍率"})
    assert saved.status_code == 200 and saved.json()["revision"] == original.json()["revision"] + 1
    stale: Final = await client.put(path, headers=headers, json={**policy, "reason": "过期版本"})
    assert stale.status_code == 409 and stale.json()["detail"] == "billing_config_conflict"
    members: Final = await client.get(
        path + "/members", headers=headers, params={"search": wallet_client.session.customer.user_id}
    )
    assert members.status_code == 200 and len(members.json()["items"]) == 1
    member: Final = members.json()["items"][0]
    assigned: Final = await client.post(
        path + "/members/" + member["user_id"],
        headers=headers,
        json={"group_id": "default", "expected_version": member["version"], "reason": "归组验收"},
    )
    assert assigned.status_code == 200 and assigned.json()["version"] == member["version"] + 1
    wallet_client.app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(
        user_id="viewer", user_role=LitellmUserRoles.PROXY_ADMIN_VIEW_ONLY
    )
    assert (await client.get(path, headers=headers)).status_code == 403
