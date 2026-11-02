import uuid
from datetime import datetime
from typing import Final, Literal

from litellm.models.commerce_auth import AuthError, Session
from litellm.repositories.commerce_auth_repository import AccountDatabase

from litellm.models.commerce_wallet import (
    MAX_UNITS,
    CallReservation,
    LedgerEntry,
    LedgerPage,
    WalletChange,
    WalletPage,
    WalletSnapshot,
    WalletSummary,
)


async def lock_customer(tx: AccountDatabase, user_id: str) -> bool:
    rows: Final = await tx.query_raw(
        'SELECT user_id FROM "CommerceCustomer" WHERE user_id=$1 AND enabled=true FOR UPDATE', user_id
    )
    return bool(rows)


async def valid_financial_session(tx: AccountDatabase, session: Session, now: datetime) -> bool:
    if not await lock_customer(tx, session.customer.user_id):
        return False
    rows: Final = await tx.query_raw(
        """SELECT token_hash FROM "CommerceSession" s JOIN "CommerceCustomer" c
        ON c.user_id=s.user_id WHERE s.token_hash=$1 AND s.user_id=$2 AND s.expires_at>$3::timestamptz
        AND c.email_verified=true FOR UPDATE OF s""",
        session.token_hash,
        session.customer.user_id,
        now,
    )
    return bool(rows)


async def ensure_wallet(tx: AccountDatabase, user_id: str) -> WalletSnapshot:
    await tx.execute_raw('INSERT INTO "CommerceWallet" (user_id) VALUES ($1) ON CONFLICT DO NOTHING', user_id)
    rows: Final = await tx.query_raw(
        """SELECT user_id,available_units,reserved_units,credited_units,debited_units,debt_units
        FROM "CommerceWallet" WHERE user_id=$1 FOR UPDATE""",
        user_id,
    )
    return WalletSnapshot.model_validate(rows[0])


async def apply_wallet_change(tx: AccountDatabase, change: WalletChange) -> LedgerEntry | AuthError:
    wallet: Final = await ensure_wallet(tx, change.user_id)
    existing: Final = await tx.query_raw('SELECT * FROM "CommerceLedger" WHERE business_key=$1', change.business_key)
    if existing:
        previous: Final = LedgerEntry.model_validate(
            {key: value for key, value in existing[0].items() if key != "business_key"}
        )
        same: Final = (
            previous.user_id,
            previous.delta_units,
            previous.kind,
            previous.reference,
            previous.actor_id,
            previous.reason,
        ) == (
            change.user_id,
            change.delta_units,
            change.kind,
            change.reference,
            change.actor_id,
            change.reason,
        )
        return previous if same else AuthError("idempotency_conflict", 409)
    net: Final = wallet.available_units - wallet.debt_units + change.delta_units
    available: Final = max(net, 0)
    debt: Final = max(-net, 0)
    credited: Final = wallet.credited_units + max(change.delta_units, 0)
    debited: Final = wallet.debited_units + max(-change.delta_units, 0)
    if change.delta_units == 0 or abs(change.delta_units) > MAX_UNITS:
        return AuthError("invalid_amount", 422)
    if change.delta_units < 0 and wallet.available_units + change.delta_units < 0:
        return AuthError("insufficient_balance", 409)
    if max(available + wallet.reserved_units, credited, debited, debt) > MAX_UNITS:
        return AuthError("balance_limit_reached", 409)
    entry: Final = LedgerEntry(
        id=uuid.uuid4().hex,
        user_id=change.user_id,
        delta_units=change.delta_units,
        available_after=available,
        kind=change.kind,
        reference=change.reference,
        actor_id=change.actor_id,
        reason=change.reason,
        created_at=change.now,
    )
    await tx.execute_raw(
        """UPDATE "CommerceWallet" SET available_units=$2::bigint,credited_units=$3::bigint,
        debited_units=$4::bigint,updated_at=$5::timestamptz,debt_units=$6::bigint WHERE user_id=$1""",
        change.user_id,
        available,
        credited,
        debited,
        change.now,
        debt,
    )
    stored: Final = await tx.query_raw(
        """INSERT INTO "CommerceLedger"
        (id,user_id,delta_units,available_after,kind,business_key,reference,actor_id,reason,created_at)
        VALUES ($1,$2,$3::bigint,$4::bigint,$5,$6,$7,$8,$9,$10::timestamptz)
        RETURNING id,user_id,delta_units,available_after,kind,reference,actor_id,reason,created_at""",
        entry.id,
        entry.user_id,
        entry.delta_units,
        entry.available_after,
        entry.kind,
        change.business_key,
        entry.reference,
        entry.actor_id,
        entry.reason,
        entry.created_at,
    )
    return LedgerEntry.model_validate(stored[0])


