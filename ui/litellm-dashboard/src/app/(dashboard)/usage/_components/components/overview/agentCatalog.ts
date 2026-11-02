import { markUiCopy } from "@/lib/i18n";
import anthropicLogo from "../../../../../../../public/assets/logos/anthropic.svg";
import cursorLogo from "../../../../../../../public/assets/logos/cursor.svg";
import copilotLogo from "../../../../../../../public/assets/logos/github_copilot.svg";
import githubLogo from "../../../../../../../public/assets/logos/github.svg";
import hermesLogo from "../../../../../../../public/assets/logos/hermes.png";
import langchainLogo from "../../../../../../../public/assets/logos/langchain.svg";
import litellmLogo from "../../../../../../../public/assets/logos/litellm_monogram.svg";
import openaiLogo from "../../../../../../../public/assets/logos/openai_small.svg";
import openaiAgentsLogo from "../../../../../../../public/assets/logos/openai-agents.svg";
import opencodeLogo from "../../../../../../../public/assets/moyai/logos/opencode.svg";
import pydanticAiLogo from "../../../../../../../public/assets/logos/pydantic-ai-color.svg";
import xaiLogo from "../../../../../../../public/assets/logos/xai.svg";
import type { components } from "@/lib/http/schema";
import type { DailyData, SpendMetrics } from "@/components/UsagePage/types";

/** One row of `GET /tag/summary`. */
export type TagSummaryRow = components["schemas"]["TagSummaryMetrics"];

export type AgentKind = "agent" | "sdk";

export interface AgentRow {
  id: string;
  label: string;
  description: string;
  kind: AgentKind;
  logo: string | null;
  spend: number;
  tokens: number;
  requests: number;
  users: number;
  /** The raw `User-Agent: ...` tags this agent was built from, used to filter User Agent Activity. */
  tags: string[];
}

interface AgentFamily {
  id: string;
  label: string;
  description: string;
  kind: AgentKind;
  logo: string | null;
  /** Matched against the user-agent with its `User-Agent: ` prefix removed, case-insensitively. */
  match: RegExp;
}

/**
 * Most specific first. Coding agents beat the SDK they are built on, so `codex_sdk_ts` lands on
 * Codex and only a bare `OpenAI/...` client falls through to the OpenAI SDK. Codex wears OpenAI's
 * mark as in the Lens trace view; Claude Code gets its own spark tile rather than Anthropic's wordmark.
 */
