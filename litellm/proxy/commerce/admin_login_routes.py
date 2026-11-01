from typing import Annotated, Final, TypeAlias

from fastapi import APIRouter, Depends

from litellm.models.commerce_auth import AuthError
from litellm.models.commerce_login_settings import LoginConfigurationInput, LoginConfigurationView
from litellm.proxy.commerce.account_routes import AccountRoute, raise_public
from litellm.proxy.commerce.admin_wallet_routes import AdminDep
from litellm.proxy.commerce.config import load_settings
from litellm.proxy.commerce.login_settings_service import LoginSettingsService
from litellm.repositories.commerce_login_settings_repository import LoginConfigurationRepository


def get_login_settings_service() -> LoginSettingsService:
    from litellm.proxy.proxy_server import prisma_client
    from litellm.repositories.commerce_auth_repository import AccountDatabase

    base: Final = load_settings()
    if base is None or prisma_client is None:
        raise_public(AuthError("account_service_unavailable", 503))
    db: Final[AccountDatabase] = prisma_client.writer_db  # pyright: ignore[reportAssignmentType]  # Native database proxy
    return LoginSettingsService(LoginConfigurationRepository(db), base)


SettingsDep: TypeAlias = Annotated[LoginSettingsService, Depends(get_login_settings_service)]
router: Final = APIRouter(prefix="/commerce/admin/v1", tags=["Login configuration"], route_class=AccountRoute)


@router.get("/login-settings", response_model=LoginConfigurationView)
async def read_settings(admin: AdminDep, settings: SettingsDep) -> LoginConfigurationView:
    result: Final = await settings.read()
    if isinstance(result, AuthError):
        raise_public(result)
    return result


@router.put("/login-settings", response_model=LoginConfigurationView)
async def save_settings(
    body: LoginConfigurationInput, admin: AdminDep, settings: SettingsDep
) -> LoginConfigurationView:
    result: Final = await settings.save(body, admin.user_id)
    if isinstance(result, AuthError):
        raise_public(result)
    return result
