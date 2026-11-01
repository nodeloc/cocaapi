import uuid
from datetime import datetime
from typing import Final

from pydantic import TypeAdapter

from litellm.models.commerce_auth import AuthError, Session
from litellm.models.commerce_wallet import BatchCommand, BatchPage, LedgerEntry, RedeemBatch, WalletChange
from litellm.repositories.commerce_auth_repository import AccountDatabase
from litellm.repositories.commerce_wallet_repository import apply_wallet_change, valid_financial_session

_BATCH_SELECT: Final = """SELECT b.id,b.name,b.face_units,b.count,b.disabled,b.expires_at,b.created_at,b.created_by,
    (SELECT count(*)::int FROM "CommerceRedeemCode" c WHERE c.batch_id=b.id AND c.redeemed_by IS NOT NULL) AS redeemed_count
    FROM "CommerceRedeemBatch" b"""


async def audit(tx: AccountDatabase, actor: str, action: str, target: str, reason: str, now: datetime) -> None:
    await tx.execute_raw(
        """INSERT INTO "CommerceAuditEvent" (id,actor_id,action,target_id,reason,created_at)
        VALUES ($1,$2,$3,$4,$5,$6::timestamptz)""",
        uuid.uuid4().hex,
        actor,
        action,
        target,
        reason,
        now,
    )


class RedemptionRepository:
    def __init__(self, database: AccountDatabase) -> None:
        self.database = database

    async def create_batch(self, command: BatchCommand) -> RedeemBatch | AuthError:
        async with self.database.tx() as tx:
            await tx.query_raw(
                "SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text", "voucher-batch:" + command.request_key
            )
            existing: Final = await tx.query_raw(
                'SELECT id FROM "CommerceRedeemBatch" WHERE request_key=$1', command.request_key
            )
            if existing:
                return AuthError("batch_already_created", 409)
            await tx.execute_raw(
                """INSERT INTO "CommerceRedeemBatch"
                (id,request_key,name,face_units,count,expires_at,created_by,created_at)
                VALUES ($1,$2,$3,$4::bigint,$5,$6::text::timestamptz,$7,$8::timestamptz)""",
                command.id,
                command.request_key,
                command.name,
                command.face_units,
                len(command.codes),
                command.expires_at,
                command.actor_id,
                command.now,
            )
            for code in command.codes:
                await tx.execute_raw(
                    'INSERT INTO "CommerceRedeemCode" (id,batch_id,code_hash,tail) VALUES ($1,$2,$3,$4)',
                    code.id,
                    command.id,
                    code.code_hash,
                    code.tail,
                )
            await audit(tx, command.actor_id, "redeem_batch_created", command.id, command.name, command.now)
            rows: Final = await tx.query_raw(_BATCH_SELECT + " WHERE b.id=$1", command.id)
            return RedeemBatch.model_validate(rows[0])

    async def batches(self, limit: int, offset: int) -> BatchPage:
        rows: Final = await self.database.query_raw(
            _BATCH_SELECT + " ORDER BY b.created_at DESC,b.id DESC LIMIT $1 OFFSET $2", limit + 1, offset
        )
        return BatchPage(
            items=tuple(RedeemBatch.model_validate(row) for row in rows[:limit]), has_more=len(rows) > limit
        )

    async def disable_batch(self, batch_id: str, actor_id: str, reason: str, now: datetime) -> RedeemBatch | AuthError:
        async with self.database.tx() as tx:
            rows: Final = await tx.query_raw(
                'SELECT id,disabled FROM "CommerceRedeemBatch" WHERE id=$1 FOR UPDATE', batch_id
            )
            if not rows:
                return AuthError("batch_not_found", 404)
            if not rows[0]["disabled"]:
                await tx.execute_raw('UPDATE "CommerceRedeemBatch" SET disabled=true WHERE id=$1', batch_id)
                await audit(tx, actor_id, "redeem_batch_disabled", batch_id, reason, now)
            updated: Final = await tx.query_raw(_BATCH_SELECT + " WHERE b.id=$1", batch_id)
            return RedeemBatch.model_validate(updated[0])

    async def redeem(self, session: Session, code_hash: str, now: datetime) -> LedgerEntry | AuthError:
        async with self.database.tx() as tx:
            located: Final = await tx.query_raw(
                'SELECT batch_id FROM "CommerceRedeemCode" WHERE code_hash=$1', code_hash
            )
            if not located:
                return AuthError("invalid_redemption")
            batch_id: Final = TypeAdapter(str).validate_python(located[0]["batch_id"])
            await tx.query_raw('SELECT id FROM "CommerceRedeemBatch" WHERE id=$1 FOR UPDATE', batch_id)
            batches: Final = await tx.query_raw(_BATCH_SELECT + " WHERE b.id=$1", batch_id)
            batch: Final = RedeemBatch.model_validate(batches[0])
            rows: Final = await tx.query_raw(
                'SELECT id,redeemed_by FROM "CommerceRedeemCode" WHERE code_hash=$1 FOR UPDATE', code_hash
            )
            if not await valid_financial_session(tx, session, now):
                return AuthError("authentication_required", 401)
            code_id: Final = TypeAdapter(str).validate_python(rows[0]["id"])
            owner: Final = rows[0]["redeemed_by"]
            if owner is not None:
                if owner != session.customer.user_id:
                    return AuthError("invalid_redemption")
                receipt: Final = await tx.query_raw(
                    """SELECT id,user_id,delta_units,available_after,kind,reference,
                    actor_id,reason,created_at FROM "CommerceLedger" WHERE business_key=$1""",
                    "redemption:" + code_id,
                )
                return LedgerEntry.model_validate(receipt[0]) if receipt else AuthError("invalid_redemption")
            if batch.disabled or (batch.expires_at is not None and batch.expires_at <= now):
                return AuthError("invalid_redemption")
            result: Final = await apply_wallet_change(
                tx,
                WalletChange(
                    user_id=session.customer.user_id,
                    delta_units=batch.face_units,
                    kind="redemption",
                    business_key="redemption:" + code_id,
                    reference=batch.id,
                    actor_id=session.customer.user_id,
                    reason="兑换码到账",
                    now=now,
                ),
            )
            if isinstance(result, AuthError):
                return result
            await tx.execute_raw(
                'UPDATE "CommerceRedeemCode" SET redeemed_by=$2,redeemed_at=$3::timestamptz WHERE id=$1',
                code_id,
                session.customer.user_id,
                now,
            )
            return result
