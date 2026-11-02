"use client";
import { LocalizedText, useUiLocale } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { hasRouterSettings } from "./routerSettingsPayload";

interface RouterSettingsSummaryProps {
  routerSettings: Record<string, unknown> | null | undefined;
  emptyText?: string;
}

const fallbackEntries = (fallbacks: unknown): Array<[string, string[]]> => {
  if (!Array.isArray(fallbacks)) return [];
  return fallbacks.flatMap((entry) =>
    entry && typeof entry === "object" ? (Object.entries(entry) as Array<[string, string[]]>) : [],
  );
};

export default function RouterSettingsSummary({
  routerSettings,
  emptyText = "No router settings configured",
}: RouterSettingsSummaryProps) {
  useUiLocale();
  if (!hasRouterSettings(routerSettings)) {
    return <div className="text-muted-foreground">{emptyText}</div>;
  }

  const settings = routerSettings as Record<string, unknown>;
  const fallbacks = fallbackEntries(settings.fallbacks);

  return (
    <div className="space-y-1 text-sm">
      {settings.routing_strategy != null && (
        <div>
          <LocalizedText text={"Routing Strategy: "} />
          <Badge variant="secondary">{String(settings.routing_strategy)}</Badge>
        </div>
      )}
      {settings.num_retries != null && (
        <div>
          <LocalizedText text={"Number of Retries: "} />
          {String(settings.num_retries)}
        </div>
      )}
      {settings.allowed_fails != null && (
        <div>
          <LocalizedText text={"Allowed Failures: "} />
          {String(settings.allowed_fails)}
        </div>
      )}
      {settings.cooldown_time != null && (
        <div>
          <LocalizedText text={"Cooldown Time: "} />
          {String(settings.cooldown_time)}
          <LocalizedText text={"s"} />
        </div>
      )}
      {settings.timeout != null && (
        <div>
          <LocalizedText text={"Timeout: "} />
          {String(settings.timeout)}
          <LocalizedText text={"s"} />
        </div>
      )}
      {settings.retry_after != null && (
        <div>
          <LocalizedText text={"Retry After: "} />
          {String(settings.retry_after)}
          <LocalizedText text={"s"} />
        </div>
      )}
      {Boolean(settings.enable_tag_filtering) && (
        <div>
          <LocalizedText text={"Tag Filtering: Enabled"} />
        </div>
      )}
      {fallbacks.length > 0 && (
        <div>
          <div>
            <LocalizedText text={"Fallbacks:"} />
          </div>
          <div className="mt-1 space-y-1">
            {fallbacks.map(([model, targets]) => (
              <div key={model} className="text-xs text-muted-foreground">
                <span className="font-medium">{model}</span>
                <span className="mx-1 text-muted-foreground">-&gt;</span>
                {Array.isArray(targets) ? targets.join(", ") : String(targets)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
