from decimal import Decimal
from typing import Final

import pytest

from litellm.models.commerce_auth import AuthError
from litellm.proxy.commerce.billing_pricing import bounded_request, cost_units, deployment_request


@pytest.mark.parametrize("field", ("previous_response_id", "conversation", "extra_body", "prompt", "prompt_id"))
def test_unpriced_history_and_nested_overrides_are_not_admitted(field: str) -> None:
    result: Final = bounded_request(
        {"model": "priced-model", "input": "hello", field: {"id": "unpriced"}}, "aresponses"
    )
    assert isinstance(result, AuthError) and result.code == "wallet_request_not_supported"


@pytest.mark.parametrize("value", ("0.0000000001", Decimal("0.0000000001")))
def test_nonzero_sub_unit_costs_are_rounded_up(value: str | Decimal) -> None:
    assert cost_units(value) == 1


@pytest.mark.parametrize("value", (None, float("nan"), float("inf"), -1, True))
def test_invalid_cost_is_never_a_free_call(value: object) -> None:
    assert isinstance(cost_units(value), AuthError)


@pytest.mark.parametrize(
    "extra",
    (
        {"service_tier": "priority"},
        {"speed": "fast"},
        {"router_settings_override": {"fallbacks": [{"cheap": ["expensive"]}]}},
        {
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": "hello", "cache_control": {"type": "ephemeral", "ttl": "1h"}}],
                }
            ]
        },
        {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "document", "source": {"type": "url", "url": "https://example.test/large.pdf"}}
                    ],
                }
            ]
        },
        {"modalities": ["text", "audio"]},
        {"type": "object", "properties": {}, "service_tier": "priority"},
        {
            "type": "function",
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": "hello", "cache_control": {"type": "ephemeral"}}]}
            ],
        },
        {
            "type": "tool_use",
            "input": [{"type": "input_text", "text": "hello", "cache_control": {"type": "ephemeral"}}],
        },
    ),
)
def test_unpriced_premiums_documents_and_dynamic_routing_are_rejected(extra: dict[str, object]) -> None:
    result: Final = bounded_request({"model": "priced-model", "max_tokens": 1, **extra}, "acompletion")
    assert isinstance(result, AuthError) and result.code == "wallet_request_not_supported"


def test_standard_function_tools_and_plain_text_remain_available() -> None:
    result: Final = bounded_request(
        {
            "model": "priced-model",
            "max_tokens": 32,
            "messages": [{"role": "user", "content": "hello"}],
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": "test_tool",
                        "parameters": {
                            "type": "object",
                            "properties": {"speed": {"type": "string"}, "service_tier": {"type": "string"}},
                        },
                    },
                }
            ],
        },
        "acompletion",
    )
    assert not isinstance(result, AuthError)


def test_final_deployment_cannot_silently_reinsert_a_removed_output_cap() -> None:
    result: Final = deployment_request(
        {"messages": [{"role": "user", "content": "hello"}]}, "priced-model", "acompletion"
    )
    assert isinstance(result, AuthError) and result.code == "wallet_request_not_supported"