const FAMILIES: readonly AgentFamily[] = [
  markUiCopy(
    {
      id: "claude-code",
      label: "Claude Code",
      description: "Anthropic's coding agent",
      kind: "agent" as const,
      // No Claude asset ships in the repo, so TopAgents draws the spark tile itself.
      logo: null,
      match: /^(claude-cli|claude-code|claude_code|claude-user)\b/i,
    },
    { label: "Claude Code", description: "Anthropic's coding agent" },
  ),
  markUiCopy(
    {
      id: "codex",
      label: "Codex",
      description: "OpenAI's coding agent",
      kind: "agent" as const,
      logo: openaiLogo.src,
      match: /^(codex[ _-]|codex$)/i,
    },
    { label: "Codex", description: "OpenAI's coding agent" },
  ),
  markUiCopy(
    {
      id: "opencode",
      label: "OpenCode",
      description: "Open-source terminal coding agent",
      kind: "agent" as const,
      logo: opencodeLogo.src,
      match: /^opencode\b/i,
    },
    { label: "OpenCode", description: "Open-source terminal coding agent" },
  ),
  markUiCopy(
    {
      id: "cursor",
      label: "Cursor",
      description: "AI code editor",
      kind: "agent" as const,
      logo: cursorLogo.src,
      match: /^cursor\b/i,
    },
    { label: "Cursor", description: "AI code editor" },
  ),
  markUiCopy(
    {
      id: "copilot",
      label: "GitHub Copilot",
      description: "GitHub's coding assistant",
      kind: "agent" as const,
      logo: copilotLogo.src,
      match: /^(github-?copilot|copilot)\b/i,
    },
    { label: "GitHub Copilot", description: "GitHub's coding assistant" },
  ),
  markUiCopy(
    {
      id: "hermes",
      label: "Hermes Agent",
      description: "Open-source agent",
      kind: "agent" as const,
      logo: hermesLogo.src,
      match: /^hermes\b/i,
    },
    { label: "Hermes Agent", description: "Open-source agent" },
  ),
  markUiCopy(
    {
      id: "grok",
      label: "Grok",
      description: "xAI's assistant",
      kind: "agent" as const,
      logo: xaiLogo.src,
      match: /^grok\b/i,
    },
    { label: "Grok", description: "xAI's assistant" },
  ),
  markUiCopy(
    {
      id: "cline",
      label: "Cline",
      description: "Open-source coding agent",
      kind: "agent" as const,
      logo: null,
      match: /^cline\b/i,
    },
    { label: "Cline", description: "Open-source coding agent" },
  ),
  markUiCopy(
    {
      id: "kilo-code",
      label: "Kilo Code",
      description: "Open-source coding agent",
      kind: "agent" as const,
      logo: null,
      match: /^kilo[- ]?code\b/i,
    },
    { label: "Kilo Code", description: "Open-source coding agent" },
  ),
  markUiCopy(
    {
      id: "aider",
      label: "Aider",
      description: "AI pair programming in the terminal",
      kind: "agent" as const,
      logo: null,
      match: /^aider\b/i,
    },
    { label: "Aider", description: "AI pair programming in the terminal" },
  ),
  markUiCopy(
    {
      id: "openai-agents",
      label: "OpenAI Agents",
      description: "OpenAI Agents SDK",
      kind: "sdk" as const,
      logo: openaiAgentsLogo.src,
      match: /^agents$/i,
    },
    { label: "OpenAI Agents", description: "OpenAI Agents SDK" },
  ),
  markUiCopy(
    {
      id: "langchain",
      label: "LangChain",
      description: "Agent framework",
      kind: "sdk" as const,
      logo: langchainLogo.src,
      match: /^(langchain|langgraph|deepagents)/i,
    },
    { label: "LangChain", description: "Agent framework" },
  ),
  markUiCopy(
    {
      id: "pydantic-ai",
      label: "Pydantic AI",
      description: "Agent framework",
      kind: "sdk" as const,
      logo: pydanticAiLogo.src,
      match: /^pydantic-ai\b/i,
    },
    { label: "Pydantic AI", description: "Agent framework" },
  ),
  markUiCopy(
    {
      id: "github-actions",
      label: "GitHub Actions",
      description: "CI workflows",
      kind: "sdk" as const,
      logo: githubLogo.src,
      match: /^github-actions\b/i,
    },
    { label: "GitHub Actions", description: "CI workflows" },
  ),
  markUiCopy(
    {
      id: "litellm",
      label: "LiteLLM SDK",
      description: "litellm Python SDK",
      kind: "sdk" as const,
      logo: litellmLogo.src,
      match: /^litellm\b/i,
    },
    { label: "LiteLLM SDK", description: "litellm Python SDK" },
  ),
  markUiCopy(
    {
      id: "openai-sdk",
      label: "OpenAI SDK",
      description: "OpenAI client library",
      kind: "sdk" as const,
      logo: openaiLogo.src,
      match: /^(openai|asyncopenai)\b/i,
    },
    { label: "OpenAI SDK", description: "OpenAI client library" },
  ),
  markUiCopy(
    {
      id: "anthropic-sdk",
      label: "Anthropic SDK",
      description: "Anthropic client library",
      kind: "sdk" as const,
      logo: anthropicLogo.src,
      match: /^anthropic\b/i,
    },
    { label: "Anthropic SDK", description: "Anthropic client library" },
  ),
  markUiCopy(
    {
      id: "python",
      label: "Python",
      description: "Scripts and HTTP clients",
      kind: "sdk" as const,
      logo: null,
      match: /^(python|httpx|aiohttp|urllib|requests)/i,
    },
    { label: "Python", description: "Scripts and HTTP clients" },
  ),
  markUiCopy(
    {
      id: "node",
      label: "Node.js",
      description: "Scripts and HTTP clients",
      kind: "sdk" as const,
      logo: null,
      match: /^(node|bun|deno|axios|undici)\b/i,
    },
    { label: "Node.js", description: "Scripts and HTTP clients" },
  ),
  markUiCopy(
    { id: "curl", label: "curl", description: "Command line", kind: "sdk" as const, logo: null, match: /^curl\b/i },
    { label: "curl", description: "Command line" },
  ),
];

const USER_AGENT_PREFIX = /^user[- ]agent:\s*/i;

export const isUserAgentTag = (tag: string): boolean => USER_AGENT_PREFIX.test(tag.trim());

