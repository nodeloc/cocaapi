from typing import Final
import asyncio
import uuid
from datetime import timedelta

import pytest
from prisma.errors import RawQueryError

from .conftest import WalletClient
from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_wallet import BatchInput, GeneratedBatch
from litellm.proxy._types import LitellmUserRoles, UserAPIKeyAuth
from litellm.proxy.auth.user_api_key_auth import user_api_key_auth
from litellm.proxy.commerce.redemption_service import RedemptionService
from litellm.proxy.commerce.security import AuthSecurity
from litellm.repositories.commerce_redemption_repository import RedemptionRepository
from litellm.repositories.commerce_wallet_repository import WalletRepository


def redemption(client: WalletClient) -> RedemptionService:
    return RedemptionService(RedemptionRepository(client.database), AuthSecurity("test-only-redemption-key-" * 8))


async def generate(client: WalletClient) -> GeneratedBatch:
    result: Final = await redemption(client).generate(BatchInput(name="测试批次", amount_usd="5.50", count=1), "integration-admin", uuid.uuid4().hex)
    assert isinstance(result, GeneratedBatch)
    return result


@pytest.mark.asyncio
async def test_invalid_redemption_cannot_credit_a_wallet(wallet_client: WalletClient) -> None:
    response: Final = await wallet_client.http.post("/account/api/v1/redemptions", json={"code": "COCA-THIS-CODE-DOES-NOT-EXIST"})
    assert response.status_code == 400, response.text
    assert response.json()["detail"] == "invalid_redemption"
    balance: Final = await wallet_client.http.get("/account/api/v1/wallet")
    assert balance.json()["available_units"] == "0"


@pytest.mark.asyncio
async def test_one_code_competing_customers_credit_only_one_wallet(wallet_client: WalletClient) -> None:
    generated: Final = await generate(wallet_client)
    service: Final = redemption(wallet_client)
    results: Final = await asyncio.gather(service.redeem(wallet_client.session, generated.codes[0]),
                                          service.redeem(wallet_client.other_session, generated.codes[0]))
    assert sum(not isinstance(result, AuthError) for result in results) == 1
    wallets: Final = WalletRepository(wallet_client.database)
    first: Final = await wallets.balance(wallet_client.session.customer.user_id)
    second: Final = await wallets.balance(wallet_client.other_session.customer.user_id)
    assert not isinstance(first, AuthError) and not isinstance(second, AuthError)
    assert first.available_units + second.available_units == 5_500_000_000
    successful: Final = next(result for result in results if not isinstance(result, AuthError))
    winner: Final = wallet_client.session if successful.user_id == wallet_client.session.customer.user_id else wallet_client.other_session
    replay: Final = await service.redeem(winner, generated.codes[0].lower())
    assert replay == successful
    rows: Final = await wallet_client.database.query_raw('SELECT id FROM "CommerceLedger" WHERE reference=$1', generated.batch.id)
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_disabled_and_expired_codes_cannot_credit(wallet_client: WalletClient) -> None:
    disabled: Final = await generate(wallet_client)
    service: Final = redemption(wallet_client)
    await service.store.disable_batch(disabled.batch.id, "integration-admin", "停止活动", wallet_client.now)
    assert isinstance(await service.redeem(wallet_client.session, disabled.codes[0]), AuthError)
    expiry: Final = wallet_client.now + timedelta(hours=1)
    expiring: Final = await service.generate(BatchInput(name="有效期测试", amount_usd="5", count=1, expires_at=expiry), "integration-admin", uuid.uuid4().hex)
    assert isinstance(expiring, GeneratedBatch)
    boundary: Final = RedemptionService(service.store, service.security, clock=lambda: expiry)
    assert isinstance(await boundary.redeem(wallet_client.session, expiring.codes[0]), AuthError)
    wallet: Final = await WalletRepository(wallet_client.database).balance(wallet_client.session.customer.user_id)
    assert not isinstance(wallet, AuthError) and wallet.available_units == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("target", ["CommerceLedger", "CommerceRedeemCode"])
