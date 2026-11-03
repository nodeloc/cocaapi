from collections.abc import Mapping, Sequence
from typing import Final, Protocol

from typing_extensions import LiteralString

from litellm.models.commerce_payment import ExchangeRate


class ExchangeDatabase(Protocol):
    async def query_raw(self, query: LiteralString, *args: object) -> Sequence[Mapping[str, object]]: ...
    async def execute_raw(self, query: LiteralString, *args: object) -> int: ...


class ExchangeRateRepository:
    def __init__(self, database: ExchangeDatabase) -> None:
        self.database = database

    async def latest(self) -> ExchangeRate | None:
        rows: Final = await self.database.query_raw(
            'SELECT rate,rate_date,fetched_at FROM "CommerceExchangeRate" WHERE pair=$1', "USD/CNY"
        )
        return ExchangeRate.model_validate(rows[0]) if rows else None

    async def save(self, rate: ExchangeRate) -> None:
        await self.database.execute_raw(
            """INSERT INTO "CommerceExchangeRate" (pair,rate,rate_date,fetched_at)
            VALUES ($1,$2,$3::date,$4::timestamptz) ON CONFLICT (pair) DO UPDATE
            SET rate=EXCLUDED.rate,rate_date=EXCLUDED.rate_date,fetched_at=EXCLUDED.fetched_at
            WHERE EXCLUDED.rate_date >= "CommerceExchangeRate".rate_date
              AND EXCLUDED.fetched_at > "CommerceExchangeRate".fetched_at""",
            "USD/CNY",
            str(rate.rate),
            rate.rate_date.isoformat(),
            rate.fetched_at,
        )
