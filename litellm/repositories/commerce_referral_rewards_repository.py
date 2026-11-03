from datetime import datetime
from typing import Final

from litellm.models.commerce_auth import AuthError, FrozenModel
from litellm.models.commerce_referrals import ReferralRecord, ReferralSnapshot
from litellm.models.commerce_wallet import WalletChange
from litellm.repositories.commerce_auth_repository import AccountDatabase
from litellm.repositories.commerce_redemption_repository import audit
from litellm.repositories.commerce_referral_settings_repository import ReferralSettingsRepository
from litellm.repositories.commerce_wallet_repository import apply_wallet_change


class ReferralCustomer(FrozenModel):
    user_id: str
    enabled: bool
    verified: bool


async def referral_snapshot(tx: AccountDatabase, code: str | None) -> ReferralSnapshot | AuthError | None:
    if code is None:
        return None
    rows: Final = await tx.query_raw(
        """SELECT c.user_id FROM "CommerceReferralCode" r JOIN "CommerceCustomer" c ON c.user_id=r.user_id
        WHERE r.code=$1 AND c.enabled=true AND (c.email_verified OR EXISTS (
        SELECT 1 FROM "CommerceExternalIdentity" e WHERE e.user_id=c.user_id))""",
        code,
    )
    if not rows:
        return AuthError("invalid_referral_code", 422)
    config: Final = await ReferralSettingsRepository(tx).read()
    if isinstance(config, AuthError):
        return config
    return ReferralSnapshot.model_validate(
        {
            "inviter_id": rows[0]["user_id"],
            "inviter_units": config.inviter_units if config.enabled else 0,
            "invitee_units": config.invitee_units if config.enabled else 0,
            "state": "pending" if config.enabled else "inactive",
        }
    )


async def bind_referral(tx: AccountDatabase, invitee_id: str, snapshot: ReferralSnapshot, now: datetime) -> None:
    await tx.execute_raw(
        """INSERT INTO "CommerceReferral" (invitee_id,inviter_id,inviter_units,invitee_units,state,created_at)
        VALUES ($1,$2,$3::bigint,$4::bigint,$5,$6::timestamptz)""",
        invitee_id,
        snapshot.inviter_id,
        snapshot.inviter_units,
        snapshot.invitee_units,
        snapshot.state,
        now,
    )


async def pending_referral(tx: AccountDatabase, invitee_id: str) -> ReferralRecord | None:
    rows: Final = await tx.query_raw(
        'SELECT * FROM "CommerceReferral" WHERE invitee_id=$1 AND state=$2 FOR UPDATE',
        invitee_id,
        "pending",
    )
    return ReferralRecord.model_validate(rows[0]) if rows else None


async def reward_failure(tx: AccountDatabase, invitee_id: str, code: str) -> None:
    await tx.execute_raw("ROLLBACK TO SAVEPOINT referral_reward")
    await tx.execute_raw("RELEASE SAVEPOINT referral_reward")
    await tx.execute_raw('UPDATE "CommerceReferral" SET failure_code=$2 WHERE invitee_id=$1', invitee_id, code)


async def settle_referral(tx: AccountDatabase, invitee_id: str, now: datetime) -> None:
    referral: Final = await pending_referral(tx, invitee_id)
    if referral is None:
        return
    rows: Final = await tx.query_raw(
        """SELECT c.user_id,c.enabled,(c.email_verified OR EXISTS (
        SELECT 1 FROM "CommerceExternalIdentity" e WHERE e.user_id=c.user_id)) AS verified
        FROM "CommerceCustomer" c WHERE c.user_id IN ($1,$2) ORDER BY c.user_id FOR NO KEY UPDATE OF c""",
        referral.inviter_id,
        invitee_id,
    )
    customers: Final = tuple(ReferralCustomer.model_validate(row) for row in rows)
    if len(customers) != 2 or any(not customer.enabled for customer in customers):
        await tx.execute_raw(
            'UPDATE "CommerceReferral" SET state=$2,failure_code=$3 WHERE invitee_id=$1',
            invitee_id,
            "ineligible",
            "account_unavailable",
        )
        return
    if any(not customer.verified for customer in customers):
        return
    await tx.execute_raw("SAVEPOINT referral_reward")
    inviter: Final = await apply_wallet_change(
        tx,
        WalletChange(
            user_id=referral.inviter_id,
            delta_units=referral.inviter_units,
            kind="referral",
            business_key="referral:inviter:" + invitee_id,
            reference=invitee_id,
            actor_id="referral-system",
            reason="邀请注册奖励",
            now=now,
        ),
    )
    if isinstance(inviter, AuthError):
        await reward_failure(tx, invitee_id, inviter.code)
        return
    invitee: Final = await apply_wallet_change(
        tx,
        WalletChange(
            user_id=invitee_id,
            delta_units=referral.invitee_units,
            kind="referral",
            business_key="referral:invitee:" + invitee_id,
            reference=invitee_id,
            actor_id="referral-system",
            reason="受邀注册奖励",
            now=now,
        ),
    )
    if isinstance(invitee, AuthError):
        await reward_failure(tx, invitee_id, invitee.code)
        return
    await tx.execute_raw(
        'UPDATE "CommerceReferral" SET state=$2,rewarded_at=$3::timestamptz,failure_code=NULL WHERE invitee_id=$1',
        invitee_id,
        "granted",
        now,
    )
    await audit(tx, "referral-system", "referral_rewards_granted", invitee_id, "双方邀请奖励已入账", now)
    await tx.execute_raw("RELEASE SAVEPOINT referral_reward")
