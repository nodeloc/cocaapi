import uuid
from collections.abc import Mapping, Sequence
from contextlib import AbstractAsyncContextManager
from datetime import datetime, timedelta
from typing import Final, Protocol

from pydantic import SecretStr, TypeAdapter
from typing_extensions import LiteralString

from litellm.models.commerce_auth import (
    ActionPurpose,
    AuthError,
    Binding,
    Customer,
    ExternalIdentity,
    MailJob,
    OAuthFlow,
    PendingAction,
    ProviderID,
    Session,
)


class AccountDatabase(Protocol):
    async def query_raw(self, query: LiteralString, *args: object) -> Sequence[Mapping[str, object]]: ...
    async def execute_raw(self, query: LiteralString, *args: object) -> int: ...
    def tx(self) -> AbstractAsyncContextManager["AccountDatabase"]: ...


_CUSTOMER_SELECT: Final = """SELECT c.user_id, c.email_normalized AS email, c.email_verified,
    c.enabled, c.password_hash FROM "CommerceCustomer" c
    JOIN "LiteLLM_UserTable" u ON u.user_id=c.user_id"""


def _customer(rows: Sequence[Mapping[str, object]]) -> Customer | None:
    return Customer.model_validate(rows[0]) if rows else None


class AccountRepository:
    def __init__(self, database: AccountDatabase, default_models: tuple[str, ...] = ()) -> None:
        self.database = database
        self.default_models = default_models

    async def find_customer(self, email: str) -> Customer | None:
        return _customer(await self.database.query_raw(_CUSTOMER_SELECT + " WHERE c.email_normalized=$1", email))

    async def get_customer(self, user_id: str) -> Customer | None:
        return _customer(await self.database.query_raw(_CUSTOMER_SELECT + " WHERE c.user_id=$1", user_id))

    async def create_customer(
        self,
        email: str | None,
        password_hash: str | None,
        verified: bool,
        identity: ExternalIdentity | None,
        provider: ProviderID | None,
        now: datetime,
        action: PendingAction | None = None,
    ) -> Customer | AuthError:
        async with self.database.tx() as tx:
            if identity is not None:
                await tx.query_raw(
                    "SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text",
                    identity.issuer + "\n" + identity.subject,
                )
                existing: Final = await AccountRepository(tx).find_external(identity)
                if existing is not None:
                    return existing
            if email is not None:
                await tx.query_raw("SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text", "email:" + email)
                taken: Final = await tx.query_raw(
                    'SELECT user_id FROM "LiteLLM_UserTable" WHERE lower(user_email)=$1 LIMIT 1', email
                )
                if taken:
                    return AuthError("email_in_use", 409)
            user_id: Final = "commerce-" + uuid.uuid4().hex
            await tx.execute_raw(
                """INSERT INTO "LiteLLM_UserTable"
                (user_id,user_email,user_role,models,max_budget,metadata)
                VALUES ($1,$2,'internal_user',$3::text[],$4,'{"commerce":true}'::jsonb)""",
                user_id,
                email,
                list(self.default_models or ("no-default-models",)),
                None if self.default_models else 0,
            )
            await tx.execute_raw(
                """INSERT INTO "CommerceCustomer"
                (user_id,email_normalized,email_verified,enabled,created_at,password_hash) VALUES ($1,$2,$3,true,$4::timestamptz,$5)""",
                user_id,
                email,
                verified,
                now,
                password_hash,
            )
            if identity is not None and provider is not None:
                await tx.execute_raw(
                    """INSERT INTO "CommerceExternalIdentity"
                    (id,user_id,provider,issuer,subject,name,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz)""",
                    uuid.uuid4().hex,
                    user_id,
                    provider,
                    identity.issuer,
                    identity.subject,
                    identity.name,
                    now,
                )
            if action is not None:
                await _insert_action(tx, user_id, action, now)
            return Customer(
                user_id=user_id,
                email=email,
                email_verified=verified,
                enabled=True,
                password_hash=SecretStr(password_hash) if password_hash else None,
            )

    async def save_session(
        self,
        customer: Customer,
        token_hash: str,
        expires_at: datetime,
        auth_at: datetime,
        identity: ExternalIdentity | None = None,
    ) -> bool:
        async with self.database.tx() as tx:
            await tx.query_raw('SELECT user_id FROM "CommerceCustomer" WHERE user_id=$1 FOR UPDATE', customer.user_id)
            current: Final = await AccountRepository(tx).get_customer(customer.user_id)
            if (
                current is None
                or not current.enabled
                or current.password_hash != customer.password_hash
                or current.email != customer.email
            ):
                return False
            if identity is not None:
                owner: Final = await AccountRepository(tx).find_external(identity)
                if owner is None or owner.user_id != customer.user_id:
                    return False
            await tx.execute_raw(
                """INSERT INTO "CommerceSession" (token_hash,user_id,expires_at,auth_at)
                VALUES ($1,$2,$3::timestamptz,$4::timestamptz)""",
                token_hash,
                customer.user_id,
                expires_at,
                auth_at,
            )
            return True

    async def get_session(self, token_hash: str, now: datetime) -> Session | None:
        rows: Final = await self.database.query_raw(
            """SELECT c.user_id,c.email_normalized AS email,
            c.email_verified,c.enabled,c.password_hash,s.expires_at,s.auth_at
            FROM "CommerceSession" s JOIN "CommerceCustomer" c ON c.user_id=s.user_id
            JOIN "LiteLLM_UserTable" u ON u.user_id=c.user_id
            WHERE s.token_hash=$1 AND s.expires_at>$2::timestamptz AND c.enabled=true""",
            token_hash,
            now,
        )
        if not rows:
            return None
        return Session.model_validate(
            {
                "customer": {key: value for key, value in rows[0].items() if key not in {"expires_at", "auth_at"}},
                "token_hash": token_hash,
                "expires_at": rows[0]["expires_at"],
                "auth_at": rows[0]["auth_at"],
            }
        )

    async def revoke_session(self, token_hash: str) -> None:
        await self.database.execute_raw('DELETE FROM "CommerceSession" WHERE token_hash=$1', token_hash)

    async def refresh_auth(self, token_hash: str, now: datetime) -> None:
        await self.database.execute_raw(
            'UPDATE "CommerceSession" SET auth_at=$2::timestamptz WHERE token_hash=$1', token_hash, now
        )

    async def queue_action(
        self,
        user_id: str,
        purpose: ActionPurpose,
        token_hash: str,
        email: str,
        payload: str,
        now: datetime,
        expires_at: datetime,
    ) -> None:
        async with self.database.tx() as tx:
            await tx.query_raw('SELECT user_id FROM "CommerceCustomer" WHERE user_id=$1 FOR UPDATE', user_id)
            await tx.execute_raw(
                """UPDATE "CommerceActionToken" SET used_at=$3::timestamptz
                WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL""",
                user_id,
                purpose,
                now,
            )
            await _insert_action(
                tx,
                user_id,
                PendingAction(
                    purpose=purpose, token_hash=token_hash, email=email, payload=payload, expires_at=expires_at
                ),
                now,
            )

    async def consume_action(
        self, token_hash: str, purpose: ActionPurpose, now: datetime, password_hash: str | None = None
    ) -> bool:
        if purpose == "reset" and password_hash is None:
            return False
        async with self.database.tx() as tx:
            await tx.query_raw(
                """SELECT c.user_id FROM "CommerceCustomer" c JOIN "CommerceActionToken" t
                ON t.user_id=c.user_id WHERE t.token_hash=$1 AND t.purpose=$2 FOR UPDATE OF c""",
                token_hash,
                purpose,
            )
            rows: Final = await tx.query_raw(
                """UPDATE "CommerceActionToken" t SET used_at=$3::timestamptz
                FROM "CommerceCustomer" c WHERE t.token_hash=$1 AND t.purpose=$2
                AND t.used_at IS NULL AND t.expires_at>$3::timestamptz AND c.user_id=t.user_id
                AND c.email_normalized=t.email AND c.enabled=true RETURNING t.user_id""",
                token_hash,
                purpose,
                now,
            )
            if not rows:
                return False
            user_id: Final = TypeAdapter(str).validate_python(rows[0]["user_id"])
            if purpose == "verify":
                await tx.execute_raw('UPDATE "CommerceCustomer" SET email_verified=true WHERE user_id=$1', user_id)
            elif password_hash is not None:
                await tx.execute_raw(
                    'UPDATE "CommerceCustomer" SET password_hash=$2,email_verified=true WHERE user_id=$1',
                    user_id,
                    password_hash,
                )
                await tx.execute_raw('DELETE FROM "CommerceSession" WHERE user_id=$1', user_id)
            return True

    async def set_email(self, session: Session, email: str, now: datetime) -> Customer | AuthError:
        user_id: Final = session.customer.user_id
        async with self.database.tx() as tx:
            await tx.query_raw("SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text", "email:" + email)
            rows: Final = await tx.query_raw(
                'SELECT email_verified FROM "CommerceCustomer" WHERE user_id=$1 FOR UPDATE', user_id
            )
            if not await _fresh_session(tx, user_id, session.token_hash, now, require_verified=False):
                return AuthError("reauthentication_required", 403)
            if not rows or rows[0]["email_verified"]:
                return AuthError("email_change_not_allowed", 409)
            taken: Final = await tx.query_raw(
                'SELECT user_id FROM "LiteLLM_UserTable" WHERE lower(user_email)=$1 AND user_id<>$2', email, user_id
            )
            if taken:
                return AuthError("email_in_use", 409)
            await tx.execute_raw(
                'UPDATE "CommerceCustomer" SET email_normalized=$2,email_verified=false WHERE user_id=$1',
                user_id,
                email,
            )
            await tx.execute_raw('UPDATE "LiteLLM_UserTable" SET user_email=$2 WHERE user_id=$1', user_id, email)
            customer: Final = await AccountRepository(tx).get_customer(user_id)
            return customer if customer is not None else AuthError("account_unavailable", 401)

    async def set_password(self, session: Session, password_hash: str, now: datetime) -> bool:
        user_id: Final = session.customer.user_id
        async with self.database.tx() as tx:
            await tx.query_raw('SELECT user_id FROM "CommerceCustomer" WHERE user_id=$1 FOR UPDATE', user_id)
            if not await _fresh_session(tx, user_id, session.token_hash, now):
                return False
            current: Final = await AccountRepository(tx).get_customer(user_id)
            if current is None or current.password_hash != session.customer.password_hash:
                return False
            await tx.execute_raw(
                'UPDATE "CommerceCustomer" SET password_hash=$2 WHERE user_id=$1', user_id, password_hash
            )
            await tx.execute_raw('DELETE FROM "CommerceSession" WHERE user_id=$1', user_id)
            return True

    async def allow_attempt(self, key: str, bucket: datetime, limit: int) -> bool:
        rows: Final = await self.database.query_raw(
            """INSERT INTO "CommerceAuthRateLimit" (key,bucket,attempts)
            VALUES ($1,$2::timestamptz,1) ON CONFLICT (key,bucket) DO UPDATE
            SET attempts="CommerceAuthRateLimit".attempts+1 RETURNING attempts""",
            key,
            bucket,
        )
        return TypeAdapter(int).validate_python(rows[0]["attempts"]) <= limit

    async def save_flow(self, flow: OAuthFlow) -> None:
        await self.database.execute_raw(
            """INSERT INTO "CommerceOAuthFlow"
            (state_hash,browser_hash,provider,intent,nonce,verifier,return_path,expires_at,user_id,session_hash)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10)""",
            flow.state_hash,
            flow.browser_hash,
            flow.provider,
            flow.intent,
            flow.nonce,
            flow.verifier,
            flow.return_path,
            flow.expires_at,
            flow.user_id,
            flow.session_hash,
        )

    async def consume_flow(
        self, state_hash: str, browser_hash: str, provider: ProviderID, now: datetime
    ) -> OAuthFlow | None:
        rows: Final = await self.database.query_raw(
            """DELETE FROM "CommerceOAuthFlow"
            WHERE state_hash=$1 AND browser_hash=$2 AND provider=$3 AND expires_at>$4::timestamptz RETURNING *""",
            state_hash,
            browser_hash,
            provider,
            now,
        )
        return OAuthFlow.model_validate(rows[0]) if rows else None

    async def find_external(self, identity: ExternalIdentity) -> Customer | None:
        return _customer(
            await self.database.query_raw(
                _CUSTOMER_SELECT
                + """ JOIN "CommerceExternalIdentity" e
            ON e.user_id=c.user_id WHERE e.issuer=$1 AND e.subject=$2""",
                identity.issuer,
                identity.subject,
            )
        )

    async def bindings(self, user_id: str) -> tuple[Binding, ...]:
        rows: Final = await self.database.query_raw(
            'SELECT id,provider,name FROM "CommerceExternalIdentity" WHERE user_id=$1 ORDER BY created_at', user_id
        )
        return tuple(Binding.model_validate(row) for row in rows)

    async def link_identity(
        self, user_id: str, provider: ProviderID, identity: ExternalIdentity, now: datetime, session_hash: str
    ) -> bool:
        async with self.database.tx() as tx:
            await tx.query_raw('SELECT user_id FROM "CommerceCustomer" WHERE user_id=$1 FOR UPDATE', user_id)
            if not await _fresh_session(tx, user_id, session_hash, now):
                return False
            rows: Final = await tx.query_raw(
                """INSERT INTO "CommerceExternalIdentity"
                (id,user_id,provider,issuer,subject,name,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz)
                ON CONFLICT DO NOTHING RETURNING id""",
                uuid.uuid4().hex,
                user_id,
                provider,
                identity.issuer,
                identity.subject,
                identity.name,
                now,
            )
            return bool(rows)

    async def unlink_identity(
        self, user_id: str, binding_id: str, enabled_providers: tuple[str, ...], now: datetime, session_hash: str
    ) -> bool:
        async with self.database.tx() as tx:
            await tx.query_raw('SELECT user_id FROM "CommerceCustomer" WHERE user_id=$1 FOR UPDATE', user_id)
            if not await _fresh_session(tx, user_id, session_hash, now):
                return False
            customer: Final = await AccountRepository(tx).get_customer(user_id)
            bindings: Final = await AccountRepository(tx).bindings(user_id)
            has_password: Final = (
                customer is not None and customer.email_verified and customer.password_hash is not None
            )
            remaining: Final = tuple(
                binding for binding in bindings if binding.id != binding_id and binding.provider in enabled_providers
            )
            if not has_password and not remaining:
                return False
            changed: Final = await tx.execute_raw(
                'DELETE FROM "CommerceExternalIdentity" WHERE id=$1 AND user_id=$2', binding_id, user_id
            )
            return changed == 1


