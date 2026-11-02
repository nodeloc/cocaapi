from itertools import chain
from typing import Annotated, Final, TypeAlias

from fastapi import APIRouter, Depends, Query

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_billing_groups import (
    BillingGroupAssignment,
    BillingGroupCatalog,
    BillingGroupMember,
    BillingGroupMembers,
    BillingGroupsUpdate,
    BillingGroupsView,
)
from litellm.proxy.commerce.account_routes import AccountErrorView, AccountRoute, Service, raise_public
from litellm.proxy.commerce.admin_wallet_routes import AdminDep
from litellm.proxy.commerce.auth_service import utcnow
from litellm.proxy.commerce.gateway_routes import GatewayDep
from litellm.repositories.commerce_auth_repository import AccountRepository
from litellm.repositories.commerce_billing_group_repository import BillingGroupRepository


def get_group_repository(accounts: Service) -> BillingGroupRepository:
    store: Final = accounts.store
    if not isinstance(store, AccountRepository):
        raise_public(AuthError("account_service_unavailable", 503))
    return BillingGroupRepository(store.database)


async def get_billing_catalog(gateway: GatewayDep) -> BillingGroupCatalog:
    models: Final = await gateway.native.models(("all-proxy-models",))
    if isinstance(models, AuthError):
        raise_public(models)
    return BillingGroupCatalog(models=tuple(sorted(set(models))))


GroupDep: TypeAlias = Annotated[BillingGroupRepository, Depends(get_group_repository)]
CatalogDep: TypeAlias = Annotated[BillingGroupCatalog, Depends(get_billing_catalog)]
router: Final = APIRouter(
    prefix="/commerce/admin/v1/billing-groups",
    tags=["Commerce management"],
    route_class=AccountRoute,
    responses={code: {"model": AccountErrorView} for code in (401, 403, 404, 409, 422, 503)},
)


@router.get("", response_model=BillingGroupsView)
async def configuration(admin: AdminDep, store: GroupDep) -> BillingGroupsView:
    result: Final = await store.read()
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@router.put("", response_model=BillingGroupsView)
async def save_configuration(
    body: BillingGroupsUpdate,
    admin: AdminDep,
    store: GroupDep,
    catalog: CatalogDep,
) -> BillingGroupsView:
    current: Final = await store.read()
    if isinstance(current, AuthError):
        raise_public(current)
    existing: Final = frozenset(chain.from_iterable(group.models for group in current.model_groups))
    wanted: Final = frozenset(chain.from_iterable(group.models for group in body.model_groups))
    if not wanted.issubset(existing.union(catalog.models)):
        raise_public(AuthError("billing_model_not_found", 422))
    result: Final = await store.save(body, admin.user_id, utcnow())
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@router.get("/catalog", response_model=BillingGroupCatalog)
async def catalog(admin: AdminDep, available: CatalogDep) -> BillingGroupCatalog:
    return available


@router.get("/members", response_model=BillingGroupMembers)
async def members(
    admin: AdminDep,
    store: GroupDep,
    search: Annotated[str, Query(max_length=254)] = "",
    group_id: Annotated[str | None, Query(max_length=64)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
) -> BillingGroupMembers:
    result: Final = await store.members(search.strip(), group_id, limit, offset)
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@router.post("/members/{user_id}", response_model=BillingGroupMember)
async def assign(user_id: str, body: BillingGroupAssignment, admin: AdminDep, store: GroupDep) -> BillingGroupMember:
    result: Final = await store.assign(user_id, body, admin.user_id, utcnow())
    if isinstance(result, AuthError):
        raise_public(result)
    return result
