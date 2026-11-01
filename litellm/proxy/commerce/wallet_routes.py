from typing import Annotated, Final, TypeAlias

from fastapi import APIRouter, Depends, Query

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_wallet import LedgerEntry, LedgerPage, RedeemInput, WalletSnapshot, WalletStore
from litellm.proxy.commerce.account_routes import AccountRoute, CurrentSession, Service, guard, raise_public
from litellm.proxy.commerce.billing_config import redemption_security
from litellm.proxy.commerce.redemption_service import RedemptionService
from litellm.repositories.commerce_redemption_repository import RedemptionRepository
from litellm.repositories.commerce_wallet_repository import WalletRepository


def get_wallet_store(accounts: Service) -> WalletStore:
    from litellm.proxy.proxy_server import prisma_client
    from litellm.repositories.commerce_auth_repository import AccountDatabase

    if prisma_client is None:
        raise_public(AuthError("account_service_unavailable", 503))
    db: Final[AccountDatabase] = prisma_client.writer_db  # pyright: ignore[reportAssignmentType]  # __getattr__ proxy
    return WalletRepository(db)


WalletDep: TypeAlias = Annotated[WalletStore, Depends(get_wallet_store)]
router: Final = APIRouter(dependencies=[Depends(guard)], route_class=AccountRoute)


@router.get("/wallet", response_model=WalletSnapshot)
async def balance(session: CurrentSession, wallets: WalletDep) -> WalletSnapshot:
    result: Final = await wallets.balance(session.customer.user_id)
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@router.get("/wallet/transactions", response_model=LedgerPage)
async def transactions(
    session: CurrentSession,
    wallets: WalletDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
) -> LedgerPage:
    return await wallets.transactions(session.customer.user_id, limit, offset)


def get_redemption_service(accounts: Service) -> RedemptionService:
    from litellm.proxy.proxy_server import prisma_client
    from litellm.repositories.commerce_auth_repository import AccountDatabase

    security: Final = redemption_security()
    if security is None or prisma_client is None:
        raise_public(AuthError("redemption_unavailable", 503))
    db: Final[AccountDatabase] = prisma_client.writer_db  # pyright: ignore[reportAssignmentType]  # __getattr__ proxy
    return RedemptionService(RedemptionRepository(db), security)


RedemptionDep: TypeAlias = Annotated[RedemptionService, Depends(get_redemption_service)]


@router.post("/redemptions", response_model=LedgerEntry)
async def redeem(
    body: RedeemInput, session: CurrentSession, redemption: RedemptionDep, accounts: Service
) -> LedgerEntry:
    if not await accounts.rate_limit("redeem", session.customer.user_id, 8):
        raise_public(AuthError("too_many_attempts", 429))
    result: Final = await redemption.redeem(session, body.code)
    if isinstance(result, AuthError):
        raise_public(result)
    return result