/** The user-agent product with its version and platform detail dropped: `claude-cli/2.1.263 (external)` -> `claude-cli`. */
export const userAgentProduct = (tag: string): string => {
  const ua = tag.trim().replace(USER_AGENT_PREFIX, "");
  return ua.split(/[/(;]/, 1)[0].trim();
};

const familyFor = (product: string): AgentFamily | null =>
  FAMILIES.find((family) => family.match.test(product)) ?? null;

const isBareTag = (row: TagSummaryRow, product: string) =>
  row.tag.trim().replace(USER_AGENT_PREFIX, "").trim() === product;

/**
 * The rows that count toward a product. `/tag/summary` reports a bare tag (`claude-cli`) as the
 * rollup of its versioned children, and a request carries both, so a bare row alone stands for the
 * product. These same rows become the agent's drill-in filter, keeping it from double-counting.
 */
const contributingRows = (product: string, rows: readonly TagSummaryRow[]): readonly TagSummaryRow[] => {
  const bare = rows.find((row) => isBareTag(row, product));
  return bare ? [bare] : rows;
};

const agentFor = (product: string, rows: readonly TagSummaryRow[]): AgentRow => {
  const family = familyFor(product);
  return {
    id: family?.id ?? `ua:${product.toLowerCase()}`,
    label: family?.label ?? product,
    description: family?.description ?? "Custom client",
    kind: family?.kind ?? "sdk",
    logo: family?.logo ?? null,
    spend: rows.reduce((sum, row) => sum + (row.total_spend || 0), 0),
    tokens: rows.reduce((sum, row) => sum + (row.total_tokens || 0), 0),
    requests: rows.reduce((sum, row) => sum + (row.total_requests || 0), 0),
    // Users overlap across a family's products, so the largest is the honest lower bound.
    users: Math.max(0, ...rows.map((row) => row.unique_users || 0)),
    tags: rows.map((row) => row.tag),
  };
};

const mergeAgents = (a: AgentRow, b: AgentRow): AgentRow => ({
  ...a,
  spend: a.spend + b.spend,
  tokens: a.tokens + b.tokens,
  requests: a.requests + b.requests,
  users: Math.max(a.users, b.users),
  tags: [...a.tags, ...b.tags],
});

/**
 * One row per agent from `/tag/summary`. Products are keyed case-sensitively: prod reports `python`
 * and `Python` as distinct products, and folding them let one rollup overwrite the other.
 */
export const topAgents = (rows: readonly TagSummaryRow[]): AgentRow[] => {
  const userAgentRows = rows.filter((row) => isUserAgentTag(row.tag) && userAgentProduct(row.tag));
  const products = [...new Set(userAgentRows.map((row) => userAgentProduct(row.tag)))];
  const perProduct = products.map((product) =>
    agentFor(
      product,
      contributingRows(
        product,
        userAgentRows.filter((row) => userAgentProduct(row.tag) === product),
      ),
    ),
  );
  const byAgent = perProduct.reduce<ReadonlyMap<string, AgentRow>>((acc, agent) => {
    const existing = acc.get(agent.id);
    return new Map([...acc, [agent.id, existing ? mergeAgents(existing, agent) : agent]]);
  }, new Map());
  return [...byAgent.values()]
    .filter((agent) => agent.spend > 0 || agent.tokens > 0 || agent.requests > 0)
    .sort((a, b) => b.tokens - a.tokens || b.spend - a.spend);
};

/**
 * Rewrites one day's `breakdown.entities` (keyed by raw tag) into one entry per agent, keyed by the
 * agent label, so the existing per-day series builders can stack agents the way they stack models.
 * Uses the same bare-vs-versioned rule as `topAgents`, per day, so no day double-counts a product.
 */
const agentEntitiesForDay = (
  entities: Readonly<Record<string, { metrics: SpendMetrics }>>,
): Record<string, { metrics: SpendMetrics }> => {
  const rows: TagSummaryRow[] = Object.entries(entities).map(([tag, { metrics }]) => ({
    tag,
    total_spend: metrics.spend,
    total_tokens: metrics.total_tokens,
    total_requests: metrics.api_requests,
    successful_requests: metrics.successful_requests,
    failed_requests: metrics.failed_requests,
    unique_users: 0,
  }));
  return Object.fromEntries(
    topAgents(rows).map((agent) => [
      agent.label,
      {
        metrics: {
          spend: agent.spend,
          total_tokens: agent.tokens,
          api_requests: agent.requests,
          prompt_tokens: 0,
          completion_tokens: 0,
          successful_requests: 0,
          failed_requests: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    ]),
  );
};

/**
 * Tag daily activity with each day's raw tags folded into agents, written into `breakdown.models`
 * so `seriesBy(..., "models", ...)` stacks agents per day with no agent-specific chart code.
 */
export const agentDailyData = (days: readonly DailyData[]): DailyData[] =>
  days.map((day) => {
    const models = agentEntitiesForDay(day.breakdown.entities ?? {}) as DailyData["breakdown"]["models"];
    const agentTotal = (key: "spend" | "total_tokens" | "api_requests") =>
      Object.values(models).reduce((sum, entry) => sum + entry.metrics[key], 0);
    // The day total becomes the agents' own sum, so the chart's "Other" means agents past the top N,
    // not the untagged and non-agent traffic in the tag table's day total.
    return {
      ...day,
      metrics: {
        ...day.metrics,
        spend: agentTotal("spend"),
        total_tokens: agentTotal("total_tokens"),
        api_requests: agentTotal("api_requests"),
      },
      breakdown: { ...day.breakdown, models },
    };
  });
