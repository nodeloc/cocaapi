from typing import Final

from fastapi import HTTPException
from prisma.errors import PrismaError

from litellm.models.commerce_auth import AuthError, FrozenModel
from litellm.proxy._types import LiteLLM_UserTable
from litellm.repositories.commerce_billing_group_repository import BillingGroupRepository


async def registered_user_models(user_id: str) -> tuple[str, ...] | None:
    from litellm.proxy.commerce.billing_hook import configured_store

    store: Final = configured_store()
    if store is None:
        return None
    try:
        result: Final = await BillingGroupRepository(store.database).model_grants(user_id)
    except (PrismaError, OSError, ValueError, RuntimeError, TypeError, LookupError):
        raise HTTPException(503, detail="billing_groups_unavailable") from None
    if isinstance(result, AuthError):
        raise HTTPException(result.status, detail=result.code)
    return result


class UserBudget(FrozenModel):
    max_budget: float | None
    models: tuple[str, ...] = ()


async def projected_registered_user(user: LiteLLM_UserTable) -> LiteLLM_UserTable:
    grants: Final = await registered_user_models(user.user_id)
    if grants is None:
        return user
    previous: Final = UserBudget.model_validate(user, from_attributes=True)
    if previous.max_budget != 0 or previous.models != ("no-default-models",):
        return user.model_copy(update={"models": list(grants or ("no-default-models",))})
    from litellm.proxy.commerce.billing_hook import configured_store

    store: Final = configured_store()
    if store is None:
        raise HTTPException(503, detail="billing_groups_unavailable")
    rows: Final = await store.database.query_raw(
        'SELECT max_budget FROM "LiteLLM_UserTable" WHERE user_id=$1', user.user_id
    )
    if not rows:
        raise HTTPException(503, detail="billing_groups_unavailable")
    budget: Final = UserBudget.model_validate(rows[0])
    return user.model_copy(update={"models": list(grants or ("no-default-models",)), "max_budget": budget.max_budget})
