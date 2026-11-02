"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import { pricingIssueUrl, totalUnits, type UsageUnits } from "./usageUnits";

export function UnpricedNote({ unpriced, provider }: { unpriced: UsageUnits; provider?: string }) {
  useUiLocale();
  const total = totalUnits(unpriced);
  if (total === 0) return null;
  const [noun, verb] = total === 1 ? ["unit", "is"] : ["units", "are"];
  return (
    <p className="text-xs text-warning">
      {translateMessage("%{0} %{1} with no known price %{2} left out of the cost. ", [
        total.toLocaleString(),
        noun,
        verb,
      ])}
      <a
        href={pricingIssueUrl(unpriced, provider)}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2"
      >
        <LocalizedText text={"Request pricing on GitHub"} />
      </a>
    </p>
  );
}
