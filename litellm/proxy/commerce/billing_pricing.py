import json
from collections.abc import Mapping, Sequence
from decimal import ROUND_CEILING, Decimal, InvalidOperation
from itertools import chain
from types import MappingProxyType
from typing import Final

from litellm.litellm_core_utils.llm_cost_calc.utils import is_calendar_off_peak
from litellm.models.commerce_auth import AuthError
from litellm.proxy.spend_tracking.budget_reservation import (
    count_request_input_tokens,  # pyright: ignore[reportUnknownVariableType]  # Native helper accepts legacy untyped payloads
    estimate_request_max_cost,  # pyright: ignore[reportUnknownVariableType]  # Native helper accepts legacy untyped payloads
)
from litellm.router import Router
from litellm.types.utils import is_server_derived_pricing_key
from pydantic import TypeAdapter

from litellm.models.commerce_wallet import MAX_UNITS, UNITS_PER_USD

_MAPPING: Final = TypeAdapter(dict[str, object])
_SEQUENCE: Final = TypeAdapter(tuple[object, ...])
_FALLBACKS: Final = TypeAdapter(tuple[Mapping[str, tuple[str, ...]], ...])
_OUTPUT_FIELDS: Final = ("max_tokens", "max_completion_tokens", "max_output_tokens")
_DECISION_CALL_TYPES: Final = frozenset({"decisions", "adecisions"})
_UNCAPPED_CALL_TYPES: Final = frozenset({"embedding", "aembedding"}) | _DECISION_CALL_TYPES
_DEPLOYMENT_FIELDS: Final = frozenset(
    {
        "messages",
        "prompt",
        "input",
        "questions",
        "state",
        "images",
        "assets",
        "videos",
        "system",
        "instructions",
        "tools",
        "functions",
        "response_format",
        "text",
        "max_tokens",
        "max_completion_tokens",
        "max_output_tokens",
        "n",
        "best_of",
        "stream",
        "modalities",
        "service_tier",
        "speed",
        "cache_control",
        "previous_response_id",
        "conversation",
        "background",
        "audio",
        "web_search_options",
        "prediction",
        "documents",
        "file_id",
        "file_url",
        "file_data",
        "prompt_cache_retention",
        "prompt_id",
        "prompt_version",
    }
)
_TEXT_CONTENT: Final = frozenset(
    {"text", "input_text", "output_text", "tool_result", "function_call_output", "message", "refusal"}
)
_CLIENT_OVERRIDES: Final = frozenset(
    {
        "extra_body",
        "litellm_params",
        "model_info",
        "fallbacks",
        "context_window_fallbacks",
        "content_policy_fallbacks",
        "router_settings_override",
        "model_list",
        "api_base",
        "api_key",
        "api_version",
        "custom_llm_provider",
        "mock_response",
        "mock_usage",
        "extra_headers",
        "headers",
        "num_retries",
        "max_retries",
        "deployment_id",
        "model_id",
        "specific_deployment",
        "routing_strategy",
        "fastest_response_batch_completion",
    }
)


def object_mapping(value: object) -> Mapping[str, object]:
    return _MAPPING.validate_python(value) if isinstance(value, Mapping) else {}


def cost_units(cost: object) -> int | AuthError:
    if isinstance(cost, bool) or not isinstance(cost, (str, int, float, Decimal)):
        return AuthError("wallet_pricing_unavailable", 503)
    try:
        amount: Final = Decimal(str(cost))
        if not amount.is_finite() or amount < 0 or amount > Decimal(MAX_UNITS) / UNITS_PER_USD:
            return AuthError("wallet_pricing_unavailable", 503)
        return int((amount * UNITS_PER_USD).to_integral_value(rounding=ROUND_CEILING))
    except (InvalidOperation, ValueError):
        return AuthError("wallet_pricing_unavailable", 503)


def has_unpriced_content(value: object) -> bool:
    if isinstance(value, Mapping):
        mapped: Final = _MAPPING.validate_python(value)
        content_type: Final = mapped.get("type")
        if isinstance(content_type, str) and content_type in {"tool_use", "function", "function_call"}:
            return False
        if isinstance(content_type, str) and content_type not in _TEXT_CONTENT:
            return True
        if mapped.get("id") and not any(
            mapped.get(field) for field in ("content", "text", "arguments", "output", "input")
        ):
            return True
        return any(has_unpriced_content(child) for child in mapped.values())
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return any(has_unpriced_content(child) for child in _SEQUENCE.validate_python(value))
    return False


