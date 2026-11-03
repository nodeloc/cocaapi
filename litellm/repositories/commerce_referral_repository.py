import secrets
from datetime import datetime
from typing import Final

from litellm.models.commerce_auth import AuthError, FrozenModel, Session
from litellm.models.commerce_referrals import (
    ReferralCodeView,
    ReferralItem,
    ReferralOverview,
    ReferralPage,
    ReferralRecord,
)
from litellm.repositories.commerce_auth_repository import AccountDatabase
from litellm.repositories.commerce_referral_settings_repository import ReferralSettingsRepository


class ReferralTotals(FrozenModel):
    invited_count: int
    earned_units: int
    signup_bonus_units: int


async def referral_eligible(tx: AccountDatabase, user_id: str) -> bool:
    rows: Final = await tx.query_raw(
        """SELECT c.user_id FROM "CommerceCustomer" c WHERE c.user_id=$1 AND c.enabled=true
        AND (c.email_verified OR EXISTS (SELECT 1 FROM "CommerceExternalIdentity" e WHERE e.user_id=c.user_id))""",
        user_id,
    )
    return bool(rows)


def referral_item(record: ReferralRecord, *, admin: bool) -> ReferralItem:
    return ReferralItem(
        id=record.invitee_id,
        invitee_label=record.invitee_id[-8:],
        inviter_label=record.inviter_id[-8:] if admin else None,
        state=record.state,
        inviter_units=record.inviter_units,
        invitee_units=record.invitee_units,
        created_at=record.created_at,
        rewarded_at=record.rewarded_at,
    )


class ReferralRepository:
    def __init__(self, database: AccountDatabase) -> None:
        self.database = database

    async def issue_code(self, session: Session, now: datetime) -> ReferralCodeView | AuthError:
        async with self.database.tx() as tx:
            valid: Final = await tx.query_raw(
                """SELECT s.user_id FROM "CommerceSession" s JOIN "CommerceCustomer" c ON c.user_id=s.user_id
                WHERE s.token_hash=$1 AND s.user_id=$2 AND s.expires_at>$3::timestamptz
                AND c.enabled=true FOR UPDATE OF c""",
                session.token_hash,
                session.customer.user_id,
                now,
            )
            if not valid:
                return AuthError("authentication_required", 401)
            if not await referral_eligible(tx, session.customer.user_id):
                return AuthError("referral_verification_required", 403)
            await tx.execute_raw(
                """INSERT INTO "CommerceReferralCode" (user_id,code,created_at) VALUES ($1,$2,$3::timestamptz)
                ON CONFLICT (user_id) DO NOTHING""",
                session.customer.user_id,
                secrets.token_urlsafe(18),
                now,
            )
            rows: Final = await tx.query_raw(
                'SELECT code,created_at FROM "CommerceReferralCode" WHERE user_id=$1',
                session.customer.user_id,
            )
            return ReferralCodeView.model_validate(rows[0])

    async def records(self, user_id: str | None, limit: int, offset: int) -> ReferralPage:
        rows: Final = await self.database.query_raw(
            """SELECT * FROM "CommerceReferral" WHERE ($1::text IS NULL OR inviter_id=$1)
            ORDER BY created_at DESC,invitee_id DESC LIMIT $2 OFFSET $3""",
            user_id,
            limit + 1,
            offset,
        )
        records: Final = tuple(ReferralRecord.model_validate(row) for row in rows[:limit])
        return ReferralPage(
            items=tuple(referral_item(record, admin=user_id is None) for record in records), has_more=len(rows) > limit
        )

    async def overview(self, user_id: str, public_url: str, limit: int, offset: int) -> ReferralOverview | AuthError:
        config: Final = await ReferralSettingsRepository(self.database).read()
        if isinstance(config, AuthError):
            return config
        codes: Final = await self.database.query_raw(
            'SELECT code,created_at FROM "CommerceReferralCode" WHERE user_id=$1', user_id
        )
        code: Final = ReferralCodeView.model_validate(codes[0]) if codes else None
        rows: Final = await self.database.query_raw(
            """SELECT COUNT(*) AS invited_count,
            COALESCE(SUM(inviter_units) FILTER (WHERE state='granted'),0) AS earned_units,
            (SELECT COALESCE(SUM(invitee_units) FILTER (WHERE state='granted'),0)
            FROM "CommerceReferral" WHERE invitee_id=$1)
            AS signup_bonus_units FROM "CommerceReferral" WHERE inviter_id=$1""",
            user_id,
        )
        totals: Final = ReferralTotals.model_validate(rows[0])
        page: Final = await self.records(user_id, limit, offset)
        return ReferralOverview(
            enabled=config.enabled,
            inviter_units=config.inviter_units,
            invitee_units=config.invitee_units,
            invite_code=code.code if code else None,
            invite_url=public_url + "/account/register/?ref=" + code.code if code else None,
            eligible=await referral_eligible(self.database, user_id),
            invited_count=totals.invited_count,
            earned_units=totals.earned_units,
            signup_bonus_units=totals.signup_bonus_units,
            items=page.items,
            has_more=page.has_more,
        )