class WalletRepository:
    def __init__(self, database: AccountDatabase) -> None:
        self.database = database

    async def balance(self, user_id: str) -> WalletSnapshot | AuthError:
        async with self.database.tx() as tx:
            if not await lock_customer(tx, user_id):
                return AuthError("account_unavailable", 404)
            return await ensure_wallet(tx, user_id)

    async def transactions(self, user_id: str, limit: int, offset: int) -> LedgerPage:
        rows: Final = await self.database.query_raw(
            """SELECT id,user_id,delta_units,available_after,kind,
            reference,actor_id,reason,created_at FROM "CommerceLedger" WHERE user_id=$1
            ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3""",
            user_id,
            limit + 1,
            offset,
        )
        return LedgerPage(
            items=tuple(LedgerEntry.model_validate(row) for row in rows[:limit]), has_more=len(rows) > limit
        )

    async def adjust(self, change: WalletChange) -> LedgerEntry | AuthError:
        async with self.database.tx() as tx:
            if not await lock_customer(tx, change.user_id):
                return AuthError("account_unavailable", 404)
            return await apply_wallet_change(tx, change)

    async def wallets(self, search: str, limit: int, offset: int) -> WalletPage:
        rows: Final = await self.database.query_raw(
            """SELECT c.user_id,c.email_normalized AS email,
            COALESCE(w.available_units,0)::bigint AS available_units, COALESCE(w.reserved_units,0)::bigint AS reserved_units,
            COALESCE(w.credited_units,0)::bigint AS credited_units,COALESCE(w.debited_units,0)::bigint AS debited_units,
            COALESCE(w.debt_units,0)::bigint AS debt_units
            FROM "CommerceCustomer" c LEFT JOIN "CommerceWallet" w ON w.user_id=c.user_id
            WHERE c.user_id ILIKE $1 OR c.email_normalized ILIKE $1 ORDER BY c.created_at DESC,c.user_id
            LIMIT $2 OFFSET $3""",
            "%" + search + "%",
            limit + 1,
            offset,
        )
        return WalletPage(
            items=tuple(WalletSummary.model_validate(row) for row in rows[:limit]), has_more=len(rows) > limit
        )

    async def reserve_call(
        self,
        user_id: str,
        request_id: str,
        reserved_units: int,
        model: str,
        key_hash: str,
        now: datetime,
        native_request_id: str = "",
    ) -> CallReservation | AuthError:
        if reserved_units < 1 or reserved_units > MAX_UNITS:
            return AuthError("wallet_pricing_unavailable", 503)
        async with self.database.tx() as tx:
            if not await lock_customer(tx, user_id):
                return AuthError("account_unavailable", 403)
            wallet: Final = await ensure_wallet(tx, user_id)
            if wallet.debt_units or wallet.available_units < reserved_units:
                return AuthError("insufficient_balance", 402)
            existing: Final = await tx.query_raw(
                'SELECT request_id FROM "CommerceCallReservation" WHERE request_id=$1', request_id
            )
            if existing:
                return AuthError("idempotency_conflict", 409)
            await tx.execute_raw(
                """UPDATE "CommerceWallet" SET available_units=available_units-$2::bigint,
                reserved_units=reserved_units+$2::bigint,updated_at=$3::timestamptz WHERE user_id=$1""",
                user_id,
                reserved_units,
                now,
            )
            rows: Final = await tx.query_raw(
                """INSERT INTO "CommerceCallReservation"
                (request_id,user_id,model,key_hash,reserved_units,native_request_id,created_at,updated_at)
                VALUES ($1,$2,$3,$4,$5::bigint,$6,$7::timestamptz,$7::timestamptz)
                RETURNING request_id,user_id,model,reserved_units,actual_units,status,native_request_id,created_at""",
                request_id,
                user_id,
                model,
                key_hash,
                reserved_units,
                native_request_id,
                now,
            )
            return CallReservation.model_validate(rows[0])

    async def authorize_deployment(self, user_id: str, request_id: str, units: int, now: datetime) -> AuthError | None:
        if not 1 <= units <= MAX_UNITS:
            return AuthError("wallet_pricing_unavailable", 503)
        async with self.database.tx() as tx:
            if not await lock_customer(tx, user_id):
                return AuthError("account_unavailable", 403)
            rows: Final = await tx.query_raw(
                """SELECT request_id,user_id,model,reserved_units,actual_units,status,native_request_id,created_at
                FROM "CommerceCallReservation" WHERE request_id=$1 AND user_id=$2 FOR UPDATE""",
                request_id,
                user_id,
            )
            if not rows:
                return AuthError("call_reservation_not_found", 404)
            reservation: Final = CallReservation.model_validate(rows[0])
            if reservation.status not in {"pending", "review"}:
                return AuthError("idempotency_conflict", 409)
            wallet: Final = await ensure_wallet(tx, user_id)
            additional: Final = max(units - reservation.reserved_units, 0)
            if wallet.debt_units or wallet.available_units < additional:
                return AuthError("insufficient_balance", 402)
            if additional:
                await tx.execute_raw(
                    """UPDATE "CommerceWallet" SET available_units=available_units-$2::bigint,
                    reserved_units=reserved_units+$2::bigint,updated_at=$3::timestamptz WHERE user_id=$1""",
                    user_id,
                    additional,
                    now,
                )
            await tx.execute_raw(
                """UPDATE "CommerceCallReservation" SET reserved_units=GREATEST(reserved_units,$2::bigint),
                dispatched_at=COALESCE(dispatched_at,$3::timestamptz),updated_at=$3::timestamptz
                WHERE request_id=$1""",
                request_id,
                units,
                now,
            )
            return None

    async def settle_call(
        self,
        user_id: str,
        request_id: str,
        actual_units: int,
        outcome: Literal["success", "failure"],
        now: datetime,
    ) -> LedgerEntry | AuthError:
        if actual_units < 0 or actual_units > MAX_UNITS or (outcome == "failure" and actual_units != 0):
            return AuthError("invalid_call_charge", 422)
        async with self.database.tx() as tx:
            return await settle_reserved_call(tx, user_id, request_id, actual_units, outcome, now)

    async def mark_call_dispatched(self, user_id: str, request_id: str, now: datetime) -> None:
        await self.database.execute_raw(
            """UPDATE "CommerceCallReservation" SET dispatched_at=COALESCE(dispatched_at,$3::timestamptz),
            updated_at=$3::timestamptz WHERE request_id=$1 AND user_id=$2 AND status IN ('pending','review')""",
            request_id,
            user_id,
            now,
        )

    async def release_undispatched_call(self, user_id: str, request_id: str, now: datetime) -> None:
        async with self.database.tx() as tx:
            await tx.query_raw('SELECT user_id FROM "CommerceCustomer" WHERE user_id=$1 FOR UPDATE', user_id)
            rows: Final = await tx.query_raw(
                """SELECT request_id FROM "CommerceCallReservation" WHERE request_id=$1 AND user_id=$2
                AND dispatched_at IS NULL AND status IN ('pending','review') FOR UPDATE""",
                request_id,
                user_id,
            )
            if rows:
                await settle_reserved_call(tx, user_id, request_id, 0, "failure", now)

    async def review_incomplete_call(self, user_id: str, request_id: str, now: datetime) -> None:
        await self.database.execute_raw(
            """UPDATE "CommerceCallReservation" SET status='review',updated_at=$3::timestamptz
            WHERE request_id=$1 AND user_id=$2 AND status='pending'""",
            request_id,
            user_id,
            now,
        )


