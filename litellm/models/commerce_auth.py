from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Literal, Protocol, TypeAlias

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator

ProviderID: TypeAlias = Literal["github", "google", "nodeloc"]
ActionPurpose: TypeAlias = Literal["verify", "reset"]
ReferralCode: TypeAlias = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{16,64}$")]


class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Customer(FrozenModel):
    user_id: str
    email: str | None
    email_verified: bool
    enabled: bool
    password_hash: SecretStr | None = None


class Session(FrozenModel):
    customer: Customer
    token_hash: str
    expires_at: datetime
    auth_at: datetime


class ExternalIdentity(FrozenModel):
    issuer: str
    subject: str
    email: str | None = None
    email_verified: bool = False
    name: str = ""


class Binding(FrozenModel):
    id: str
    provider: ProviderID
    name: str


class OAuthFlow(FrozenModel):
    state_hash: str
    browser_hash: str
    provider: ProviderID
    intent: Literal["login", "link", "reauth"]
    nonce: str
    verifier: str
    return_path: str
    expires_at: datetime
    user_id: str | None = None
    session_hash: str | None = None
    referral_code: ReferralCode | None = None


class MailPayload(FrozenModel):
    purpose: ActionPurpose
    email: str
    token: str


class MailJob(FrozenModel):
    id: str
    payload: str
    attempts: int


class PendingAction(FrozenModel):
    purpose: ActionPurpose
    token_hash: str
    email: str
    payload: str
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class AuthError:
    code: str
    status: int = 400


@dataclass(frozen=True, slots=True)
class LoginResult:
    customer: Customer
    token: str
    return_path: str = "/account/profile/"


class EmailInput(FrozenModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value


class Credentials(EmailInput):
    password: SecretStr = Field(min_length=1, max_length=256)


class Registration(Credentials):
    password: SecretStr = Field(min_length=12, max_length=256)
    referral_code: ReferralCode | None = None


class TokenInput(FrozenModel):
    token: str = Field(min_length=20, max_length=256)


class ResetInput(TokenInput):
    password: SecretStr = Field(min_length=12, max_length=256)


class PasswordInput(FrozenModel):
    password: SecretStr = Field(min_length=12, max_length=256)
    current_password: SecretStr | None = None


class OAuthStart(FrozenModel):
    return_path: str = "/account/profile/"
    intent: Literal["login", "reauth"] = "login"
    referral_code: ReferralCode | None = None


class AccountStore(Protocol):
    async def find_customer(self, email: str) -> Customer | None: ...
    async def get_customer(self, user_id: str) -> Customer | None: ...
    async def create_customer(
        self,
        email: str | None,
        password_hash: str | None,
        verified: bool,
        identity: ExternalIdentity | None,
        provider: ProviderID | None,
        now: datetime,
        action: PendingAction | None = None,
        *,
        referral_code: str | None = None,
    ) -> Customer | AuthError: ...
    async def save_session(
        self,
        customer: Customer,
        token_hash: str,
        expires_at: datetime,
        auth_at: datetime,
        identity: ExternalIdentity | None = None,
    ) -> bool: ...
    async def get_session(self, token_hash: str, now: datetime) -> Session | None: ...
    async def revoke_session(self, token_hash: str) -> None: ...
    async def refresh_auth(self, token_hash: str, now: datetime) -> None: ...
    async def queue_action(
        self,
        user_id: str,
        purpose: ActionPurpose,
        token_hash: str,
        email: str,
        payload: str,
        now: datetime,
        expires_at: datetime,
    ) -> None: ...
    async def consume_action(
        self, token_hash: str, purpose: ActionPurpose, now: datetime, password_hash: str | None = None
    ) -> bool: ...
    async def set_email(self, session: Session, email: str, now: datetime) -> Customer | AuthError: ...
    async def set_password(self, session: Session, password_hash: str, now: datetime) -> bool: ...
    async def allow_attempt(self, key: str, bucket: datetime, limit: int) -> bool: ...
    async def save_flow(self, flow: OAuthFlow) -> None: ...
    async def consume_flow(
        self, state_hash: str, browser_hash: str, provider: ProviderID, now: datetime
    ) -> OAuthFlow | None: ...
    async def find_external(self, identity: ExternalIdentity) -> Customer | None: ...
    async def bindings(self, user_id: str) -> tuple[Binding, ...]: ...
    async def link_identity(
        self, user_id: str, provider: ProviderID, identity: ExternalIdentity, now: datetime, session_hash: str
    ) -> bool: ...
    async def unlink_identity(
        self, user_id: str, binding_id: str, enabled_providers: tuple[str, ...], now: datetime, session_hash: str
    ) -> bool: ...
