import os
import secrets
from pathlib import Path
from typing import Final


def main() -> None:
    destination: Final = Path(".env")
    if destination.exists():
        raise SystemExit("Existing .env retained. No credentials were changed")
    values: Final = {
        "POSTGRES_PASSWORD": secrets.token_hex(32),
        "REDIS_PASSWORD": secrets.token_hex(32),
        "LITELLM_MASTER_KEY": "sk-" + secrets.token_hex(32),
        "LITELLM_SALT_KEY": "sk-" + secrets.token_hex(32),
        "UI_USERNAME": "admin",
        "UI_PASSWORD": secrets.token_hex(24),
    }
    descriptor: Final = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write("".join(f"{key}={value}\n" for key, value in values.items()))
    print("Created .env with private credentials")


if __name__ == "__main__":
    main()
