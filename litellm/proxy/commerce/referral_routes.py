from typing import Annotated, Final, TypeAlias

from fastapi import APIRouter, Depends, Query

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_referrals import (
    ReferralCodeView,
    ReferralOverview,
    ReferralPage,
    ReferralSettingsInput,
    ReferralSettingsView,
)
from litellm.proxy.commerce.account_routes import AccountRoute, CurrentSession, Service, guard, raise_public
from litellm.proxy.commerce.admin_wallet_routes import AdminDep
from litellm.proxy.commerce.auth_service import utcnow
from litellm.proxy.commerce.payment_routes import PaymentDatabaseDep
from litellm.repositories.commerce_referral_repository import ReferralRepository
from litellm.repositories.commerce_referral_settings_repository import ReferralSettingsRepository


def get_referral_repository(database: PaymentDatabaseDep) -> ReferralRepository:
    return ReferralRepository(database)


def get_referral_settings(database: PaymentDatabaseDep) -> ReferralSettingsRepository:
    return ReferralSettingsRepository(database)


RepositoryDep: TypeAlias = Annotated[ReferralRepository, Depends(get_referral_repository)]
SettingsDep: TypeAlias = Annotated[ReferralSettingsRepository, Depends(get_referral_settings)]
router: Final = APIRouter(prefix="/account/api/v1", dependencies=[Depends(guard)], route_class=AccountRoute)
admin_router: Final = APIRouter(prefix="/commerce/admin/v1", route_class=AccountRoute)


@router.get("/referrals", response_model=ReferralOverview)
async def overview(
    session: CurrentSession,
    repository: RepositoryDep,
    accounts: Service,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
) -> ReferralOverview:
    result: Final = await repository.overview(session.customer.user_id, accounts.settings.public_url, limit, offset)
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@router.post("/referrals/code", response_model=ReferralCodeView)
async def issue_code(session: CurrentSession, repository: RepositoryDep, accounts: Service) -> ReferralCodeView:
    if not await accounts.rate_limit("referral-code", session.customer.user_id, 10):
        raise_public(AuthError("too_many_attempts", 429))
    result: Final = await repository.issue_code(session, utcnow())
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@admin_router.get("/referral-settings", response_model=ReferralSettingsView)
async def settings(admin: AdminDep, repository: SettingsDep) -> ReferralSettingsView:
    result: Final = await repository.read()
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@admin_router.put("/referral-settings", response_model=ReferralSettingsView)
async def save_settings(body: ReferralSettingsInput, admin: AdminDep, repository: SettingsDep) -> ReferralSettingsView:
    result: Final = await repository.save(body, admin.user_id, utcnow())
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@admin_router.get("/referrals", response_model=ReferralPage)
async def records(
    admin: AdminDep,
    repository: RepositoryDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
) -> ReferralPage:
    return await repository.records(None, limit, offset)
