from datetime import datetime, timedelta
from typing import Final

from litellm.models.commerce_auth import AuthError, Session
from litellm.models.commerce_gateway import (
    CreatedGatewayKey,
    CreateGatewayKey,
    GatewayAccess,
    GatewayKey,
    GatewayKeys,
    NativeGateway,
    PlaygroundInput,
    PlaygroundOutput,
)
from litellm.proxy._types import hash_token
from litellm.proxy.commerce.security import AuthSecurity
from litellm.repositories.commerce_gateway_repository import GatewayRepository, StoredKey


def usage_window(now: datetime, days: int) -> tuple[datetime, datetime]:
    return now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1), now


def creation_reason(verified: bool, models: tuple[str, ...], budget: float | None, spend: float) -> str | None:
    if not verified:
        return "email_verification_required"
    if not models:
        return "model_access_required"
    if budget is not None and spend >= budget:
        return "api_budget_exhausted"
    return None


class GatewayService:
    def __init__(self, store: GatewayRepository, native: NativeGateway, security: AuthSecurity) -> None:
        self.store = store
        self.native = native
        self.security = security

    async def access(self, session: Session) -> GatewayAccess | AuthError:
        stored: Final = await self.store.access(session.customer.user_id)
        available: Final = await self.native.models(stored.models)
        if isinstance(available, AuthError):
            return available
        allowed: Final = tuple(sorted(set(available)))
        reason: Final = creation_reason(session.customer.email_verified, allowed, stored.max_budget, stored.spend)
        return GatewayAccess(
            models=allowed,
            max_budget_usd=stored.max_budget,
            spend_usd=stored.spend,
            rpm_limit=stored.rpm_limit,
            tpm_limit=stored.tpm_limit,
            budget_reset_at=stored.budget_reset_at,
            can_create_key=reason is None,
            key_creation_reason=reason,
            budget_duration=stored.budget_duration,
        )

    def key_view(self, row: StoredKey) -> GatewayKey:
        return GatewayKey(
            id=self.security.seal(row.token.get_secret_value()),
            name=row.key_alias or "未命名密钥",
            models=row.models,
            spend_usd=row.spend,
            max_budget_usd=row.max_budget,
            expires_at=row.expires,
            created_at=row.created_at,
            blocked=bool(row.blocked),
            budget_duration=row.budget_duration,
            budget_reset_at=row.budget_reset_at,
            total_spend_usd=row.total_spend,
            rpm_limit=row.rpm_limit,
            tpm_limit=row.tpm_limit,
            tpd_limit=row.tpd_limit,
            last_active_at=row.last_active,
        )

    async def keys(self, session: Session, limit: int, offset: int) -> GatewayKeys:
        rows: Final = await self.store.keys(session.customer.user_id, limit + 1, offset)
        return GatewayKeys(items=tuple(self.key_view(row) for row in rows[:limit]), has_more=len(rows) > limit)

    async def create(self, session: Session, body: CreateGatewayKey) -> CreatedGatewayKey | AuthError:
        if not body.name.strip():
            return AuthError("invalid_request", 422)
        access: Final = await self.access(session)
        if isinstance(access, AuthError):
            return access
        if access.key_creation_reason:
            return AuthError(access.key_creation_reason, 403)
        selected: Final = access.models if body.models == ("all-proxy-models",) else body.models
        if selected is not None and (not selected or not set(selected).issubset(access.models)):
            return AuthError("model_access_required", 403)
        existing: Final = await self.store.keys(session.customer.user_id, 100, 0)
        if len(existing) >= 100:
            return AuthError("key_limit_reached", 409)
        result: Final = await self.native.create_key(
            session.customer.user_id, body.model_copy(update={"models": selected}), access
        )
        if isinstance(result, AuthError):
            return result
        owned: Final = await self.store.safe_created_key(
            session.customer.user_id, hash_token(result.get_secret_value())
        )
        if not owned:
            cleanup: Final = await self.native.delete_key(
                hash_token(result.get_secret_value()), session.customer.user_id
            )
            return cleanup or AuthError("personal_key_unavailable", 503)
        return CreatedGatewayKey(key=result.get_secret_value())

    async def key(self, session: Session, key_id: str) -> GatewayKey | AuthError:
        token: Final = self.security.unseal(key_id)
        row: Final = await self.store.key(session.customer.user_id, token) if token else None
        return self.key_view(row) if row else AuthError("key_not_found", 404)

    async def delete(self, session: Session, key_id: str) -> AuthError | None:
        token: Final = self.security.unseal(key_id)
        if token is None or await self.store.key(session.customer.user_id, token) is None:
            return AuthError("key_not_found", 404)
        return await self.native.delete_key(token, session.customer.user_id)

    async def chat(self, session: Session, body: PlaygroundInput) -> PlaygroundOutput | AuthError:
        owned: Final = await self.store.key(session.customer.user_id, hash_token(body.api_key.get_secret_value()))
        if owned is None:
            return AuthError("key_not_found", 404)
        access: Final = await self.access(session)
        if isinstance(access, AuthError):
            return access
        if body.model not in access.models:
            return AuthError("model_access_required", 403)
        if not session.customer.email_verified:
            return AuthError("email_verification_required", 403)
        if access.key_creation_reason:
            return AuthError(access.key_creation_reason, 403)
        return await self.native.chat(body)
