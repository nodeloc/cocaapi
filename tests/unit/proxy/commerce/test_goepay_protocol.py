import base64
import json
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Final
from urllib.parse import parse_qs

import httpx
import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from litellm.models.commerce_auth import AuthError
from litellm.proxy.commerce.goepay_protocol import GoepayClient, GoepaySignature, canonical_fields

NOW: Final = datetime(2026, 1, 5, tzinfo=timezone.utc)
MERCHANT: Final = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PLATFORM: Final = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def signature() -> GoepaySignature:
    return GoepaySignature(MERCHANT, PLATFORM.public_key(), lambda: NOW)


def response(fields: Mapping[str, str]) -> dict[str, str]:
    values: Final = {"timestamp": str(int(NOW.timestamp())), "sign_type": "RSA", **fields}
    signed: Final = PLATFORM.sign(canonical_fields(values, response=True), padding.PKCS1v15(), hashes.SHA256())
    return {**values, "sign": base64.b64encode(signed).decode()}


def test_form_signature_preserves_raw_values_before_url_encoding() -> None:
    values: Final = signature().sign({"name": "充值 + & 额度", "money": "1.00", "empty": "", "space": " "}, "12")
    assert values["pid"] == "12" and values["sign_type"] == "RSA"
    assert (
        canonical_fields(values, response=False)
        == ("money=1.00&name=充值 + & 额度&pid=12&space= &timestamp=" + str(int(NOW.timestamp()))).encode()
    )
    MERCHANT.public_key().verify(
        base64.b64decode(values["sign"]), canonical_fields(values, response=False), padding.PKCS1v15(), hashes.SHA256()
    )


@pytest.mark.parametrize(
    "change", ({"money": "1.01"}, {"timestamp": "1"}, {"timestamp": "nan"}, {"sign_type": "MD5"}, {"sign": "bad"})
)
def test_verification_rejects_tampering_stale_time_and_wrong_signature(change: dict[str, str]) -> None:
    signed: Final = response({"code": "0", "money": "1.00"})
    assert signature().verify(signed)
    assert not signature().verify({**signed, **change})


def test_response_canonicalization_omits_only_documented_empty_scalar_values() -> None:
    assert (
        canonical_fields({"zero": "0", "blank": " \t\r\n\x00\x0b", "money": "1.00", "sign": "x"}, response=True)
        == b"money=1.00&zero=0"
    )


@pytest.mark.asyncio
async def test_client_verifies_real_signatures_and_sends_one_encoded_form_request() -> None:
    async def send(request: httpx.Request) -> httpx.Response:
        fields: Final = {
            key: values[0] for key, values in parse_qs(request.content.decode(), keep_blank_values=True).items()
        }
        assert request.url == "https://payments.example.test/api/pay/query"
        assert fields["out_trade_no"] == "order+&1"
        MERCHANT.public_key().verify(
            base64.b64decode(fields["sign"]),
            canonical_fields(fields, response=False),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return httpx.Response(200, json=response({"code": "0", "pid": "12", "money": "1.00"}))

    client: Final = GoepayClient("https://payments.example.test", "12", signature(), httpx.MockTransport(send))
    result: Final = await client.call("/api/pay/query", {"out_trade_no": "order+&1"})
    assert not isinstance(result, AuthError) and result["money"] == "1.00"


@pytest.mark.asyncio
@pytest.mark.parametrize("variant", ("tampered", "nested", "duplicate", "unsigned", "redirect", "error"))
async def test_client_rejects_unauthenticated_or_ambiguous_responses(variant: str) -> None:
    valid: Final = response({"code": "0", "money": "1.00"})
    raw: Final = {
        "tampered": json.dumps({**valid, "money": "9.00"}),
        "nested": json.dumps({**valid, "data": {"status": "paid"}}),
        "duplicate": json.dumps(valid)[:-1] + ',"money":"9.00"}',
        "unsigned": '{"code":0,"status":1}',
        "redirect": "",
        "error": json.dumps(response({"code": "-1", "msg": "do not expose raw upstream errors"})),
    }[variant]
    transport: Final = httpx.MockTransport(
        lambda request: httpx.Response(
            302 if variant == "redirect" else 200,
            text=raw,
            headers={"content-type": "application/json", "location": "https://elsewhere.example"},
        )
    )
    client: Final = GoepayClient("https://payments.example.test", "12", signature(), transport)
    result: Final = await client.call("/api/pay/query", {"out_trade_no": "order-1"})
    assert isinstance(result, AuthError) and result.code == "gateway_invalid_response"


def test_key_loader_accepts_real_pem_and_rejects_non_rsa_or_small_keys() -> None:
    private: Final = MERCHANT.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    public: Final = PLATFORM.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    assert isinstance(GoepaySignature.from_pem(private, public, lambda: NOW), GoepaySignature)
    assert isinstance(GoepaySignature.from_pem(b"invalid", public, lambda: NOW), AuthError)


@pytest.mark.asyncio
async def test_signed_channel_rejection_reports_unavailable_without_exposing_raw_provider_fields() -> None:
    transport: Final = httpx.MockTransport(
        lambda request: httpx.Response(200, json=response({"code": "-1", "msg": "payment channel not permitted"}))
    )
    client: Final = GoepayClient("https://payments.example.test", "12", signature(), transport)
    result: Final = await client.call("/api/pay/create", {"out_trade_no": "test-order"})
    assert isinstance(result, AuthError) and result.code == "gateway_channel_unavailable" and result.status == 503
