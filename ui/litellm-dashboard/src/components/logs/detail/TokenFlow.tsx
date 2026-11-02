"use client";
import { LocalizedText, getIntlLocale, useUiLocale } from "@/lib/i18n";
interface TokenFlowProps {
  prompt?: number;
  completion?: number;
  total?: number;
}

/**
 * Displays token usage in LiteLLM format: "12 (9 prompt tokens + 3 completion tokens)"
 * Shows total with breakdown of prompt and completion tokens.
 */
export function TokenFlow({ prompt = 0, completion = 0, total = 0 }: TokenFlowProps) {
  useUiLocale();
  return (
    <span>
      {total.toLocaleString(getIntlLocale())} ({prompt.toLocaleString(getIntlLocale())}
      <LocalizedText text={" prompt tokens + "} />
      {completion.toLocaleString(getIntlLocale())}
      <LocalizedText text={" completion tokens)"} />
    </span>
  );
}
