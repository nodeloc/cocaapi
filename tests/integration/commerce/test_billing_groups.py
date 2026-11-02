import asyncio
from collections.abc import AsyncIterator
from typing import Final
from uuid import uuid4

import pytest
import pytest_asyncio

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_billing_groups import (
    BillingGroupAssignment,
    BillingGroupsUpdate,
    BillingGroupsView,
    PricingModelGroup,
    PricingRule,
    PricingUserGroup,
)
from litellm.proxy.commerce.auth_service import utcnow
from litellm.repositories.commerce_billing_group_repository import BillingGroupRepository
from litellm.repositories.commerce_wallet_repository import WalletRepository

from .conftest import WalletClient
from .gateway_support import gateway_client  # noqa: F401  # Pytest fixture discovery
from .test_customer_gateway import grant
from .test_wallet_billing import fund


@pytest_asyncio.fixture
async def groups(wallet_client: WalletClient) -> AsyncIterator[BillingGroupRepository]:
    repository: Final = BillingGroupRepository(wallet_client.database)
    yield repository
    await wallet_client.database.execute_raw(
        """UPDATE "CommerceCustomer" SET billing_group_id='default',billing_group_version=billing_group_version+1
        WHERE user_id IN ($1,$2)""",
        wallet_client.session.customer.user_id,
        wallet_client.other_session.customer.user_id,
    )
    current: Final = await repository.read()
    assert not isinstance(current, AuthError)
    restored: Final = await repository.save(
        BillingGroupsUpdate(revision=current.revision, reason="测试结束恢复默认策略"), "test-admin", utcnow()
    )
    assert not isinstance(restored, AuthError)


async def configure(groups: BillingGroupRepository, multiplier: str = "0.5", enabled: bool = True) -> BillingGroupsView:
    current: Final = await groups.read()
    assert not isinstance(current, AuthError)
    result: Final = await groups.save(
        BillingGroupsUpdate(
            revision=current.revision,
            reason="配置倍率验收策略",
            user_groups=(PricingUserGroup(id="default", name="普通组"), PricingUserGroup(id="vip", name="VIP")),
            model_groups=(
                PricingModelGroup(id="default", name="普通模型组"),
                PricingModelGroup(id="premium", name="高级组", models=("priced-model",)),
            ),
            rules=(PricingRule(user_group_id="vip", model_group_id="premium", multiplier=multiplier, enabled=enabled),),
        ),
        "test-admin",
        utcnow(),
    )
    assert not isinstance(result, AuthError)
    return result


async def assign_vip(groups: BillingGroupRepository, client: WalletClient) -> None:
    current: Final = await groups.member(client.session.customer.user_id)
    assert not isinstance(current, AuthError)
    result: Final = await groups.assign(
        client.session.customer.user_id,
        BillingGroupAssignment(
            group_id="vip",
            expected_version=current.version,
            reason="VIP 测试归组",
        ),
        "test-admin",
        utcnow(),
    )
    assert not isinstance(result, AuthError) and result.group_id == "vip"


@pytest.mark.asyncio
async def test_registered_customer_defaults_to_ordinary_and_config_updates_are_versioned(
    groups: BillingGroupRepository,
    wallet_client: WalletClient,
) -> None:
    member: Final = await groups.member(wallet_client.session.customer.user_id)
    assert not isinstance(member, AuthError) and member.group_id == "default" and member.version == 1
    current: Final = await groups.read()
    assert not isinstance(current, AuthError)
    body: Final = BillingGroupsUpdate(revision=current.revision, reason="并发配置测试")
    updates: Final = await asyncio.gather(*(groups.save(body, "test-admin", utcnow()) for _ in range(2)))
    assert sum(isinstance(value, BillingGroupsView) for value in updates) == 1
    assert sum(isinstance(value, AuthError) and value.code == "billing_config_conflict" for value in updates) == 1


@pytest.mark.asyncio
async def test_membership_changes_are_audited_and_in_use_groups_cannot_be_deleted(
    groups: BillingGroupRepository,
    wallet_client: WalletClient,
) -> None:
    await configure(groups)
    await assign_vip(groups, wallet_client)
    stale: Final = await groups.assign(
        wallet_client.session.customer.user_id,
        BillingGroupAssignment(
            group_id="default",
            expected_version=1,
            reason="过期版本",
        ),
        "test-admin",
        utcnow(),
    )
    assert isinstance(stale, AuthError) and stale.code == "billing_membership_conflict"
    current: Final = await groups.read()
    assert not isinstance(current, AuthError)
    deleted: Final = await groups.save(
        BillingGroupsUpdate(revision=current.revision, reason="删除在用组"), "test-admin", utcnow()
    )
    assert isinstance(deleted, AuthError) and deleted.code == "billing_group_in_use"
    audits: Final = await wallet_client.database.query_raw(
        """SELECT actor_id,reason,details FROM "CommerceAuditEvent" WHERE action='billing_group_assign' AND target_id=$1""",
        wallet_client.session.customer.user_id,
    )
    assert len(audits) == 1 and audits[0]["actor_id"] == "test-admin" and audits[0]["reason"]
    assert audits[0]["details"]["previous_group_id"] == "default" and audits[0]["details"]["group_id"] == "vip"
    assert audits[0]["details"]["previous_version"] == 1 and audits[0]["details"]["version"] == 2


