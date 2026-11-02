import { uiCopySource } from "./copy";
import { translateMessage } from "./messages";

export function localizedOption<T>(item: T): T {
  if (item === null || typeof item !== "object") return item;
  const source = uiCopySource(item, "label");
  const group = "items" in item && Array.isArray(item.items) ? item.items.map(localizedOption) : undefined;
  if (!source && !group) return item;
  return { ...item, ...(source ? { label: translateMessage(source) } : {}), ...(group ? { items: group } : {}) };
}
