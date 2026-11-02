from typing import Final

import pytest
from litellm.proxy.commerce.config import load_settings
from pydantic import ValidationError


def test_registration_defaults_use_only_explicit_model_names() -> None:
    settings: Final = load_settings(
        {
            "COCAAPI_AUTH_SECRET": "test-only-secret-" * 4,
            "COCAAPI_DEFAULT_MODELS": " public-one, public-two,public-one, ",
        }
    )
    assert settings is not None
    assert settings.default_models == ("public-one", "public-two")
    closed: Final = load_settings({"COCAAPI_AUTH_SECRET": "test-only-secret-" * 4})
    assert closed is not None and closed.default_models == ()


@pytest.mark.parametrize("model", ("all-proxy-models", "all-team-models", "no-default-models", "provider/*"))
def test_registration_defaults_reject_broad_or_sentinel_grants(model: str) -> None:
    with pytest.raises(ValidationError):
        load_settings({"COCAAPI_AUTH_SECRET": "test-only-secret-" * 4, "COCAAPI_DEFAULT_MODELS": model})
