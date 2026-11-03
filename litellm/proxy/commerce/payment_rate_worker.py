import argparse
import asyncio
import json
import logging
from typing import Final

from prisma import Prisma
from prisma.errors import PrismaError

from litellm.models.commerce_auth import AuthError, FrozenModel
from litellm.proxy.commerce.payment_rates import fetch_reference_rate
from litellm.repositories.commerce_exchange_repository import ExchangeDatabase, ExchangeRateRepository

logger: Final = logging.getLogger(__name__)


class WorkerOptions(FrozenModel):
    once: bool = False


async def refresh_once(database: ExchangeDatabase) -> bool:
    rate: Final = await fetch_reference_rate()
    if isinstance(rate, AuthError):
        logger.warning("payment_exchange_rate_unavailable")
        return False
    await ExchangeRateRepository(database).save(rate)
    logger.info(
        json.dumps(
            {
                "event": "payment_exchange_rate_updated",
                "pair": "USD/CNY",
                "rate_date": str(rate.rate_date),
                "fetched_at": rate.fetched_at.isoformat(),
            }
        ),
    )
    return True


async def run(once: bool) -> None:
    database: Final = Prisma()
    await database.connect()
    try:
        if once:
            if not await refresh_once(database):
                raise RuntimeError("Exchange rate refresh failed")
            return
        while True:
            try:
                await refresh_once(database)
            except (PrismaError, OSError):
                logger.error("payment_exchange_rate_storage_unavailable")
            await asyncio.sleep(3600)
    finally:
        await database.disconnect()


if __name__ == "__main__":
    parser: Final = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    options: Final = WorkerOptions.model_validate(vars(parser.parse_args()))
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    asyncio.run(run(options.once))
