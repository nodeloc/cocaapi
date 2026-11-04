import argparse
import asyncio
from typing import Final

from prisma import Prisma
from pydantic import TypeAdapter

from litellm.models.commerce_auth import AuthError
from litellm.proxy.commerce.auth_service import utcnow
from litellm.proxy.commerce.config import load_settings
from litellm.proxy.commerce.login_settings_service import LoginSettingsService
from litellm.repositories.commerce_group_migration import activate_user_groups
from litellm.repositories.commerce_login_settings_repository import LoginConfigurationRepository


async def migrate(dry_run: bool) -> int:
    settings: Final = load_settings()
    if settings is None:
        print("Account settings are required")
        return 1
    database: Final = Prisma()
    await database.connect()
    try:
        effective: Final = await LoginSettingsService(LoginConfigurationRepository(database), settings).effective()
        if isinstance(effective, AuthError):
            print(effective.code)
            return 1
        report: Final = await activate_user_groups(
            database, effective.default_models, "user-group-migration", utcnow(), dry_run=dry_run
        )
        if isinstance(report, AuthError):
            print(report.code)
            return 1
        print(report.model_dump_json())
        return 0
    finally:
        await database.disconnect()


if __name__ == "__main__":
    parser: Final = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    options: Final = parser.parse_args()
    apply: Final = TypeAdapter(bool).validate_python(vars(options).get("apply"))
    raise SystemExit(asyncio.run(migrate(dry_run=not apply)))
