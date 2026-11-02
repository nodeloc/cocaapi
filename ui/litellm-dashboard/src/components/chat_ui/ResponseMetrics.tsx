"use client";
import { localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Database,
  DatabaseBackup,
  DollarSign,
  Hash,
  History,
  Lightbulb,
  Wrench,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PROMPT_CACHE_CREATION_TOOLTIP, PROMPT_CACHE_READ_TOOLTIP } from "@/utils/promptCacheUsage";

const RESPONSE_CACHE_TOOLTIP =
  "This response was replayed from LiteLLM's response cache. The request never reached the provider, so it did not read from or write to the provider's own prompt cache.";

export interface TokenUsage {
  completionTokens?: number;
  promptTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  cost?: number;
  servedFromResponseCache?: boolean;
}

interface ResponseMetricsProps {
  timeToFirstToken?: number;
  totalLatency?: number;
  usage?: TokenUsage;
  toolName?: string;
}

interface MetricItemProps {
  label: string;
  tooltip: string;
  icon: React.ReactNode;
  value: string;
}

function MetricItem(cocaCopyProps0: MetricItemProps) {
  const { label, tooltip, icon, value } = cocaCopyProps0;
  useUiLocale();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="flex items-center gap-1"
            aria-label={`${localizedProperty(cocaCopyProps0, "label", label)}: ${value}`}
          />
        }
      >
        {icon}
        <span>
          {localizedProperty(cocaCopyProps0, "label", label)}: {value}
        </span>
      </TooltipTrigger>
      <TooltipContent>{localizedProperty(cocaCopyProps0, "tooltip", tooltip)}</TooltipContent>
    </Tooltip>
  );
}

function ResponseCacheIndicator() {
  useUiLocale();
  return (
    <MetricItem
      label={translateMessage("Response Cache")}
      tooltip={RESPONSE_CACHE_TOOLTIP}
      icon={<History className="size-3" aria-hidden="true" />}
      value="Hit"
    />
  );
}

function PromptCacheChips({ usage }: { usage?: TokenUsage }) {
  useUiLocale();
  if (usage?.servedFromResponseCache) {
    return <ResponseCacheIndicator />;
  }

  const readTokens = usage?.cacheReadTokens ?? 0;
  const creationTokens = usage?.cacheCreationTokens ?? 0;

  return (
    <>
      {readTokens > 0 && (
        <MetricItem
          label={translateMessage("Cache Read")}
          tooltip={PROMPT_CACHE_READ_TOOLTIP}
          icon={<Database className="size-3" aria-hidden="true" />}
          value={String(readTokens)}
        />
      )}

      {creationTokens > 0 && (
        <MetricItem
          label={translateMessage("Cache Write")}
          tooltip={PROMPT_CACHE_CREATION_TOOLTIP}
          icon={<DatabaseBackup className="size-3" aria-hidden="true" />}
          value={String(creationTokens)}
        />
      )}
    </>
  );
}

const ResponseMetrics: React.FC<ResponseMetricsProps> = ({ timeToFirstToken, totalLatency, usage, toolName }) => {
  useUiLocale();
  if (!timeToFirstToken && !totalLatency && !usage) return null;

  return (
    <div className="response-metrics mt-2 flex flex-wrap gap-3 border-t border-border pt-2 text-xs text-muted-foreground">
      {timeToFirstToken !== undefined && (
        <MetricItem
          label={translateMessage("TTFT")}
          tooltip={translateMessage("Time to first token")}
          icon={<Clock className="size-3" aria-hidden="true" />}
          value={`${(timeToFirstToken / 1000).toFixed(2)}s`}
        />
      )}

      {totalLatency !== undefined && (
        <MetricItem
          label={translateMessage("Total Latency")}
          tooltip={translateMessage("Total latency")}
          icon={<Clock className="size-3" aria-hidden="true" />}
          value={`${(totalLatency / 1000).toFixed(2)}s`}
        />
      )}

      {usage?.promptTokens !== undefined && (
        <MetricItem
          label={translateMessage("In")}
          tooltip={translateMessage("Prompt tokens")}
          icon={<ArrowDownToLine className="size-3" aria-hidden="true" />}
          value={String(usage.promptTokens)}
        />
      )}

      <PromptCacheChips usage={usage} />

      {usage?.completionTokens !== undefined && (
        <MetricItem
          label={translateMessage("Out")}
          tooltip={translateMessage("Completion tokens")}
          icon={<ArrowUpFromLine className="size-3" aria-hidden="true" />}
          value={String(usage.completionTokens)}
        />
      )}

      {usage?.reasoningTokens !== undefined && (
        <MetricItem
          label={translateMessage("Reasoning")}
          tooltip={translateMessage("Reasoning tokens")}
          icon={<Lightbulb className="size-3" aria-hidden="true" />}
          value={String(usage.reasoningTokens)}
        />
      )}

      {usage?.totalTokens !== undefined && (
        <MetricItem
          label={translateMessage("Total")}
          tooltip={translateMessage("Total tokens")}
          icon={<Hash className="size-3" aria-hidden="true" />}
          value={String(usage.totalTokens)}
        />
      )}

      {typeof usage?.cost === "number" && Number.isFinite(usage.cost) && (
        <MetricItem
          label={translateMessage("Cost")}
          tooltip={translateMessage("Cost")}
          icon={<DollarSign className="size-3" aria-hidden="true" />}
          value={`$${usage.cost.toFixed(6)}`}
        />
      )}

      {toolName && (
        <MetricItem
          label={translateMessage("Tool")}
          tooltip={translateMessage("Tool used")}
          icon={<Wrench className="size-3" aria-hidden="true" />}
          value={toolName}
        />
      )}
    </div>
  );
};

export default ResponseMetrics;
