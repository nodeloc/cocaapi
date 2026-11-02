import argparse
import asyncio
import json
from datetime import datetime, timedelta
from typing import Final

from litellm.models.commerce_auth import AuthError, FrozenModel
from litellm.proxy.commerce.auth_service import utcnow
from litellm.repositories.commerce_auth_repository import AccountDatabase
from prisma import Prisma
from prisma.errors import PrismaError
from pydantic import Field

from litellm.models.commerce_wallet import MAX_UNITS, CallReservation, LedgerEntry
from litellm.repositories.commerce_wallet_repository import settle_reserved_call


class ReconcileOptions(FrozenModel):
    list_pending: bool
    request_id: str | None = Field(default=None, pattern=r"^[0-9a-f]{32}$")
    actual_units: int | None = Field(default=None, ge=0, le=MAX_UNITS)
    actor: str = Field(default="", max_length=128)
    reason: str = Field(default="", max_length=500)


async def reconcile_call(
    database: AccountDatabase, request_id: str, actual_units: int, actor: str, reason: str, now: datetime
) -> LedgerEntry | AuthError:
    if not actor.strip() or not reason.strip() or not 0 <= actual_units <= MAX_UNITS:
        return AuthError("invalid_reconciliation", 422)
    async with database.tx() as tx:
        rows: Final = await tx.query_raw(
            """SELECT request_id,user_id,model,reserved_units,actual_units,status,native_request_id,created_at
            FROM "CommerceCallReservation" WHERE request_id=$1""",
            request_id,
        )
        if not rows:
            return AuthError("call_reservation_not_found", 404)
        reservation: Final = CallReservation.model_validate(rows[0])
        if reservation.created_at > now - timedelta(hours=1):
            return AuthError("call_still_recent", 409)
        result: Final = await settle_reserved_call(tx, reservation.user_id, request_id, actual_units, "success", now)
        if isinstance(result, AuthError) or reservation.status in {"settled", "released"}:
            return result
        await tx.execute_raw(
            """INSERT INTO "CommerceAuditEvent" (id,actor_id,action,target_id,reason,created_at)
            VALUES ($1,$2,'wallet_billing_reconcile',$3,$4,$5::timestamptz) ON CONFLICT (id) DO NOTHING""",
            "billing-reconcile:" + request_id,
            actor,
            request_id,
            reason,
            now,
        )
        return result


async def run(options: ReconcileOptions) -> int:
    database: Final = Prisma()
    await database.connect()
    try:
        if options.list_pending:
            rows: Final = await database.query_raw(
                """SELECT request_id,user_id,model,reserved_units,actual_units,status,native_request_id,created_at
                FROM "CommerceCallReservation" WHERE status IN ('pending','review') AND created_at<$1::timestamptz
                ORDER BY created_at LIMIT 100""",
                utcnow() - timedelta(hours=1),
            )
            print(json.dumps(tuple(CallReservation.model_validate(row).model_dump(mode="json") for row in rows)))
            return 0
        if options.request_id is None or options.actual_units is None:
            raise SystemExit("Resolution requires --request-id, --actual-units, --actor and --reason")
        result: Final = await reconcile_call(
            database, options.request_id, options.actual_units, options.actor, options.reason, utcnow()
        )
        if isinstance(result, AuthError):
            print(json.dumps({"error": result.code}))
            return 1
        print(result.model_dump_json())
        return 0
    finally:
        await database.disconnect()


def main() -> None:
    parser: Final = argparse.ArgumentParser(description="Review wallet holds against verified provider and native logs")
    group: Final = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--list", action="store_true", dest="list_pending")
    group.add_argument("--request-id")
    parser.add_argument("--actual-units")
    parser.add_argument("--actor", default="")
    parser.add_argument("--reason", default="")
    options: Final = ReconcileOptions.model_validate(vars(parser.parse_args()))
    try:
        raise SystemExit(asyncio.run(run(options)))
    except PrismaError:
        raise SystemExit("Wallet billing storage unavailable") from None


if __name__ == "__main__":
    main()
