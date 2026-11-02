from datetime import datetime, timezone
from decimal import Decimal
from typing import Final

import pytest
from litellm._internal_context import pinned_billing_time
from litellm.models.commerce_auth import AuthError
from litellm.proxy.commerce.billing_pricing import (
    bounded_request,
    cost_units,
    deployment_request,
    single_quote,
)
from litellm.router import Router


@pytest.mark.asyncio
async def test_expired_pricing_calendar_rejects_before_estimating_or_sending() -> None:
    router = Router(
        model_list=[
            {
                "model_name": "calendar-priced-model",
                "litellm_params": {"model": "openai/gpt-4o", "api_key": "offline-test-only"},
                "model_info": {
                    "input_cost_per_token": 1e-7,
                    "output_cost_per_token": 5e-7,
                    "off_peak_pricing": {
                        "calendar_dates": [],
                        "calendar_timezone": "Asia/Shanghai",
                        "calendar_valid_until": "2026-12-31",
                    },
                },
            }
        ]
    )
    with pinned_billing_time(datetime(2027, 1, 1, tzinfo=timezone.utc)):
        result = await single_quote(
            {"model": "calendar-priced-model", "messages": [{"role": "user", "content": "hello"}], "max_tokens": 1},
            "/v1/chat/completions",
            router,
        )
    assert isinstance(result, AuthError) and result.code == "wallet_pricing_unavailable"


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
        {"prompt_cache_options": {"ttl": "12h"}},
        {"prompt_cache_breakpoint": {"mode": "explicit", "ttl": "12h"}},
        {
            "input": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "hello",
                            "prompt_cache_breakpoint": {"mode": "explicit", "ttl": "12h"},
                        }
                    ],
                }
            ]
        },
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