async def test_failed_final_write_rolls_back_code_claim_and_wallet(wallet_client: WalletClient, target: str) -> None:
    generated: Final = await generate(wallet_client)
    token: Final = uuid.uuid4().hex
    user_id: Final = wallet_client.session.customer.user_id
    await wallet_client.database.execute_raw(f'''CREATE FUNCTION wallet_reject_{token}() RETURNS TRIGGER LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'injected ledger failure'; END; $$''')
    operation: Final = "INSERT" if target == "CommerceLedger" else "UPDATE"
    condition: Final = f"NEW.user_id='{user_id}'" if target == "CommerceLedger" else f"NEW.batch_id='{generated.batch.id}'"
    await wallet_client.database.execute_raw(f'''CREATE TRIGGER wallet_reject_{token} BEFORE {operation} ON "{target}"
        FOR EACH ROW WHEN ({condition}) EXECUTE FUNCTION wallet_reject_{token}()''')
    try:
        with pytest.raises(RawQueryError):
            await redemption(wallet_client).redeem(wallet_client.session, generated.codes[0])
        codes: Final = await wallet_client.database.query_raw('SELECT redeemed_by FROM "CommerceRedeemCode" WHERE batch_id=$1', generated.batch.id)
        assert codes[0]["redeemed_by"] is None
        wallet: Final = await WalletRepository(wallet_client.database).balance(user_id)
        assert not isinstance(wallet, AuthError) and wallet.available_units == 0
    finally:
        await wallet_client.database.execute_raw(f'DROP TRIGGER wallet_reject_{token} ON "{target}"')
        await wallet_client.database.execute_raw(f'DROP FUNCTION wallet_reject_{token}()')
    recovered: Final = await redemption(wallet_client).redeem(wallet_client.session, generated.codes[0])
    assert not isinstance(recovered, AuthError) and recovered.available_after == 5_500_000_000


@pytest.mark.asyncio
@pytest.mark.parametrize("invalidate", ["session", "verification", "enabled"])
async def test_stale_session_snapshot_cannot_redeem(wallet_client: WalletClient, invalidate: str) -> None:
    generated: Final = await generate(wallet_client)
    if invalidate == "session":
        await wallet_client.database.execute_raw('DELETE FROM "CommerceSession" WHERE token_hash=$1', wallet_client.session.token_hash)
    elif invalidate == "verification":
        await wallet_client.database.execute_raw('UPDATE "CommerceCustomer" SET email_verified=false WHERE user_id=$1', wallet_client.session.customer.user_id)
    else:
        await wallet_client.database.execute_raw('UPDATE "CommerceCustomer" SET enabled=false WHERE user_id=$1', wallet_client.session.customer.user_id)
    result: Final = await redemption(wallet_client).redeem(wallet_client.session, generated.codes[0])
    assert isinstance(result, AuthError) and result.status == 401
    rows: Final = await wallet_client.database.query_raw('SELECT id FROM "CommerceLedger" WHERE user_id=$1', wallet_client.session.customer.user_id)
    assert not rows


@pytest.mark.asyncio
async def test_admin_generation_is_once_only_and_lists_do_not_reveal_codes(wallet_client: WalletClient) -> None:
    wallet_client.app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(user_role=LitellmUserRoles.PROXY_ADMIN, user_id="integration-admin")
    headers: Final = {"Authorization": "Bearer test-native-admin", "Idempotency-Key": str(uuid.uuid4())}
    body: Final = {"name": "后台测试批次", "amount_usd": "12.34", "count": 2}
    first: Final = await wallet_client.http.post("/commerce/admin/v1/redeem-batches", json=body, headers=headers)
    assert first.status_code == 201, first.text
    replay: Final = await wallet_client.http.post("/commerce/admin/v1/redeem-batches", json=body, headers=headers)
    assert replay.status_code == 409
    listed: Final = await wallet_client.http.get("/commerce/admin/v1/redeem-batches", headers=headers)
    assert listed.status_code == 200
    for code in first.json()["codes"]:
        assert code not in listed.text
        stored: Final = await wallet_client.database.query_raw('SELECT code_hash,tail FROM "CommerceRedeemCode" WHERE batch_id=$1', first.json()["batch"]["id"])
        assert code not in str(stored)
    assert first.headers["cache-control"] == "no-store"
    assert first.headers["referrer-policy"] == "no-referrer"
