import json
import uuid
from datetime import datetime
from typing import Final

from litellm.models.commerce_auth import AuthError, Session
from litellm.models.commerce_payment import (
    CreatedOrder,
    GatewayInvoice,
    OrderIntent,
    PaymentNotification,
    StoredOrder,
    StoredOrderPage,
    VerifiedPayment,
)
from litellm.models.commerce_wallet import WalletChange
from litellm.repositories.commerce_auth_repository import AccountDatabase
from litellm.repositories.commerce_redemption_repository import audit
from litellm.repositories.commerce_wallet_repository import apply_wallet_change, lock_customer, valid_financial_session


class PaymentRepository:
    def __init__(self, database: AccountDatabase) -> None:
        self.database = database

    async def request_order(self, session: Session, request_key: str, now: datetime) -> StoredOrder | AuthError | None:
        async with self.database.tx() as tx:
            if not await valid_financial_session(tx, session, now):
                return AuthError("authentication_required", 401)
            rows: Final = await tx.query_raw(
                'SELECT * FROM "CommerceRechargeOrder" WHERE user_id=$1 AND request_key=$2',
                session.customer.user_id,
                request_key,
            )
            return StoredOrder.model_validate(rows[0]) if rows else None

    async def create_order(self, session: Session, intent: OrderIntent) -> CreatedOrder | AuthError:
        async with self.database.tx() as tx:
            if not await valid_financial_session(tx, session, intent.now):
                return AuthError("authentication_required", 401)
            await tx.query_raw(
                "SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text", "recharge:" + intent.request_key
            )
            rows: Final = await tx.query_raw(
                'SELECT * FROM "CommerceRechargeOrder" WHERE request_key=$1', intent.request_key
            )
            if rows:
                previous: Final = StoredOrder.model_validate(rows[0])
                if (previous.user_id, previous.credit_units, previous.network) != (
                    intent.user_id,
                    intent.credit_units,
                    intent.network,
                ):
                    return AuthError("idempotency_conflict", 409)
                return CreatedOrder(order=previous, created=False)
            inserted: Final = await tx.query_raw(
                """INSERT INTO "CommerceRechargeOrder"
                (id,user_id,credit_units,network,provider,merchant_account_id,request_key,created_at,asset,payment_amount,quote_snapshot)
                VALUES ($1,$2,$3::bigint,$4,$5,$6,$7,$8::timestamptz,$9,$10,$11::jsonb) RETURNING *""",
                intent.id,
                intent.user_id,
                intent.credit_units,
                intent.network,
                intent.provider,
                intent.merchant_account_id,
                intent.request_key,
                intent.now,
                intent.quote.asset if intent.quote else "USDT",
                intent.quote.amount if intent.quote else None,
                json.dumps(intent.quote.model_dump(mode="json")) if intent.quote else None,
            )
            return CreatedOrder(order=StoredOrder.model_validate(inserted[0]), created=True)

    async def get_order(self, order_id: str, user_id: str | None) -> StoredOrder | None:
        rows: Final = await self.database.query_raw(
            """SELECT * FROM "CommerceRechargeOrder"
            WHERE id=$1 AND ($2::text IS NULL OR user_id=$2)""",
            order_id,
            user_id,
        )
        return StoredOrder.model_validate(rows[0]) if rows else None

    async def orders(self, user_id: str | None, search: str, limit: int, offset: int) -> StoredOrderPage:
        rows: Final = await self.database.query_raw(
            """SELECT * FROM "CommerceRechargeOrder"
            WHERE ($1::text IS NULL OR user_id=$1) AND (id ILIKE $2 OR user_id ILIKE $2)
            ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4""",
            user_id,
            "%" + search + "%",
            limit + 1,
            offset,
        )
        return StoredOrderPage(
            items=tuple(StoredOrder.model_validate(row) for row in rows[:limit]), has_more=len(rows) > limit
        )

    async def save_invoice(self, order: StoredOrder, invoice: GatewayInvoice, now: datetime) -> StoredOrder | AuthError:
        async with self.database.tx() as tx:
            rows: Final = await tx.query_raw('SELECT * FROM "CommerceRechargeOrder" WHERE id=$1 FOR UPDATE', order.id)
            current: Final = StoredOrder.model_validate(rows[0])
            if current.external_id is not None and current.external_id != invoice.external_id:
                return AuthError("gateway_invalid_response", 502)
            if current.status != "creating" and not (
                current.status == "pending" and current.checkout_url is None and current.provider == "goepay"
            ):
                return current
            saved: Final = await tx.query_raw(
                """UPDATE "CommerceRechargeOrder" SET status='pending',external_id=$2,
                amount_usdt=CASE WHEN asset='USDT' THEN $3 ELSE NULL END,
                payment_amount=$3,checkout_url=$4,expires_at=$5::text::timestamptz WHERE id=$1 RETURNING *""",
                order.id,
                invoice.external_id,
                invoice.amount,
                invoice.checkout_url,
                invoice.expires_at,
            )
            return StoredOrder.model_validate(saved[0])

    async def reconcile(
        self,
        order: StoredOrder,
        receipt: VerifiedPayment,
        notification: PaymentNotification | None,
        review_reason: str | None,
        actor_id: str,
        now: datetime,
    ) -> StoredOrder | AuthError:
        async with self.database.tx() as tx:
            rows: Final = await tx.query_raw('SELECT * FROM "CommerceRechargeOrder" WHERE id=$1 FOR UPDATE', order.id)
            current: Final = StoredOrder.model_validate(rows[0])
            if current.status == "creating":
                if current.provider != "goepay" or current.quote is None or review_reason is not None:
                    return AuthError("order_not_ready", 503)
                await tx.execute_raw(
                    'UPDATE "CommerceRechargeOrder" SET external_id=$2 WHERE id=$1', current.id, receipt.external_id
                )
            if current.external_id is not None and current.external_id != receipt.external_id and review_reason is None:
                return AuthError("gateway_invalid_response", 502)
            if notification is not None:
                await tx.query_raw(
                    "SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text",
                    "payment-event:" + order.provider + ":" + notification.event_id,
                )
                previous: Final = await tx.query_raw(
                    """SELECT order_id FROM "CommercePaymentEvent"
                    WHERE provider=$1 AND event_id=$2""",
                    order.provider,
                    notification.event_id,
                )
                if previous and previous[0]["order_id"] != current.id:
                    return AuthError("payment_event_conflict", 409)
            if current.status == "paid":
                return current
            if review_reason is not None:
                reviewed: Final = await tx.query_raw(
                    "UPDATE \"CommerceRechargeOrder\" SET status='review',review_reason=$2 WHERE id=$1 RETURNING *",
                    current.id,
                    review_reason,
                )
                await audit(tx, actor_id, "recharge_review_required", current.id, review_reason, now)
                return StoredOrder.model_validate(reviewed[0])
            if receipt.status != "paid":
                if current.status != "review":
                    await tx.execute_raw(
                        'UPDATE "CommerceRechargeOrder" SET status=$2 WHERE id=$1', current.id, receipt.status
                    )
                return await self._read(tx, current.id)
            if not await lock_customer(tx, current.user_id):
                await tx.execute_raw(
                    "UPDATE \"CommerceRechargeOrder\" SET status='review',review_reason='account_unavailable' WHERE id=$1",
                    current.id,
                )
                return await self._read(tx, current.id)
            credited: Final = await apply_wallet_change(
                tx,
                WalletChange(
                    user_id=current.user_id,
                    delta_units=current.credit_units,
                    kind="recharge",
                    business_key="recharge:" + current.id,
                    reference=current.id,
                    actor_id="payment:" + current.provider,
                    reason="充值到账",
                    now=now,
                ),
            )
            if isinstance(credited, AuthError):
                return credited
            if notification is not None:
                await tx.execute_raw(
                    """INSERT INTO "CommercePaymentEvent" (id,provider,event_id,order_id,created_at)
                    VALUES ($1,$2,$3,$4,$5::timestamptz) ON CONFLICT (provider,event_id) DO NOTHING""",
                    uuid.uuid4().hex,
                    current.provider,
                    notification.event_id,
                    current.id,
                    now,
                )
            await tx.execute_raw(
                """UPDATE "CommerceRechargeOrder" SET status='paid',paid_at=$2::text::timestamptz,
                review_reason=NULL WHERE id=$1""",
                current.id,
                receipt.paid_at,
            )
            await audit(tx, actor_id, "recharge_credited", current.id, "服务端查单核实到账", now)
            return await self._read(tx, current.id)

    async def _read(self, tx: AccountDatabase, order_id: str) -> StoredOrder:
        rows: Final = await tx.query_raw('SELECT * FROM "CommerceRechargeOrder" WHERE id=$1', order_id)
        return StoredOrder.model_validate(rows[0])
