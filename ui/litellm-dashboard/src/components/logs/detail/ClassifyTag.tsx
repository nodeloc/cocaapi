"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cva.config";

export const AUTOROUTER_CLASSIFIER_ORIGIN = "autorouter_classifier";

export function ClassifyTag({ origin, className }: { origin?: string | null; className?: string }) {
  useUiLocale();
  if (origin !== AUTOROUTER_CLASSIFIER_ORIGIN) return null;
  return (
    <Badge
      variant="secondary"
      title={translateMessage("Tier classification call made by the auto-router, not a request the caller sent")}
      className={cn("px-2 py-0 text-[10px] font-normal", className)}
    >
      <LocalizedText text={"Classify"} />
    </Badge>
  );
}
