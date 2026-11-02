import zh from "./zh.json";
import en from "./en.json";
import { getUiLocale, type UiLocale } from "./locale";

const messages: Readonly<Record<UiLocale, Readonly<Record<string, string>>>> = { zh, en };

export function translateMessage(source: string, values: readonly unknown[] = []): string {
  const locale = getUiLocale();
  const normalized = source.replace(/\s+/g, " ").trim();
  const translated = locale && Object.hasOwn(messages[locale], normalized) ? messages[locale][normalized] : normalized;
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = normalized ? source.match(/\s*$/)?.[0] ?? "" : "";
  return `${leading}${translated}${trailing}`.replace(/%\{(\d+)\}/g, (token, position: string) =>
    Number(position) < values.length ? String(values[Number(position)]) : token,
  );
}
