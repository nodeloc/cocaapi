from typing import Final

import pytest

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_billing_groups import BillingGroupAssignment, BillingGroupsUpdate, PricingRule
from litellm.proxy.commerce.auth_service import utcnow
from litellm.repositories.commerce_billing_group_repository import BillingGroupRepository
from litellm.repositories.commerce_group_migration import activate_user_groups
from litellm.repositories.commerce_user_group_repository import begin_group_change, finish_group_change
from litellm.repositories.commerce_wallet_repository import WalletRepository

from .conftest import WalletClient
from .test_wallet_billing import fund


@pytest.mark.asyncio
async def test_one_group_registry_controls_native_resources_membership_and_pricing(wallet_client: WalletClient) -> None:
    database: Final = wallet_client.database
    repository: Final = BillingGroupRepository(database)
    original: Final = await repository.state()
    assert not isinstance(original, AuthError)
    first: Final = wallet_client.session.customer.user_id
    second: Final = wallet_client.other_session.customer.user_id
    allowed_request: Final = "unified-allowed-" + first
    denied_request: Final = "unified-denied-" + first
    await database.execute_raw("UPDATE \"LiteLLM_UserTable\" SET models=ARRAY['model-a'] WHERE user_id=$1", first)
    await database.execute_raw("UPDATE \"LiteLLM_UserTable\" SET models=ARRAY['model-b'] WHERE user_id=$1", second)
    try:
        migration: Final = await activate_user_groups(database, ("model-a",), "test-admin", utcnow())
        assert not isinstance(migration, AuthError)
        initial: Final = await repository.read()
        assert not isinstance(initial, AuthError) and initial.group_source == "access_groups"
        assert await repository.allowed_models(first, ("model-a", "model-b")) == ("model-a",)
        assert await repository.allowed_models(second, ("model-a", "model-b")) == ("model-b",)
        source: Final = await database.query_raw(
            "SELECT access_group_name,access_model_names FROM \"LiteLLM_AccessGroupTable\" WHERE access_group_id='default'"
        )
        assert source[0]["access_group_name"] == initial.user_groups[0].name
        async with database.tx() as tx:
            before: Final = await begin_group_change(tx)
            assert not isinstance(before, AuthError) and before is not None
            await tx.execute_raw(
                """UPDATE "LiteLLM_AccessGroupTable" SET access_group_name='统一权限组',
                access_model_names=ARRAY['model-b'] WHERE access_group_id='default' """
            )
            error: Final = await finish_group_change(tx, before, "test-admin", utcnow())
            assert error is None
        updated: Final = await repository.read()
        assert not isinstance(updated, AuthError) and updated.revision > initial.revision
        assert next(group for group in updated.user_groups if group.id == "default").name == "统一权限组"
        assert await repository.allowed_models(first, ("model-a", "model-b")) == ("model-b",)
        denied: Final = await repository.snapshot(first, "model-a")
        assert isinstance(denied, AuthError) and denied.status == 403
        stale: Final = await repository.save(
            BillingGroupsUpdate(**initial.model_dump(exclude={"updated_by", "updated_at"}), reason="stale"),
            "test-admin",
            utcnow(),
        )
        assert isinstance(stale, AuthError) and stale.status == 409
        member: Final = await repository.member(second)
        assert not isinstance(member, AuthError)
        assigned: Final = await repository.assign(
            second,
            BillingGroupAssignment(group_id="default", expected_version=member.version, reason="统一归组"),
            "test-admin",
            utcnow(),
        )
        assert not isinstance(assigned, AuthError)
        assert await repository.allowed_models(second, ("model-a", "model-b")) == ("model-b",)
        saved: Final = await repository.save(
            BillingGroupsUpdate(
                revision=updated.revision,
                reason="同一组修改资源权限",
                user_groups=tuple(
                    group.model_copy(update={"models": ("model-a",)}) if group.id == "default" else group
                    for group in updated.user_groups
                ),
                model_groups=updated.model_groups,
                rules=updated.rules,
            ),
            "test-admin",
            utcnow(),
        )
        assert not isinstance(saved, AuthError)
        canonical: Final = await database.query_raw(
            "SELECT access_model_names FROM \"LiteLLM_AccessGroupTable\" WHERE access_group_id='default'"
        )
        assert canonical[0]["access_model_names"] == ["model-a"]
        assert await repository.allowed_models(second, ("model-a", "model-b")) == ("model-a",)
        priced: Final = await repository.save(
            BillingGroupsUpdate(
                revision=saved.revision,
                reason="统一组倍率",
                user_groups=saved.user_groups,
                model_groups=saved.model_groups,
                rules=(PricingRule(user_group_id="default", model_group_id="default", multiplier="0.5"),),
            ),
            "test-admin",
            utcnow(),
        )
        assert not isinstance(priced, AuthError)
        await fund(wallet_client, 1000)
        wallets: Final = WalletRepository(database)
        blocked: Final = await wallets.reserve_call(
            user_id=first,
            request_id=denied_request,
            model="model-b",
            key_hash="test-key",
            reserved_units=100,
            now=utcnow(),
        )
        assert isinstance(blocked, AuthError) and blocked.status == 403
        before_credit: Final = await wallets.balance(first)
        assert not isinstance(before_credit, AuthError) and before_credit.available_units == 1000
        held: Final = await wallets.reserve_call(
            user_id=first,
            request_id=allowed_request,
            model="model-a",
            key_hash="test-key",
            reserved_units=100,
            now=utcnow(),
        )
        assert not isinstance(held, AuthError) and held.reserved_units == 50
        receipt: Final = await wallets.settle_call(first, allowed_request, 40, "success", utcnow())
        assert not isinstance(receipt, AuthError) and receipt.delta_units == -20
        final_balance: Final = await wallets.balance(first)
        assert not isinstance(final_balance, AuthError) and final_balance.available_units == 980
    finally:
        await database.execute_raw("UPDATE \"CommerceCustomer\" SET billing_group_id='default'")
        await database.execute_raw(
            '''INSERT INTO "CommerceBillingConfiguration" (revision,payload,updated_by,created_at)
            SELECT COALESCE(max(revision),0)+1,$1,'test-cleanup',$2::timestamptz FROM "CommerceBillingConfiguration"''',
            original[1].model_dump_json(),
            utcnow(),
        )
        await database.execute_raw("DELETE FROM \"LiteLLM_AccessGroupTable\" WHERE created_by='test-admin'")
