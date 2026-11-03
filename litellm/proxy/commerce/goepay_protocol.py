import base64
import binascii
import io
import json
from collections.abc import Callable, Mapping, Sequence
from datetime import datetime
from types import MappingProxyType
from typing import Final

import httpx
from cryptography.exceptions import InvalidSignature, UnsupportedAlgorithm
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from pydantic import StrictStr, TypeAdapter, ValidationError

from litellm.models.commerce_auth import AuthError
from litellm.proxy.commerce.auth_service import utcnow

_SCALARS: Final = TypeAdapter(Mapping[str, StrictStr | bool | None])
_SIGN_FIELDS: Final = frozenset(("sign", "sign_type"))
_RESERVED: Final = _SIGN_FIELDS | frozenset(("pid", "timestamp"))
_BLANK: Final = " \t\r\n\x00\x0b"


def canonical_fields(fields: Mapping[str, str], *, response: bool) -> bytes:
    return "&".join(
        key + "=" + value
        for key, value in sorted(fields.items())
        if key not in _SIGN_FIELDS and (bool(value.strip(_BLANK)) if response else value != "")
    ).encode("utf-8")


def unique_object(pairs: Sequence[tuple[str, object]]) -> Mapping[str, object] | None:
    return MappingProxyType(dict(pairs)) if len(frozenset(key for key, _ in pairs)) == len(pairs) else None


def decoded_object(decoder: Callable[[str], object], body: bytes) -> object:
    return decoder(body.decode("utf-8"))


def response_fields(body: bytes) -> Mapping[str, str] | AuthError:
    try:
        decoder: Final[Callable[[str], object]] = json.JSONDecoder(
            parse_int=str, parse_float=str, object_pairs_hook=unique_object
        ).decode
        raw: Final = decoded_object(decoder, body)
        values: Final = _SCALARS.validate_python(raw)
        return MappingProxyType(
            {
                key: ("1" if value is True else "" if value is None or value is False else value)
                for key, value in values.items()
            }
        )
    except (ValueError, TypeError, ValidationError):
        return AuthError("gateway_invalid_response", 502)


class GoepaySignature:
    def __init__(
        self, private: rsa.RSAPrivateKey, public: rsa.RSAPublicKey, clock: Callable[[], datetime] = utcnow
    ) -> None:
        self.private = private
        self.public = public
        self.clock = clock

    @classmethod
    def from_pem(
        cls, private: bytes, public: bytes, clock: Callable[[], datetime] = utcnow
    ) -> "GoepaySignature | AuthError":
        try:
            merchant: Final = serialization.load_pem_private_key(private, password=None)
            platform: Final = serialization.load_pem_public_key(public)
        except (ValueError, TypeError, UnsupportedAlgorithm):
            return AuthError("payment_unavailable", 503)
        if not isinstance(merchant, rsa.RSAPrivateKey) or not isinstance(platform, rsa.RSAPublicKey):
            return AuthError("payment_unavailable", 503)
        if merchant.key_size < 2048 or platform.key_size < 2048:
            return AuthError("payment_unavailable", 503)
        return cls(merchant, platform, clock)

    def sign(self, fields: Mapping[str, str], merchant_id: str) -> Mapping[str, str]:
        values: Final = {key: value for key, value in fields.items() if key not in _RESERVED}
        payload: Final = {
            **values,
            "pid": merchant_id,
            "timestamp": str(int(self.clock().timestamp())),
            "sign_type": "RSA",
        }
        signed: Final = self.private.sign(
            canonical_fields(payload, response=False), padding.PKCS1v15(), hashes.SHA256()
        )
        return MappingProxyType({**payload, "sign": base64.b64encode(signed).decode("ascii")})

    def verify(self, fields: Mapping[str, str]) -> bool:
        timestamp: Final = fields.get("timestamp", "")
        if (
            fields.get("sign_type") != "RSA"
            or not timestamp.isascii()
            or not timestamp.isdigit()
            or len(timestamp) > 20
        ):
            return False
        if int(timestamp) <= 0 or abs(int(timestamp) - int(self.clock().timestamp())) > 300:
            return False
        try:
            self.public.verify(
                base64.b64decode(fields.get("sign", ""), validate=True),
                canonical_fields(fields, response=True),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
        except (InvalidSignature, ValueError, binascii.Error):
            return False
        else:
            return True


class GoepayClient:
    def __init__(
        self,
        origin: str,
        merchant_id: str,
        signature: GoepaySignature,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.origin = origin
        self.merchant_id = merchant_id
        self.signature = signature
        self.transport = transport

    async def call(self, path: str, fields: Mapping[str, str]) -> Mapping[str, str] | AuthError:
        if path not in {"/api/pay/create", "/api/pay/query", "/api/merchant/info"}:
            return AuthError("gateway_invalid_response", 502)
        try:
            async with (
                httpx.AsyncClient(
                    transport=self.transport, timeout=15, follow_redirects=False, trust_env=False
                ) as client,
                client.stream(
                    "POST",
                    self.origin + path,
                    data=self.signature.sign(fields, self.merchant_id),
                    headers={"Accept": "application/json", "Accept-Encoding": "identity"},
                ) as reply,
            ):
                content_types: Final = tuple(reply.headers.get_list("content-type"))
                if (
                    reply.status_code != 200
                    or len(content_types) != 1
                    or content_types[0].split(";")[0] != "application/json"
                ):
                    return AuthError("gateway_invalid_response", 502)
                buffer: Final = io.BytesIO()
                async for chunk in reply.aiter_bytes():
                    if buffer.tell() + len(chunk) > 65_536:
                        return AuthError("gateway_invalid_response", 502)
                    buffer.write(chunk)
                payload: Final = response_fields(buffer.getvalue())
                if isinstance(payload, AuthError):
                    return payload
                if not self.signature.verify(payload):
                    return AuthError("gateway_invalid_response", 502)
                if payload.get("code") == "-1" and payload.get("msg") == "payment channel not permitted":
                    return AuthError("gateway_channel_unavailable", 503)
                if payload.get("code") != "0":
                    return AuthError("gateway_invalid_response", 502)
                return payload
        except httpx.TimeoutException:
            return AuthError("gateway_timeout", 503)
        except httpx.HTTPError:
            return AuthError("gateway_invalid_response", 502)