async def settle_reserved_call(
    tx: AccountDatabase,
    user_id: str,
    request_id: str,
    actual_units: int,
    outcome: Literal["success", "failure"],
    now: datetime,
) -> LedgerEntry | AuthError:
    await tx.query_raw('SELECT user_id FROM "CommerceCustomer" WHERE user_id=$1 FOR UPDATE', user_id)
    rows: Final = await tx.query_raw(
        """SELECT request_id,user_id,model,reserved_units,actual_units,status,native_request_id,created_at
        FROM "CommerceCallReservation" WHERE request_id=$1 AND user_id=$2 FOR UPDATE""",
        request_id,
        user_id,
    )
    if not rows:
        return AuthError("call_reservation_not_found", 404)
    reservation: Final = CallReservation.model_validate(rows[0])
    status: Final = "settled" if outcome == "success" else "released"
    business_key: Final = "usage:" + request_id
    if reservation.status in {"settled", "released"}:
        if reservation.actual_units != actual_units or reservation.status != status:
            return AuthError("idempotency_conflict", 409)
        previous: Final = await tx.query_raw(
            """SELECT id,user_id,delta_units,available_after,kind,reference,actor_id,reason,created_at
            FROM "CommerceLedger" WHERE business_key=$1""",
            business_key,
        )
        return LedgerEntry.model_validate(previous[0])
    wallet: Final = await ensure_wallet(tx, user_id)
    net: Final = wallet.available_units + reservation.reserved_units - wallet.debt_units - actual_units
    debited: Final = wallet.debited_units + actual_units
    if max(abs(net), debited) > MAX_UNITS or wallet.reserved_units < reservation.reserved_units:
        return AuthError("balance_limit_reached", 409)
    await tx.execute_raw(
        """UPDATE "CommerceWallet" SET available_units=$2::bigint,
        reserved_units=reserved_units-$3::bigint,debt_units=$4::bigint,
        debited_units=$5::bigint,updated_at=$6::timestamptz WHERE user_id=$1""",
        user_id,
        max(net, 0),
        reservation.reserved_units,
        max(-net, 0),
        debited,
        now,
    )
    entry: Final = await tx.query_raw(
        """INSERT INTO "CommerceLedger"
        (id,user_id,delta_units,available_after,kind,business_key,reference,actor_id,reason,created_at)
        VALUES ($1,$2,$3::bigint,$4::bigint,'usage',$5,$6,'api-billing',$7,$8::timestamptz)
        RETURNING id,user_id,delta_units,available_after,kind,reference,actor_id,reason,created_at""",
        uuid.uuid4().hex,
        user_id,
        -actual_units,
        max(net, 0),
        business_key,
        request_id,
        reservation.model + (" · API 调用" if outcome == "success" else " · 失败退还冻结额度"),
        now,
    )
    await tx.execute_raw(
        """UPDATE "CommerceCallReservation" SET status=$2,actual_units=$3::bigint,
        updated_at=$4::timestamptz WHERE request_id=$1""",
        request_id,
        status,
        actual_units,
        now,
    )
    return LedgerEntry.model_validate(entry[0])
