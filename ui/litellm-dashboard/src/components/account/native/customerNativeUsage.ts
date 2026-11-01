import type { Usage } from "../gatewayApi";
import {
  EMPTY_DAILY_ACTIVITY_METADATA,
  type DailyActivityAggregatedResponse,
} from "@/components/UsagePage/dailyActivityApi";

function metrics(row: Usage["totals"]) {
  return {
    spend: row.spend_usd,
    api_requests: row.requests,
    prompt_tokens: row.prompt_tokens,
    completion_tokens: row.completion_tokens,
    total_tokens: row.total_tokens,
    successful_requests: row.successful_requests ?? 0,
    failed_requests: row.failed_requests ?? 0,
    total_response_time_ms: row.response_time_ms ?? 0,
    timed_requests: row.timed_requests ?? 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    flat_cost: 0,
    compression_saved_tokens: 0,
    compression_savings_spend: 0,
    prompt_caching_savings_spend: 0,
    gateway_injected_caching_savings_spend: 0,
    autorouter_savings_spend: 0,
  };
}

export function nativeUsage(usage: Usage): DailyActivityAggregatedResponse {
  const totals = usage.totals;
  return {
    results: usage.daily.map((day) => {
      const models = Object.fromEntries(
        (usage.daily_models ?? [])
          .filter((row) => row.day === day.day)
          .map((row) => [row.model, { metrics: metrics(row), metadata: {} }]),
      );
      return { date: day.day, metrics: metrics(day), breakdown: { models, model_groups: models } };
    }),
    metadata: {
      ...EMPTY_DAILY_ACTIVITY_METADATA,
      total_spend: totals.spend_usd,
      total_api_requests: totals.requests,
      total_tokens: totals.total_tokens,
      total_prompt_tokens: totals.prompt_tokens,
      total_completion_tokens: totals.completion_tokens,
      total_successful_requests: totals.successful_requests ?? 0,
      total_failed_requests: totals.failed_requests ?? 0,
      total_response_time_ms: totals.response_time_ms ?? 0,
      total_timed_requests: totals.timed_requests ?? 0,
    },
  };
}

export function nativeWindow(query: URLSearchParams) {
  const offset = Number(query.get("timezone") ?? 0) * 60000;
  const timestamp = (value: string, end: boolean) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value))
      return new Date(Date.parse(value + "T00:00:00Z") + offset + (end ? 86400000 : 0)).toISOString();
    return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toISOString();
  };
  const start = query.get("start_date");
  const end = query.get("end_date");
  return { start_time: start ? timestamp(start, false) : undefined, end_time: end ? timestamp(end, true) : undefined };
}
