import os
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Final
from urllib.parse import urlsplit

import httpx
import pytest_asyncio
from fastapi import FastAPI
from prisma import Prisma
from prisma.types import DatasourceOverride
from pydantic import SecretStr, TypeAdapter

from litellm.models.commerce_auth import AuthError, LoginResult, Session
from litellm.proxy.commerce.account_routes import get_service, router
from litellm.proxy.commerce.auth_service import AccountService
from litellm.proxy.commerce.config import AccountSettings
from litellm.repositories.commerce_auth_repository import AccountRepository
from litellm.proxy.commerce.wallet_routes import get_wallet_store
from litellm.repositories.commerce_wallet_repository import WalletRepository
from litellm.proxy.commerce.wallet_routes import get_redemption_service
from litellm.proxy.commerce.redemption_service import RedemptionService
from litellm.repositories.commerce_redemption_repository import RedemptionRepository
from litellm.proxy.commerce.security import AuthSecurity
from litellm.proxy.commerce.admin_wallet_routes import router as admin_router
from litellm.proxy.commerce.payment_routes import get_gateway, get_payment_service, admin_router as payment_admin_router, webhook_router
from litellm.proxy.commerce.payment_gateway import UnconfiguredGateway
from litellm.proxy.commerce.payment_service import PaymentService
from litellm.repositories.commerce_payment_repository import PaymentRepository
from litellm.proxy.commerce.admin_login_routes import get_login_settings_service, router as login_settings_router
from litellm.proxy.commerce.login_settings_service import LoginSettingsService
from litellm.repositories.commerce_login_settings_repository import LoginConfigurationRepository
from litellm.proxy.commerce.admin_billing_group_routes import router as billing_groups_router


@dataclass(frozen=True)
class WalletClient:
    http: httpx.AsyncClient
    database: Prisma
    accounts: AccountService
    session: Session
    other_session: Session
    app: FastAPI
    now: datetime


@pytest_asyncio.fixture
async def wallet_client() -> AsyncIterator[WalletClient]:
    url: Final = os.environ["COCAAPI_WALLET_TEST_DATABASE_URL"]
    if urlsplit(url).path != "/cocaapi_wallet_test":
        raise RuntimeError("Wallet tests require the isolated cocaapi_wallet_test database")
    database: Final = Prisma(datasource=DatasourceOverride(url=url))
    await database.connect()
    migrations: Final = Path(os.environ["COCAAPI_TEST_MIGRATIONS"])
    history: Final = await database.query_raw('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')
    applied: Final = frozenset(TypeAdapter(str).validate_python(row["migration_name"]) for row in history)
    for migration in sorted(migrations.glob("*commerce*/migration.sql")):
        if migration.parent.name in applied:
            continue
        for statement in migration.read_text().split(";"):
            if statement.strip():
                await database.execute_raw(statement)
    now: Final = datetime.now(timezone.utc)
    service: Final = AccountService(AccountRepository(database), AccountSettings(
        public_url="http://localhost:4400", registration_enabled=False, secret=SecretStr("wallet-test-secret-" * 8),
    ))
    customer: Final = await service.store.create_customer(f"wallet-{uuid.uuid4().hex}@example.com", None, True, None, None, now)
    other: Final = await service.store.create_customer(f"wallet-{uuid.uuid4().hex}@example.com", None, True, None, None, now)
    assert not isinstance(customer, AuthError) and not isinstance(other, AuthError)
    login: Final = await service.new_session(customer)
    other_login: Final = await service.new_session(other)
    assert isinstance(login, LoginResult) and isinstance(other_login, LoginResult)
    session: Final = await service.session(login.token)
    other_session: Final = await service.session(other_login.token)
    assert session is not None and other_session is not None
    app: Final = FastAPI()
    app.include_router(router)
    app.include_router(admin_router)
    app.include_router(payment_admin_router)
    app.include_router(webhook_router)
    app.include_router(login_settings_router)
    app.include_router(billing_groups_router)
    app.dependency_overrides[get_login_settings_service] = lambda: LoginSettingsService(LoginConfigurationRepository(database), service.settings)
    app.dependency_overrides[get_service] = lambda: service
    app.dependency_overrides[get_wallet_store] = lambda: WalletRepository(database)
    app.dependency_overrides[get_redemption_service] = lambda: RedemptionService(RedemptionRepository(database), AuthSecurity("test-only-redemption-key-" * 8))
    app.dependency_overrides[get_payment_service] = lambda: PaymentService(PaymentRepository(database), UnconfiguredGateway())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=service.settings.public_url,
                                  headers={"Origin": service.settings.public_url,
                                           "X-CSRF-Token": service.security.csrf(login.token)}) as client:
        client.cookies.set("coca_session", login.token)
        yield WalletClient(client, database, service, session, other_session, app, now)
    await database.disconnect()
