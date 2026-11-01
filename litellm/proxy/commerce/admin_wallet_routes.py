from typing import Annotated, Final, TypeAlias
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request

from litellm.models.commerce_auth import AuthError, FrozenModel
from litellm.models.commerce_wallet import (
    AdjustmentInput,
    BatchInput,
    BatchPage,
    DisableBatchInput,
    GeneratedBatch,
    LedgerEntry,
    LedgerPage,
    RedeemBatch,
    WalletChange,
    WalletPage,
)
from litellm.proxy._types import LitellmUserRoles, UserAPIKeyAuth
from litellm.proxy.auth.user_api_key_auth import (  # pyright: ignore[reportMissingTypeStubs]  # Untyped native namespace
    user_api_key_auth,
)
from litellm.proxy.commerce.account_routes import AccountErrorView, AccountRoute, raise_public
from litellm.proxy.commerce.auth_service import utcnow
from litellm.proxy.commerce.wallet_routes import RedemptionDep, WalletDep
from litellm.proxy.commerce.wallet_service import parse_usd


class AdminActor(FrozenModel):
    user_id: str


def require_bearer(request: Request) -> None:
    if not request.headers.get("authorization", "").startswith("Bearer "):
        raise_public(AuthError("authentication_required", 401))


async def require_admin(
    bearer: Annotated[None, Depends(require_bearer)],
    native: Annotated[UserAPIKeyAuth, Depends(user_api_key_auth)],
) -> AdminActor:
    if native.user_role != LitellmUserRoles.PROXY_ADMIN:
        raise_public(AuthError("administrator_required", 403))
    return AdminActor(user_id=native.user_id or "proxy-admin")


AdminDep: TypeAlias = Annotated[AdminActor, Depends(require_admin)]
RequestKey: TypeAlias = Annotated[UUID, Header(alias="Idempotency-Key")]
error_codes: Final[tuple[int | str, ...]] = (400, 401, 403, 404, 409, 422, 429, 503)
router: Final = APIRouter(
    prefix="/commerce/admin/v1",
    tags=["Commerce management"],
    route_class=AccountRoute,
    responses={code: {"model": AccountErrorView} for code in error_codes},
)


@router.get("/wallets", response_model=WalletPage)
async def wallets(
    admin: AdminDep,
    store: WalletDep,
    search: Annotated[str, Query(max_length=254)] = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
) -> WalletPage:
    return await store.wallets(search.strip(), limit, offset)


@router.get("/wallets/{user_id}/transactions", response_model=LedgerPage)
async def transactions(
    user_id: str,
    admin: AdminDep,
    store: WalletDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
) -> LedgerPage:
    return await store.transactions(user_id, limit, offset)


@router.post("/wallets/{user_id}/adjustments", response_model=LedgerEntry)
async def adjust(
    user_id: str, body: AdjustmentInput, request_key: RequestKey, admin: AdminDep, store: WalletDep
) -> LedgerEntry:
    amount: Final = parse_usd(body.amount_usd)
    if isinstance(amount, AuthError):
        raise_public(amount)
    if not body.reason.strip():
        raise_public(AuthError("reason_required", 422))
    key: Final = str(request_key)
    result: Final = await store.adjust(
        WalletChange(
            user_id=user_id,
            delta_units=amount if body.direction == "credit" else -amount,
            kind="adjustment",
            business_key=f"adjustment:{admin.user_id}:{user_id}:{key}",
            reference=key,
            actor_id=admin.user_id,
            reason=body.reason.strip(),
            now=utcnow(),
        )
    )
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@router.get("/redeem-batches", response_model=BatchPage)
async def batches(
    admin: AdminDep,
    redemption: RedemptionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
) -> BatchPage:
    return await redemption.store.batches(limit, offset)


@router.post("/redeem-batches", response_model=GeneratedBatch, status_code=201)
async def generate(
    body: BatchInput, request_key: RequestKey, admin: AdminDep, redemption: RedemptionDep
) -> GeneratedBatch:
    result: Final = await redemption.generate(body, admin.user_id, str(request_key))
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@router.post("/redeem-batches/{batch_id}/disable", response_model=RedeemBatch)
async def disable(batch_id: str, body: DisableBatchInput, admin: AdminDep, redemption: RedemptionDep) -> RedeemBatch:
    if not body.reason.strip():
        raise_public(AuthError("reason_required", 422))
    result: Final = await redemption.store.disable_batch(batch_id, admin.user_id, body.reason.strip(), utcnow())
    if isinstance(result, AuthError):
        raise_public(result)
    return result
