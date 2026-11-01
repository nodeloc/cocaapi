import asyncio
import secrets
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Final

from litellm.models.commerce_auth import (
    AccountStore,
    ActionPurpose,
    AuthError,
    Customer,
    ExternalIdentity,
    LoginResult,
    MailPayload,
    OAuthFlow,
    PendingAction,
    ProviderID,
    Session,
)
from litellm.proxy.commerce.config import AccountSettings
from litellm.proxy.commerce.security import AuthSecurity, safe_return_path
from litellm.proxy.utils import hash_password, verify_password


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AccountService:
    def __init__(self, store: AccountStore, settings: AccountSettings, clock: Callable[[], datetime] = utcnow) -> None:
        self.store = store
        self.settings = settings
        self.clock = clock
        self.security = AuthSecurity(settings.secret.get_secret_value())

    async def rate_limit(self, purpose: str, subject: str, limit: int) -> bool:
        now: Final = self.clock()
        return await self.store.allow_attempt(
            self.security.digest(subject, purpose), now.replace(second=0, microsecond=0), limit
        )

    async def register(self, email: str, password: str) -> Customer | AuthError:
        if not self.settings.registration_enabled:
            return AuthError("registration_closed", 403)
        if not self.settings.email_ready:
            return AuthError("email_unavailable", 503)
        if not await self.rate_limit("register-email", email, 3):
            return AuthError("too_many_attempts", 429)
        password_hash: Final = await asyncio.to_thread(hash_password, password)
        result: Final = await self.store.create_customer(
            email, password_hash, False, None, None, self.clock(), self.email_action(email, "verify")
        )
        if isinstance(result, AuthError):
            return result
        return result

    async def login(self, email: str, password: str) -> LoginResult | AuthError:
        if not await self.rate_limit("login-email", email, 8):
            return AuthError("too_many_attempts", 429)
        customer: Final = await self.store.find_customer(email)
        stored: Final = (
            customer.password_hash.get_secret_value()
            if customer and customer.password_hash
            else "scrypt:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        )
        valid: Final = await asyncio.to_thread(verify_password, password, stored)
        if customer is None or not valid or not customer.enabled:
            return AuthError("invalid_credentials", 401)
        return await self.new_session(customer)

    async def new_session(
        self, customer: Customer, return_path: str = "/account/profile/", identity: ExternalIdentity | None = None
    ) -> LoginResult | AuthError:
        token: Final = secrets.token_urlsafe(32)
        now: Final = self.clock()
        saved: Final = await self.store.save_session(
            customer, self.security.digest(token, "session"), now + timedelta(days=7), now, identity
        )
        if not saved:
            return AuthError("invalid_credentials", 401)
        return LoginResult(customer, token, safe_return_path(return_path))

    async def session(self, token: str | None) -> Session | None:
        if not token or len(token) > 256:
            return None
        return await self.store.get_session(self.security.digest(token, "session"), self.clock())

    async def logout(self, token: str) -> None:
        await self.store.revoke_session(self.security.digest(token, "session"))

    def email_action(self, email: str, purpose: ActionPurpose) -> PendingAction:
        token: Final = secrets.token_urlsafe(32)
        now: Final = self.clock()
        payload: Final = MailPayload(email=email, purpose=purpose, token=token)
        return PendingAction(
            purpose=purpose,
            token_hash=self.security.digest(token, purpose),
            email=email,
            payload=self.security.seal(payload.model_dump_json()),
            expires_at=now + (timedelta(hours=24) if purpose == "verify" else timedelta(minutes=30)),
        )

    async def queue_email(self, customer: Customer, purpose: ActionPurpose) -> None:
        if customer.email is None:
            return
        action: Final = self.email_action(customer.email, purpose)
        await self.store.queue_action(
            customer.user_id, purpose, action.token_hash, action.email, action.payload, self.clock(), action.expires_at
        )

    async def request_email(self, email: str, purpose: ActionPurpose) -> AuthError | None:
        if not self.settings.email_ready:
            return AuthError("email_unavailable", 503)
        if not await self.rate_limit("mail-" + purpose, email, 1):
            return AuthError("too_many_attempts", 429)
        customer: Final = await self.store.find_customer(email)
        if customer and customer.enabled and (purpose == "reset" or not customer.email_verified):
            await self.queue_email(customer, purpose)
        return None

    async def verify_email(self, token: str) -> bool:
        return await self.store.consume_action(self.security.digest(token, "verify"), "verify", self.clock())

    async def reset_password(self, token: str, password: str) -> bool:
        password_hash: Final = await asyncio.to_thread(hash_password, password)
        return await self.store.consume_action(
            self.security.digest(token, "reset"), "reset", self.clock(), password_hash
        )

    async def complete_email(self, session: Session, email: str) -> AuthError | None:
        if not self.recently_authenticated(session):
            return AuthError("reauthentication_required", 403)
        if not self.settings.email_ready:
            return AuthError("email_unavailable", 503)
        if not await self.rate_limit("complete-email", session.customer.user_id, 3):
            return AuthError("too_many_attempts", 429)
        customer: Final = await self.store.set_email(session, email, self.clock())
        if isinstance(customer, AuthError):
            return customer
        await self.queue_email(customer, "verify")
        return None

    def recently_authenticated(self, session: Session) -> bool:
        return timedelta(0) <= self.clock() - session.auth_at <= timedelta(minutes=5)

    async def change_password(self, session: Session, password: str, current_password: str | None) -> AuthError | None:
        if not session.customer.email_verified:
            return AuthError("email_verification_required", 403)
        if not self.recently_authenticated(session):
            return AuthError("reauthentication_required", 403)
        stored: Final = session.customer.password_hash
        if stored and (
            not current_password
            or not await asyncio.to_thread(verify_password, current_password, stored.get_secret_value())
        ):
            return AuthError("invalid_credentials", 401)
        password_hash: Final = await asyncio.to_thread(hash_password, password)
        saved: Final = await self.store.set_password(session, password_hash, self.clock())
        return None if saved else AuthError("reauthentication_required", 403)

    async def start_flow(
        self, provider: ProviderID, browser: str, intent: str, session: Session | None, return_path: str
    ) -> tuple[str, OAuthFlow] | AuthError:
        if not browser or len(browser) > 256:
            return AuthError("invalid_authorization")
        if self.settings.provider(provider) is None:
            return AuthError("provider_unavailable", 404)
        if intent not in {"login", "link", "reauth"}:
            return AuthError("invalid_authorization", 400)
        if intent != "login" and session is None:
            return AuthError("authentication_required", 401)
        if intent == "link" and session and not self.recently_authenticated(session):
            return AuthError("reauthentication_required", 403)
        if intent == "link" and session and not session.customer.email_verified:
            return AuthError("email_verification_required", 403)
        if not await self.rate_limit("oauth-start", browser, 10):
            return AuthError("too_many_attempts", 429)
        state: Final = secrets.token_urlsafe(32)
        flow: Final = OAuthFlow.model_validate(
            {
                "state_hash": self.security.digest(state, "oauth-state"),
                "browser_hash": self.security.digest(browser, "oauth-browser"),
                "provider": provider,
                "intent": intent,
                "nonce": self.security.seal(secrets.token_urlsafe(32)),
                "verifier": self.security.seal(secrets.token_urlsafe(48)),
                "return_path": safe_return_path(return_path),
                "expires_at": self.clock() + timedelta(minutes=10),
                "user_id": session.customer.user_id if session and intent != "login" else None,
                "session_hash": session.token_hash if session and intent != "login" else None,
            }
        )
        await self.store.save_flow(flow)
        return state, flow

    async def take_flow(self, provider: ProviderID, state: str, browser: str) -> OAuthFlow | None:
        if not state or not browser or len(state) > 256 or len(browser) > 256:
            return None
        return await self.store.consume_flow(
            self.security.digest(state, "oauth-state"),
            self.security.digest(browser, "oauth-browser"),
            provider,
            self.clock(),
        )

    async def finish_oauth(
        self, flow: OAuthFlow, identity: ExternalIdentity, current_session: Session | None
    ) -> LoginResult | AuthError | str:
        provider: Final = self.settings.provider(flow.provider)
        if provider is None:
            return AuthError("provider_unavailable", 404)
        if identity.issuer != provider.issuer:
            return AuthError("invalid_authorization")
        if flow.intent != "login":
            if (
                current_session is None
                or current_session.token_hash != flow.session_hash
                or current_session.customer.user_id != flow.user_id
            ):
                return AuthError("authorization_session_changed", 403)
            if flow.intent == "reauth":
                owner: Final = await self.store.find_external(identity)
                if owner is None or owner.user_id != flow.user_id or not owner.enabled:
                    return AuthError("identity_not_linked", 403)
                await self.store.refresh_auth(current_session.token_hash, self.clock())
                return flow.return_path
            if not self.recently_authenticated(current_session):
                return AuthError("reauthentication_required", 403)
            if not current_session.customer.email_verified:
                return AuthError("email_verification_required", 403)
            linked: Final = await self.store.link_identity(
                current_session.customer.user_id, flow.provider, identity, self.clock(), current_session.token_hash
            )
            return flow.return_path if linked else AuthError("identity_already_linked", 409)
        existing: Final = await self.store.find_external(identity)
        if existing is not None:
            if not existing.enabled:
                return AuthError("account_unavailable", 403)
            return await self.new_session(existing, flow.return_path, identity)
        if not self.settings.registration_enabled:
            return AuthError("registration_closed", 403)
        customer: Final = await self.store.create_customer(
            identity.email, None, identity.email_verified, identity, flow.provider, self.clock()
        )
        if isinstance(customer, AuthError):
            return customer
        if not customer.enabled:
            return AuthError("account_unavailable", 403)
        return await self.new_session(customer, flow.return_path, identity)

    async def unlink(self, session: Session, binding_id: str) -> AuthError | None:
        if not self.recently_authenticated(session):
            return AuthError("reauthentication_required", 403)
        removed: Final = await self.store.unlink_identity(
            session.customer.user_id,
            binding_id,
            tuple(provider.id for provider in self.settings.providers),
            self.clock(),
            session.token_hash,
        )
        return None if removed else AuthError("last_login_method_or_missing_binding", 409)
