import asyncio
import json
import math
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from litellm._internal_context import pinned_billing_time
from litellm.models.commerce_auth import AuthError
from litellm.proxy.commerce.billing_pricing import single_quote
from litellm.proxy.spend_tracking.budget_reservation import _max_cost_for_cost_info
from litellm.router import Router

import litellm


def verify_cost(
    model: str,
    pricing: dict,
    moment: str,
    prompt: int,
    output: int,
    expected: tuple[float, float],
    cache_read: int = 0,
    cache_write: int = 0,
) -> None:
    with pinned_billing_time(datetime.fromisoformat(moment)):
        actual = litellm.cost_per_token(
            model=model,
            custom_llm_provider="openai",
            prompt_tokens=prompt,
            completion_tokens=output,
            cache_read_input_tokens=cache_read,
            cache_creation_input_tokens=cache_write,
        )
    assert all(math.isclose(a, b, rel_tol=1e-10, abs_tol=1e-15) for a, b in zip(actual, expected)), (
        model,
        actual,
        expected,
    )
    quote = _max_cost_for_cost_info(
        request_body={"max_tokens": output},
        route="/v1/chat/completions",
        model=model,
        model_info=pricing,
        input_tokens=prompt,
    )
    assert quote is not None and quote + 1e-15 >= sum(expected), (model, quote, expected)


async def main() -> None:
    manifest = json.loads(Path(sys.argv[1]).read_text())
    entries = {entry["model_name"]: entry for entry in manifest["models"]}
    assert len(entries) == 4 and manifest["publication"] == "preserve-existing-switches"
    for name, entry in entries.items():
        litellm.register_model({name: {"mode": "chat", "litellm_provider": "openai", **entry["pricing"]}})
    for name in ("deepseek-v4.1-flash", "deepseek-v4.1-flash-1017"):
        price = entries[name]["pricing"]
        for moment, off_peak in (
            ("2026-11-02T00:59:00+00:00", True),
            ("2026-11-02T01:00:00+00:00", False),
            ("2026-11-02T04:00:00+00:00", True),
            ("2026-11-02T06:00:00+00:00", False),
            ("2026-11-02T10:00:00+00:00", True),
            ("2026-11-01T02:00:00+00:00", True),
            ("2026-05-01T02:00:00+00:00", True),
        ):
            selected = price["off_peak_pricing"] if off_peak else price
            expected = (1000 * selected["input_cost_per_token"], 100 * selected["output_cost_per_token"])
            verify_cost(name, price, moment, 1000, 100, expected)
            verify_cost(
                name,
                price,
                moment,
                1000,
                100,
                (
                    500 * selected["input_cost_per_token"]
                    + 300 * selected["cache_read_input_token_cost"]
                    + 200 * selected["cache_creation_input_token_cost"],
                    100 * selected["output_cost_per_token"],
                ),
                300,
                200,
            )
    luna = entries["gpt-6-luna"]["pricing"]
    for count, tier_index in ((272000, 0), (272001, 1), (300000, 1)):
        tier = luna["tiered_pricing"][tier_index]
        expected = (count * tier["input_cost_per_token"], 100 * tier["output_cost_per_token"])
        verify_cost("gpt-6-luna", luna, "2026-11-02T02:00:00+00:00", count, 100, expected)
        verify_cost(
            "gpt-6-luna",
            luna,
            "2026-11-02T02:00:00+00:00",
            count,
            100,
            (
                (count - 500) * tier["input_cost_per_token"]
                + 300 * tier["cache_read_input_token_cost"]
                + 200 * tier["cache_creation_input_token_cost"],
                100 * tier["output_cost_per_token"],
            ),
            300,
            200,
        )
    quote = _max_cost_for_cost_info(
        request_body={"max_tokens": 1},
        route="/v1/chat/completions",
        model="gpt-6-luna",
        model_info=luna,
        input_tokens=300000,
    )
    assert quote is not None and Decimal(str(quote)) > Decimal("0.04")
    uncensored = entries["deepseek-v4.1-flash-uncensored"]["pricing"]
    verify_cost(
        "deepseek-v4.1-flash-uncensored",
        uncensored,
        "2026-11-02T02:00:00+00:00",
        11,
        2,
        (11 * uncensored["input_cost_per_token"], 2 * uncensored["output_cost_per_token"]),
    )
    router = Router(
        model_list=[
            {
                "model_name": "holiday-preflight",
                "litellm_params": {"model": "openai/gpt-4o", "api_key": "offline-only"},
                "model_info": entries["deepseek-v4.1-flash"]["pricing"],
            }
        ]
    )
    with pinned_billing_time(datetime(2027, 1, 1, tzinfo=timezone.utc)):
        rejected = await single_quote(
            {"model": "holiday-preflight", "messages": [{"role": "user", "content": "hello"}], "max_tokens": 1},
            "/v1/chat/completions",
            router,
        )
    assert isinstance(rejected, AuthError) and rejected.code == "wallet_pricing_unavailable"
    print(
        json.dumps(
            {
                "models": 4,
                "deepseek": "peak, off-peak, weekend and holiday verified",
                "luna": "272k boundary and conservative reservation verified",
                "calendarExpiry": "rejected before dispatch",
                "network": "none",
            }
        )
    )


asyncio.run(main())