async def _fresh_session(
    tx: AccountDatabase, user_id: str, session_hash: str, now: datetime, require_verified: bool = True
) -> bool:
    rows: Final = await tx.query_raw(
        """SELECT s.token_hash FROM "CommerceSession" s
        JOIN "CommerceCustomer" c ON c.user_id=s.user_id WHERE s.user_id=$1 AND s.token_hash=$2
        AND s.expires_at>$3::timestamptz AND s.auth_at>=$4::timestamptz AND c.enabled=true
        AND ($5::boolean=false OR c.email_verified=true) FOR UPDATE OF s""",
        user_id,
        session_hash,
        now,
        now - timedelta(minutes=5),
        require_verified,
    )
    return bool(rows)


async def _insert_action(tx: AccountDatabase, user_id: str, action: PendingAction, now: datetime) -> None:
    await tx.execute_raw(
        """INSERT INTO "CommerceActionToken"
        (token_hash,user_id,purpose,email,expires_at) VALUES ($1,$2,$3,$4,$5::timestamptz)""",
        action.token_hash,
        user_id,
        action.purpose,
        action.email,
        action.expires_at,
    )
    await tx.execute_raw(
        """INSERT INTO "CommerceMailOutbox"
        (id,user_id,payload,created_at,next_attempt_at) VALUES ($1,$2,$3,$4::timestamptz,$4::timestamptz)""",
        uuid.uuid4().hex,
        user_id,
        action.payload,
        now,
    )


