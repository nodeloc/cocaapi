from datetime import datetime
from decimal import Decimal
from typing import Final

from pydantic import ValidationError

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_referrals import ReferralSettingsInput, ReferralSettingsView
from litellm.proxy.commerce.wallet_service import parse_usd
from litellm.repositories.commerce_auth_repository import AccountDatabase
from litellm.repositories.commerce_redemption_repository import audit


def bonus_units(value: str) -> int | AuthError:
    return 0 if Decimal(value) == 0 else parse_usd(value)


class ReferralSettingsRepository:
    def __init__(self, database: AccountDatabase) -> None:
        self.database = database

    async def read(self) -> ReferralSettingsView | AuthError:
        rows: Final = await self.database.query_raw(
            "SELECT revision,enabled,inviter_units,invitee_units,updated_at "
            "FROM \"CommerceReferralConfiguration\" WHERE id='referrals'"
        )
        if not rows:
            return ReferralSettingsView()
        try:
            return ReferralSettingsView.model_validate(rows[0])
        except ValidationError:
            return AuthError("referral_settings_unavailable", 503)

    async def save(self, body: ReferralSettingsInput, actor_id: str, now: datetime) -> ReferralSettingsView | AuthError:
        inviter: Final = bonus_units(body.inviter_amount_usd)
        invitee: Final = bonus_units(body.invitee_amount_usd)
        if isinstance(inviter, AuthError) or isinstance(invitee, AuthError):
            return AuthError("invalid_referral_settings", 422)
        if body.enabled and (inviter == 0 or invitee == 0):
            return AuthError("referral_amount_required", 422)
        async with self.database.tx() as tx:
            await tx.query_raw("SELECT pg_advisory_xact_lock(hashtextextended('commerce-referral-settings',0))::text")
            previous: Final = await ReferralSettingsRepository(tx).read()
            if isinstance(previous, AuthError):
                return previous
            if previous.revision != body.revision:
                return AuthError("referral_settings_conflict", 409)
            rows: Final = await tx.query_raw(
                """INSERT INTO "CommerceReferralConfiguration"
                (id,revision,enabled,inviter_units,invitee_units,updated_by,updated_at)
                VALUES ('referrals',$1,$2,$3::bigint,$4::bigint,$5,$6::timestamptz)
                ON CONFLICT (id) DO UPDATE SET revision=EXCLUDED.revision,enabled=EXCLUDED.enabled,
                inviter_units=EXCLUDED.inviter_units,invitee_units=EXCLUDED.invitee_units,
                updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
                RETURNING revision,enabled,inviter_units,invitee_units,updated_at""",
                body.revision + 1,
                body.enabled,
                inviter,
                invitee,
                actor_id,
                now,
            )
            await audit(tx, actor_id, "referral_settings_updated", "referrals", "更新邀请有礼活动设置", now)
            return ReferralSettingsView.model_validate(rows[0])
