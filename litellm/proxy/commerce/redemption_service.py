import re
import secrets
import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Final

from litellm.models.commerce_auth import AuthError, Session
from litellm.models.commerce_wallet import (
    BatchCommand,
    BatchInput,
    CodeRecord,
    GeneratedBatch,
    LedgerEntry,
    RedemptionStore,
)
from litellm.proxy.commerce.auth_service import utcnow
from litellm.proxy.commerce.security import AuthSecurity
from litellm.proxy.commerce.wallet_service import parse_usd


class RedemptionService:
    def __init__(self, store: RedemptionStore, security: AuthSecurity, clock: Callable[[], datetime] = utcnow) -> None:
        self.store = store
        self.security = security
        self.clock = clock

    async def generate(self, body: BatchInput, actor_id: str, request_id: str) -> GeneratedBatch | AuthError:
        amount: Final = parse_usd(body.amount_usd)
        if isinstance(amount, AuthError):
            return amount
        if not body.name.strip():
            return AuthError("invalid_request", 422)
        now: Final = self.clock()
        if body.expires_at is not None and (body.expires_at.tzinfo is None or body.expires_at <= now):
            return AuthError("invalid_expiry", 422)
        codes: Final = tuple("COCA1-" + secrets.token_hex(16).upper() for _ in range(body.count))
        command: Final = BatchCommand(
            id=uuid.uuid4().hex,
            request_key=actor_id + ":" + request_id,
            name=body.name.strip(),
            face_units=amount,
            expires_at=body.expires_at,
            actor_id=actor_id,
            now=now,
            codes=tuple(
                CodeRecord(id=uuid.uuid4().hex, code_hash=self.security.digest(code, "redemption-v1"), tail=code[-6:])
                for code in codes
            ),
        )
        batch: Final = await self.store.create_batch(command)
        return batch if isinstance(batch, AuthError) else GeneratedBatch(batch=batch, codes=codes)

    async def redeem(self, session: Session, code: str) -> LedgerEntry | AuthError:
        if not session.customer.email_verified:
            return AuthError("email_verification_required", 403)
        normalized: Final = code.strip().upper()
        if not re.fullmatch(r"COCA1-[0-9A-F]{32}", normalized):
            return AuthError("invalid_redemption")
        return await self.store.redeem(session, self.security.digest(normalized, "redemption-v1"), self.clock())