class MailRepository:
    def __init__(self, database: AccountDatabase) -> None:
        self.database = database

    async def claim(self, now: datetime) -> MailJob | None:
        rows: Final = await self.database.query_raw(
            """UPDATE "CommerceMailOutbox" SET
            claimed_until=$2::timestamptz,attempts=attempts+1 WHERE id=(SELECT id FROM "CommerceMailOutbox"
            WHERE delivered_at IS NULL AND attempts<8 AND next_attempt_at<=$1::timestamptz
            AND (claimed_until IS NULL OR claimed_until<$1::timestamptz)
            ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,payload,attempts""",
            now,
            now + timedelta(minutes=2),
        )
        return MailJob.model_validate(rows[0]) if rows else None

    async def valid(self, token_hash: str, purpose: ActionPurpose, email: str, now: datetime) -> bool:
        rows: Final = await self.database.query_raw(
            """SELECT t.token_hash FROM "CommerceActionToken" t
            JOIN "CommerceCustomer" c ON c.user_id=t.user_id WHERE t.token_hash=$1 AND t.purpose=$2
            AND t.email=$3 AND c.email_normalized=t.email AND c.enabled=true
            AND t.used_at IS NULL AND t.expires_at>$4::timestamptz""",
            token_hash,
            purpose,
            email,
            now,
        )
        return bool(rows)

    async def finish(self, job: MailJob, now: datetime, success: bool) -> None:
        if success:
            await self.database.execute_raw('DELETE FROM "CommerceMailOutbox" WHERE id=$1', job.id)
            return
        await self.database.execute_raw(
            """UPDATE "CommerceMailOutbox" SET claimed_until=NULL,
            next_attempt_at=$2::timestamptz,payload=CASE WHEN attempts>=8 THEN '' ELSE payload END WHERE id=$1""",
            job.id,
            now + timedelta(seconds=min(3600, 30 * 2**job.attempts)),
        )

    async def cleanup(self, now: datetime) -> None:
        await self.database.execute_raw('DELETE FROM "CommerceSession" WHERE expires_at<$1::timestamptz', now)
        await self.database.execute_raw('DELETE FROM "CommerceOAuthFlow" WHERE expires_at<$1::timestamptz', now)
        await self.database.execute_raw('DELETE FROM "CommerceActionToken" WHERE expires_at<$1::timestamptz', now)
        await self.database.execute_raw(
            'DELETE FROM "CommerceAuthRateLimit" WHERE bucket<$1::timestamptz', now - timedelta(days=1)
        )
        await self.database.execute_raw(
            'DELETE FROM "CommerceMailOutbox" WHERE created_at<$1::timestamptz', now - timedelta(days=2)
        )