@pytest.mark.asyncio
async def test_reserved_rate_survives_config_and_membership_changes_and_replay_is_once_only(
    groups: BillingGroupRepository,
    wallet_client: WalletClient,
) -> None:
    policy: Final = await configure(groups)
    await assign_vip(groups, wallet_client)
    await fund(wallet_client, 1000)
    store: Final = WalletRepository(wallet_client.database)
    request_id: Final = uuid4().hex
    reserved: Final = await store.reserve_call(
        wallet_client.session.customer.user_id, request_id, 100, "priced-model", "test-hash", utcnow()
    )
    assert not isinstance(reserved, AuthError) and reserved.reserved_units == 50
    assert reserved.pricing_snapshot is not None and reserved.pricing_snapshot.revision == policy.revision
    await configure(groups, "2")
    member: Final = await groups.member(wallet_client.session.customer.user_id)
    assert not isinstance(member, AuthError)
    changed: Final = await groups.assign(
        wallet_client.session.customer.user_id,
        BillingGroupAssignment(group_id="default", expected_version=member.version, reason="生成中切换组"),
        "test-admin",
        utcnow(),
    )
    assert not isinstance(changed, AuthError)
    assert await store.authorize_deployment(wallet_client.session.customer.user_id, request_id, 200, utcnow()) is None
    during: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(during, AuthError) and during.reserved_units == 100
    receipt: Final = await store.settle_call(
        wallet_client.session.customer.user_id, request_id, 33, "success", utcnow()
    )
    assert not isinstance(receipt, AuthError) and receipt.delta_units == -17
    assert (
        await store.settle_call(wallet_client.session.customer.user_id, request_id, 33, "success", utcnow()) == receipt
    )
    after: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(after, AuthError) and after.debited_units == 17 and after.reserved_units == 0
    ledger: Final = await store.transactions(wallet_client.session.customer.user_id, 25, 0)
    usage: Final = next(item for item in ledger.items if item.reference == request_id)
    assert usage.base_cost_units == 33 and usage.pricing_snapshot == reserved.pricing_snapshot


@pytest.mark.asyncio
async def test_group_uplift_cannot_overspend_a_wallet_concurrently(
    groups: BillingGroupRepository, wallet_client: WalletClient
) -> None:
    await configure(groups, "2")
    await assign_vip(groups, wallet_client)
    await fund(wallet_client, 300)
    store: Final = WalletRepository(wallet_client.database)
    results: Final = await asyncio.gather(
        *(
            store.reserve_call(
                wallet_client.session.customer.user_id, uuid4().hex, 100, "priced-model", "test-hash", utcnow()
            )
            for _ in range(2)
        )
    )
    assert sum(not isinstance(result, AuthError) for result in results) == 1
    assert sum(isinstance(result, AuthError) and result.code == "insufficient_balance" for result in results) == 1
    balance: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError) and balance.available_units == 100 and balance.reserved_units == 200


@pytest.mark.asyncio
async def test_disabled_group_pair_rejects_existing_keys_before_any_reservation(
    groups: BillingGroupRepository, wallet_client: WalletClient
) -> None:
    await configure(groups, enabled=False)
    await assign_vip(groups, wallet_client)
    await fund(wallet_client, 1000)
    store: Final = WalletRepository(wallet_client.database)
    result: Final = await store.reserve_call(
        wallet_client.session.customer.user_id, uuid4().hex, 100, "priced-model", "already-existing-key", utcnow()
    )
    assert isinstance(result, AuthError) and result.code == "model_group_disabled"
    balance: Final = await store.balance(wallet_client.session.customer.user_id)
    assert not isinstance(balance, AuthError) and balance.available_units == 1000 and balance.reserved_units == 0


@pytest.mark.asyncio
async def test_group_configuration_never_grants_native_models_and_denies_already_granted_models(
    groups: BillingGroupRepository,
    gateway_client: WalletClient,
) -> None:
    await grant(gateway_client)
    configured: Final = await configure(groups)
    await assign_vip(groups, gateway_client)
    accessible: Final = await gateway_client.http.get("/account/api/v1/gateway/access")
    assert accessible.status_code == 200 and accessible.json()["models"] == ["granted-model"]
    changed: Final = await groups.save(
        BillingGroupsUpdate(
            revision=configured.revision,
            user_groups=configured.user_groups,
            rules=(PricingRule(user_group_id="vip", model_group_id="premium", multiplier="1", enabled=False),),
            model_groups=(
                PricingModelGroup(id="default", name="普通模型组"),
                PricingModelGroup(id="premium", name="高级组", models=("granted-model", "restricted-model")),
            ),
            reason="禁用已授权模型",
        ),
        "test-admin",
        utcnow(),
    )
    assert not isinstance(changed, AuthError)
    denied: Final = await gateway_client.http.get("/account/api/v1/gateway/access")
    assert denied.status_code == 200 and denied.json()["models"] == [] and denied.json()["can_create_key"] is False
