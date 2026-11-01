import uuid
from datetime import datetime
from typing import Final

from litellm.models.commerce_auth import AuthError, Session
from litellm.models.commerce_wallet import (
    MAX_UNITS,
    LedgerEntry,
    LedgerPage,
    WalletChange,
    WalletPage,
    WalletSnapshot,
    WalletSummary,
)
from litellm.repositories.commerce_auth_repository import AccountDatabase


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
        """SELECT user_id,available_units,reserved_units,credited_units,debited_units
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
    available: Final = wallet.available_units + change.delta_units
    credited: Final = wallet.credited_units + max(change.delta_units, 0)
    debited: Final = wallet.debited_units + max(-change.delta_units, 0)
    if change.delta_units == 0 or abs(change.delta_units) > MAX_UNITS:
        return AuthError("invalid_amount", 422)
    if available < 0:
        return AuthError("insufficient_balance", 409)
    if max(available, credited, debited) > MAX_UNITS:
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
        debited_units=$4::bigint,updated_at=$5::timestamptz WHERE user_id=$1""",
        change.user_id,
        available,
        credited,
        debited,
        change.now,
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
            COALESCE(w.credited_units,0)::bigint AS credited_units,COALESCE(w.debited_units,0)::bigint AS debited_units
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
