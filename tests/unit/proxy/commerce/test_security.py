import pytest

from litellm.proxy.commerce.security import AuthSecurity, safe_return_path


def test_tokens_cannot_be_used_for_a_different_purpose() -> None:
    security = AuthSecurity("a" * 64)
    assert security.digest("token", "session") != security.digest("token", "verification")
    assert security.digest("different", "session") != security.digest("token", "session")


def test_authorization_secrets_are_authenticated_and_encrypted() -> None:
    security = AuthSecurity("a" * 64)
    encrypted = security.seal("private-verifier")
    assert "private-verifier" not in encrypted
    assert security.unseal(encrypted) == "private-verifier"
    assert AuthSecurity("b" * 64).unseal(encrypted) is None
    assert security.unseal(encrypted[:-8] + "tampered") is None


@pytest.mark.parametrize(
    "path",
    [
        "https://evil.test/",
        "//evil.test/",
        "/\\evil.test",
        "/account/../ui/",
        "/console/?token=secret",
        "javascript:alert(1)",
    ],
)
def test_return_paths_do_not_redirect_to_external_or_privileged_pages(path: str) -> None:
    assert safe_return_path(path) == "/account/profile/"


def test_profile_return_path_is_preserved() -> None:
    assert safe_return_path("/account/security/") == "/account/security/"
