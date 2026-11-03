from datetime import datetime
from typing import Final

from pydantic import ValidationError

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_payment_settings import PaymentConfigurationRecord
from litellm.repositories.commerce_auth_repository import AccountDatabase
from litellm.repositories.commerce_redemption_repository import audit


class PaymentConfigurationRepository:
    def __init__(self, database: AccountDatabase) -> None:
        self.database = database

    async def read(self) -> PaymentConfigurationRecord | AuthError | None:
        rows: Final = await self.database.query_raw(
            "SELECT payload,revision,updated_at FROM \"CommercePaymentConfiguration\" WHERE id='payment'"
        )
        if not rows:
            return None
        try:
            return PaymentConfigurationRecord.model_validate(rows[0])
        except ValidationError:
            return AuthError("payment_settings_unavailable", 503)

    async def save(
        self, payload: str, revision: int, actor_id: str, now: datetime
    ) -> PaymentConfigurationRecord | AuthError:
        async with self.database.tx() as tx:
            await tx.query_raw(
                "SELECT pg_advisory_xact_lock(hashtextextended('commerce-payment-configuration',0))::text"
            )
            previous: Final = await PaymentConfigurationRepository(tx).read()
            if isinstance(previous, AuthError):
                return previous
            if revision != (previous.revision if previous else 0):
                return AuthError("payment_settings_conflict", 409)
            rows: Final = await tx.query_raw(
                """INSERT INTO "CommercePaymentConfiguration" (id,payload,revision,updated_by,updated_at)
                VALUES ('payment',$1,$2,$3,$4::timestamptz) ON CONFLICT (id) DO UPDATE SET
                payload=EXCLUDED.payload,revision=EXCLUDED.revision,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
                RETURNING payload,revision,updated_at""",
                payload,
                revision + 1,
                actor_id,
                now,
            )
            await audit(tx, actor_id, "payment_settings_updated", "payment", "更新易支付配置", now)
            return PaymentConfigurationRecord.model_validate(rows[0])
