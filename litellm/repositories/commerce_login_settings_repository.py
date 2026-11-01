from datetime import datetime
from typing import Final

from pydantic import ValidationError

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_login_settings import LoginConfigurationRecord
from litellm.repositories.commerce_auth_repository import AccountDatabase
from litellm.repositories.commerce_redemption_repository import audit


class LoginConfigurationRepository:
    def __init__(self, database: AccountDatabase) -> None:
        self.database = database

    async def read(self) -> LoginConfigurationRecord | AuthError | None:
        rows: Final = await self.database.query_raw(
            "SELECT payload,revision,updated_at FROM \"CommerceLoginConfiguration\" WHERE id='login'"
        )
        if not rows:
            return None
        try:
            return LoginConfigurationRecord.model_validate(rows[0])
        except ValidationError:
            return AuthError("login_settings_unavailable", 503)

    async def save(
        self, payload: str, revision: int, actor_id: str, now: datetime
    ) -> LoginConfigurationRecord | AuthError:
        async with self.database.tx() as tx:
            await tx.query_raw("SELECT pg_advisory_xact_lock(hashtextextended('commerce-login-configuration',0))::text")
            previous: Final = await LoginConfigurationRepository(tx).read()
            if isinstance(previous, AuthError):
                return previous
            if revision != (previous.revision if previous else 0):
                return AuthError("login_settings_conflict", 409)
            rows: Final = await tx.query_raw(
                """INSERT INTO "CommerceLoginConfiguration" (id,payload,revision,updated_by,updated_at)
                VALUES ('login',$1,$2,$3,$4::timestamptz) ON CONFLICT (id) DO UPDATE SET
                payload=EXCLUDED.payload,revision=EXCLUDED.revision,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
                RETURNING payload,revision,updated_at""",
                payload,
                revision + 1,
                actor_id,
                now,
            )
            await audit(tx, actor_id, "login_settings_updated", "login", "更新登录提供商与注册设置", now)
            return LoginConfigurationRecord.model_validate(rows[0])
