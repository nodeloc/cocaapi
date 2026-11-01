from datetime import datetime
from typing import Final

from pydantic import SecretStr

from litellm.models.commerce_auth import FrozenModel
from litellm.models.commerce_gateway import (
    GatewayDaily,
    GatewayLog,
    GatewayLogs,
    GatewayModelUsage,
    GatewayTotals,
    GatewayUsage,
)
from litellm.repositories.commerce_auth_repository import AccountDatabase


class StoredAccess(FrozenModel):
    models: tuple[str, ...]
    max_budget: float | None
    spend: float
    rpm_limit: int | None
    tpm_limit: int | None
    budget_reset_at: datetime | None


class StoredKey(FrozenModel):
    token: SecretStr
    key_alias: str | None
    models: tuple[str, ...]
    spend: float
    max_budget: float | None
    expires: datetime | None
    created_at: datetime | None
    blocked: bool | None


_KEY_COLUMNS: Final = "token,key_alias,models,spend,max_budget,expires,created_at,blocked"
_OWNED_LOGS: Final = """WITH owned AS (
    SELECT token FROM "LiteLLM_VerificationToken" WHERE user_id=$1 AND team_id IS NULL
    UNION SELECT token FROM "LiteLLM_DeletedVerificationToken" WHERE user_id=$1 AND team_id IS NULL
), scoped AS (
    SELECT s.* FROM "LiteLLM_SpendLogs" s JOIN owned o ON s.api_key=o.token
    WHERE s."startTime">=$2::timestamptz AND s."startTime"<$3::timestamptz
    AND COALESCE(NULLIF(s.model_group,''),s.model)<>''
) """
_TOTALS: Final = """count(*)::bigint AS requests,
    COALESCE(sum(prompt_tokens),0)::bigint AS prompt_tokens,
    COALESCE(sum(completion_tokens),0)::bigint AS completion_tokens,
    COALESCE(sum(total_tokens),0)::bigint AS total_tokens,
    COALESCE(sum(spend),0)::float8 AS spend_usd"""
_PUBLIC_MODEL: Final = "COALESCE(NULLIF(model_group,''),model)"


class GatewayRepository:
    def __init__(self, database: AccountDatabase) -> None:
        self.database = database

    async def access(self, user_id: str) -> StoredAccess:
        rows: Final = await self.database.query_raw(
            """SELECT models,max_budget,spend,rpm_limit,tpm_limit,budget_reset_at
            FROM "LiteLLM_UserTable" WHERE user_id=$1""",
            user_id,
        )
        return StoredAccess.model_validate(rows[0])

    async def keys(self, user_id: str, limit: int, offset: int) -> tuple[StoredKey, ...]:
        rows: Final = await self.database.query_raw(
            "SELECT "
            + _KEY_COLUMNS
            + """ FROM "LiteLLM_VerificationToken"
            WHERE user_id=$1 AND team_id IS NULL ORDER BY created_at DESC NULLS LAST,token LIMIT $2 OFFSET $3""",
            user_id,
            limit,
            offset,
        )
        return tuple(StoredKey.model_validate(row) for row in rows)

    async def key(self, user_id: str, token: str) -> StoredKey | None:
        rows: Final = await self.database.query_raw(
            "SELECT "
            + _KEY_COLUMNS
            + ' FROM "LiteLLM_VerificationToken" WHERE user_id=$1 AND token=$2 AND team_id IS NULL',
            user_id,
            token,
        )
        return StoredKey.model_validate(rows[0]) if rows else None

    async def safe_created_key(self, user_id: str, token: str) -> bool:
        rows: Final = await self.database.query_raw(
            """SELECT token FROM "LiteLLM_VerificationToken" WHERE user_id=$1 AND token=$2
            AND team_id IS NULL AND organization_id IS NULL AND project_id IS NULL AND agent_id IS NULL
            AND key_type='llm_api' AND allowed_routes=ARRAY['llm_api_routes']
            AND object_permission_id IS NULL AND permissions='{}'::jsonb""",
            user_id,
            token,
        )
        return bool(rows)

    async def usage(self, user_id: str, start: datetime, end: datetime, days: int) -> GatewayUsage:
        totals: Final = await self.database.query_raw(
            _OWNED_LOGS + "SELECT " + _TOTALS + " FROM scoped", user_id, start, end
        )
        daily: Final = await self.database.query_raw(
            _OWNED_LOGS
            + "SELECT to_char(\"startTime\" AT TIME ZONE 'UTC','YYYY-MM-DD') AS day,"
            + _TOTALS
            + " FROM scoped GROUP BY day ORDER BY day",
            user_id,
            start,
            end,
        )
        models: Final = await self.database.query_raw(
            _OWNED_LOGS
            + "SELECT "
            + _PUBLIC_MODEL
            + " AS model,"
            + _TOTALS
            + " FROM scoped GROUP BY "
            + _PUBLIC_MODEL
            + " ORDER BY spend_usd DESC,model LIMIT 100",
            user_id,
            start,
            end,
        )
        return GatewayUsage(
            days=days,
            totals=GatewayTotals.model_validate(totals[0]),
            daily=tuple(GatewayDaily.model_validate(row) for row in daily),
            models=tuple(GatewayModelUsage.model_validate(row) for row in models),
        )

    async def logs(self, user_id: str, start: datetime, end: datetime, limit: int, offset: int) -> GatewayLogs:
        rows: Final = await self.database.query_raw(
            _OWNED_LOGS
            + "SELECT request_id,"
            + _PUBLIC_MODEL
            + """ AS model,status,"startTime" AS started_at,
            total_tokens,spend AS spend_usd FROM scoped ORDER BY "startTime" DESC,request_id DESC LIMIT $4 OFFSET $5""",
            user_id,
            start,
            end,
            limit + 1,
            offset,
        )
        return GatewayLogs(
            items=tuple(GatewayLog.model_validate(row) for row in rows[:limit]), has_more=len(rows) > limit
        )