def bounded_request(data: Mapping[str, object], call_type: str) -> Mapping[str, object] | AuthError:
    unresolved: Final = (
        "previous_response_id",
        "conversation",
        "extra_body",
        "audio",
        "web_search_options",
        "litellm_params",
        "router_settings_override",
        "prediction",
        "documents",
        "file_id",
        "file_url",
        "file_data",
        "prompt_cache_retention",
    )
    prompt_references: Final = ("prompt_id", "prompt_version")
    if (
        data.get("background") is True
        or isinstance(data.get("prompt"), Mapping)
        or any(data.get(field) for field in (*unresolved, *prompt_references))
    ):
        return AuthError("wallet_request_not_supported", 400)
    if has_premium_controls(data) or data.get("modalities") not in (None, ["text"], ("text",)):
        return AuthError("wallet_request_not_supported", 400)
    if any(is_server_derived_pricing_key(key) for key in data):
        return AuthError("wallet_request_not_supported", 400)
    tools: Final = data.get("tools")
    if (
        isinstance(tools, Sequence)
        and not isinstance(tools, (str, bytes))
        and any(object_mapping(tool).get("type") not in (None, "function") for tool in _SEQUENCE.validate_python(tools))
    ):
        return AuthError("wallet_request_not_supported", 400)
    if any(has_unpriced_content(data.get(field)) for field in ("messages", "input", "system")):
        return AuthError("wallet_request_not_supported", 400)
    limits: Final = tuple(data[field] for field in _OUTPUT_FIELDS if field in data)
    if "stream" in data and not isinstance(data["stream"], bool):
        return AuthError("invalid_request", 422)
    if len(limits) > 1:
        return AuthError("wallet_request_not_supported", 400)
    if any(isinstance(limit, bool) or not isinstance(limit, int) or limit < 1 for limit in limits):
        return AuthError("invalid_request", 422)
    if any(not valid_multiplier(data.get(field, 1)) for field in ("n", "best_of")):
        return AuthError("invalid_request", 422)
    if call_type in _DECISION_CALL_TYPES and (
        limits
        or data.get("stream") is True
        or any(field in data for field in ("messages", "prompt"))
        or any(data.get(field) for field in ("state", "images", "assets", "videos"))
    ):
        return AuthError("wallet_request_not_supported", 400)
    if limits or call_type in _UNCAPPED_CALL_TYPES:
        return data
    output_field: Final = "max_output_tokens" if call_type in {"responses", "aresponses"} else "max_tokens"
    return MappingProxyType({**data, output_field: 4096})


def valid_multiplier(value: object) -> bool:
    return not isinstance(value, bool) and isinstance(value, int) and 1 <= value <= 16


def deployment_request(data: Mapping[str, object], model: str, call_type: str) -> Mapping[str, object] | AuthError:
    payload: Final = {key: value for key, value in data.items() if key in _DEPLOYMENT_FIELDS and value is not None}
    if call_type not in _UNCAPPED_CALL_TYPES and not any(field in payload for field in _OUTPUT_FIELDS):
        return AuthError("wallet_request_not_supported", 400)
    return bounded_request({**payload, "model": model}, call_type)


def selected_model(data: Mapping[str, object], router: Router | None) -> str | AuthError:
    metadata: Final = object_mapping(data.get("litellm_metadata") or data.get("metadata"))
    group: Final = metadata.get("deployment_model_name")
    model_id: Final = object_mapping(data.get("model_info") or metadata.get("model_info")).get("id")
    if router is None or not isinstance(group, str) or not isinstance(model_id, str):
        return AuthError("wallet_pricing_unavailable", 503)
    deployments: Final = router.get_model_list(model_name=group) or ()
    if not any(
        object_mapping(_MAPPING.validate_python(item).get("model_info")).get("id") == model_id for item in deployments
    ):
        return AuthError("wallet_pricing_unavailable", 503)
    return group


def client_overrides(data: Mapping[str, object]) -> bool:
    return any(key in _CLIENT_OVERRIDES or is_server_derived_pricing_key(key) for key in data)


