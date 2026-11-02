"use client";

import { translateMessage } from "./messages";
import { useUiLocale } from "./useUiLocale";

export function LocalizedText({ text, values }: { text: string; values?: readonly unknown[] }) {
  useUiLocale();
  return translateMessage(text, values);
}
