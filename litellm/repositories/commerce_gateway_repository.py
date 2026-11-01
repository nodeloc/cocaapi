from collections.abc import Mapping
from datetime import datetime
from types import MappingProxyType
from typing import Final, Literal

from pydantic import SecretStr
from typing_extensions import LiteralString

from litellm.models.commerce_auth import FrozenModel
from litellm.models.commerce_gateway import (
    GatewayDaily,
    GatewayDailyModel,
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
    budget_duration: str | None = None


class StoredKey(FrozenModel):
    token: SecretStr
    key_alias: str | None
    models: tuple[str, ...]
    spend: float
    max_budget: float | None
    expires: datetime | None
    created_at: datetime | None
    blocked: bool | None
    budget_duration: str | None = None
    budget_reset_at: datetime | None = None
    total_spend: float = 0
    rpm_limit: int | None = None
    tpm_limit: int | None = None
    tpd_limit: int | None = None
    last_active: datetime | None = None


_KEY_COLUMNS: Final = (
    "token,key_alias,models,spend,max_budget,expires,created_at,blocked,budget_duration,budget_reset_at,"
    "total_spend,rpm_limit,tpm_limit,tpd_limit,last_active"
)
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
    COALESCE(sum(spend),0)::float8 AS spend_usd,
    count(*) FILTER (WHERE status='success')::bigint AS successful_requests,
    count(*) FILTER (WHERE status='failure')::bigint AS failed_requests,
    COALESCE(sum(GREATEST(0,EXTRACT(EPOCH FROM ("endTime"-"startTime"))*1000)),0)::float8 AS response_time_ms,
    count(*) FILTER (WHERE "endTime">="startTime")::bigint AS timed_requests"""
_PUBLIC_MODEL: Final = "COALESCE(NULLIF(model_group,''),model)"
_LOG_SORT_COLUMNS: Final[Mapping[str, LiteralString]] = MappingProxyType(
    {
        "startTime": '"startTime"',
        "spend": "spend",
        "total_tokens": "total_tokens",
        "request_duration_ms": 'EXTRACT(EPOCH FROM ("endTime"-"startTime"))',
        "model": _PUBLIC_MODEL,
    }
)


class GatewayRepository:
    def __init__(self, database: AccountDatabase) -> None:
        self.database = database

    async def access(self, user_id: str) -> StoredAccess:
        rows: Final = await self.database.query_raw(
            """SELECT models,max_budget,spend,rpm_limit,tpm_limit,budget_reset_at,budget_duration
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

    async def usage(
        self, user_id: str, start: datetime, end: datetime, days: int, timezone_offset: int = 0
    ) -> GatewayUsage:
        totals: Final = await self.database.query_raw(
            _OWNED_LOGS + "SELECT " + _TOTALS + " FROM scoped", user_id, start, end
        )
        daily: Final = await self.database.query_raw(
            _OWNED_LOGS
            + "SELECT to_char((\"startTime\" AT TIME ZONE 'UTC')-($4::int*interval '1 minute'),'YYYY-MM-DD') AS day,"
            + _TOTALS
            + " FROM scoped GROUP BY day ORDER BY day",
            user_id,
            start,
            end,
            timezone_offset,
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
            daily_models=tuple(
                GatewayDailyModel.model_validate(row)
                for row in await self.database.query_raw(
                    _OWNED_LOGS
                    + "SELECT to_char((\"startTime\" AT TIME ZONE 'UTC')-($4::int*interval '1 minute'),'YYYY-MM-DD') AS day,"
                    + _PUBLIC_MODEL
                    + " AS model,"
                    + _TOTALS
                    + " FROM scoped GROUP BY day,"
                    + _PUBLIC_MODEL
                    + " ORDER BY day,model",
                    user_id,
                    start,
                    end,
                    timezone_offset,
                )
            ),
        )

    async def logs(
        self,
        user_id: str,
        start: datetime,
        end: datetime,
        limit: int,
        offset: int,
        model: str | None = None,
        request_id: str | None = None,
        status: str | None = None,
        search: str | None = None,
        sort_by: Literal["startTime", "spend", "total_tokens", "request_duration_ms", "model"] = "startTime",
        sort_order: Literal["asc", "desc"] = "desc",
    ) -> GatewayLogs:
        order_column: Final = _LOG_SORT_COLUMNS[sort_by]
        rows: Final = await self.database.query_raw(
            _OWNED_LOGS
            + "SELECT request_id,"
            + _PUBLIC_MODEL
            + """ AS model,status,"startTime" AS started_at,
            "endTime" AS ended_at,prompt_tokens,completion_tokens,total_tokens,spend AS spend_usd
            FROM scoped WHERE ($6::text IS NULL OR """
            + _PUBLIC_MODEL
            + """=$6)
            AND ($7::text IS NULL OR request_id=$7) AND ($8::text IS NULL OR status=$8)
            AND ($9::text IS NULL OR strpos(lower(request_id),lower($9))>0)
            ORDER BY """
            + order_column
            + (" ASC" if sort_order == "asc" else " DESC")
            + ",request_id DESC LIMIT $4 OFFSET $5",
            user_id,
            start,
            end,
            limit + 1,
            offset,
            model,
            request_id,
            status,
            search,
        )
        return GatewayLogs(
            items=tuple(GatewayLog.model_validate(row) for row in rows[:limit]), has_more=len(rows) > limit
        )
