from typing import Final

import pytest

from litellm.models.commerce_billing_groups import BillingGroupCatalog
from litellm.proxy._types import LitellmUserRoles, UserAPIKeyAuth
from litellm.proxy.auth.user_api_key_auth import user_api_key_auth
from litellm.proxy.commerce.admin_billing_group_routes import get_billing_catalog

from .conftest import WalletClient


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