def has_premium_controls(value: object) -> bool:
    if isinstance(value, Mapping):
        mapped: Final = _MAPPING.validate_python(value)
        if any(
            mapped.get(field)
            for field in (
                "cache_control",
                "encrypted_content",
                "prompt_cache_retention",
                "prompt_cache_options",
                "prompt_cache_breakpoint",
            )
        ):
            return True
        if mapped.get("service_tier") not in (None, "default", "standard") or mapped.get("speed") not in (
            None,
            "standard",
        ):
            return True
        schema_fields: Final = frozenset({"properties", "parameters", "schema"})
        return any(has_premium_controls(child) for key, child in mapped.items() if key not in schema_fields)
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return any(has_premium_controls(child) for child in _SEQUENCE.validate_python(value))
    return False


async def quote_units(data: Mapping[str, object], route: str, router: Router | None) -> int | AuthError:
    model: Final = data.get("model")
    if not isinstance(model, str):
        return AuthError("wallet_pricing_unavailable", 503)
    candidates: Final = fallback_models(model, router)
    quotes: Final = tuple([await single_quote({**data, "model": candidate}, route, router) for candidate in candidates])
    errors: Final = tuple(quote for quote in quotes if isinstance(quote, AuthError))
    if errors:
        return errors[0]
    return max(quote for quote in quotes if isinstance(quote, int))


def fallback_models(model: str, router: Router | None) -> frozenset[str]:
    if router is None:
        return frozenset({model})
    fields: Final = ("fallbacks", "context_window_fallbacks", "content_policy_fallbacks")
    graph: Final = tuple(
        chain.from_iterable(_FALLBACKS.validate_python(getattr(router, field, None) or ()) for field in fields)
    )
    return reachable_fallbacks(frozenset({model}), graph)


def reachable_fallbacks(current: frozenset[str], graph: Sequence[Mapping[str, tuple[str, ...]]]) -> frozenset[str]:
    targets: Final = frozenset(chain.from_iterable(fallback_targets(node, current) for node in graph))
    expanded: Final = current | targets
    if expanded == current:
        return current
    if len(expanded) > 4096:
        raise ValueError("Fallback graph is too large")
    return reachable_fallbacks(expanded, graph)


def fallback_targets(node: Mapping[str, tuple[str, ...]], current: frozenset[str]) -> tuple[str, ...]:
    return tuple(chain.from_iterable(targets for name, targets in node.items() if name in current or name == "*"))


async def single_quote(data: Mapping[str, object], route: str, router: Router | None) -> int | AuthError:
    model: Final = data.get("model")
    if router is not None and isinstance(model, str):
        defaults: Final = getattr(router, "default_litellm_params", None)
        deployments: Final = router.get_model_list(model_name=model) or ()
        for deployment in deployments:
            off_peak = object_mapping(deployment.get("model_info")).get("off_peak_pricing")
            if off_peak is None:
                continue
            if not isinstance(off_peak, Mapping):
                return AuthError("wallet_pricing_unavailable", 503)
            try:
                is_calendar_off_peak(object_mapping(off_peak))
            except (ValueError, TypeError):
                return AuthError("wallet_pricing_unavailable", 503)
        if unsafe_defaults(defaults) or any(unsafe_defaults(item["litellm_params"]) for item in deployments):
            return AuthError("wallet_pricing_unavailable", 503)
    request_body: Final = dict(data)
    counts: Final = await count_request_input_tokens(request_body=request_body, route=route, llm_router=router)
    extra_fields: Final = ("system", "instructions", "functions", "response_format", "text", "questions")
    extra: Final = {field: data[field] for field in extra_fields if data.get(field)}
    additional: Final = {**extra, **({"tools": data["tools"]} if "messages" not in data and data.get("tools") else {})}
    extra_counts: Final[Mapping[str, int]] = (
        await count_request_input_tokens(
            request_body={"model": data.get("model"), "input": json.dumps(additional, ensure_ascii=False)},
            route=route,
            llm_router=router,
        )
        if additional
        else {}
    )
    complete_counts: Final = MappingProxyType(
        {model: tokens + extra_counts.get(model, 0) for model, tokens in counts.items()}
    )
    estimate: Final = estimate_request_max_cost(
        request_body=request_body, route=route, llm_router=router, input_token_counts=complete_counts
    )
    amount: Final = cost_units(estimate)
    return amount if isinstance(amount, AuthError) else max(amount, 1)


def unsafe_defaults(value: object) -> bool:
    data: Final = object_mapping(value)
    return (
        has_premium_controls(data)
        or isinstance(data.get("prompt"), Mapping)
        or bool(data.get("extra_body") or data.get("silent_model") or data.get("prompt_id"))
    )
