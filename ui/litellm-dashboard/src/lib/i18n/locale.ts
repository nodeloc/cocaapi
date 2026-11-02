export type UiLocale = "zh" | "en";
export const localeStorageKey = "cocaapi.locale";
let current: UiLocale | null = null;
let providers = 0;
const listeners = new Set<() => void>();

function validLocale(value: string | null): UiLocale | null {
  return value === "zh" || value === "en" ? value : null;
}

function savedLocale(): UiLocale {
  try {
    const cookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("coca_locale="));
    const preferred = validLocale(cookie?.split("=")[1] ?? null);
    if (preferred) return preferred;
  } catch {}
  try {
    return validLocale(localStorage.getItem(localeStorageKey)) ?? "zh";
  } catch {
    return "zh";
  }
}

function updateLocale(locale: UiLocale | null): void {
  if (current === locale) return;
  current = locale;
  if (locale && typeof document !== "undefined") document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  listeners.forEach((listener) => listener());
}

function storageChanged(event: StorageEvent): void {
  const locale = validLocale(event.newValue);
  if (event.key === localeStorageKey && locale) updateLocale(locale);
}

export function activateLocale(): () => void {
  if (providers === 0) {
    updateLocale(savedLocale());
    window.addEventListener("storage", storageChanged);
  }
  providers += 1;
  return () => {
    providers -= 1;
    if (providers === 0) {
      window.removeEventListener("storage", storageChanged);
      updateLocale(null);
    }
  };
}

export function setUiLocale(locale: UiLocale): void {
  updateLocale(locale);
  try {
    localStorage.setItem(localeStorageKey, locale);
  } catch {}
  try {
    document.cookie = `coca_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {}
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUiLocale(): UiLocale | null {
  return current;
}
export function serverLocale(): null {
  return null;
}
export function getIntlLocale(): string | undefined {
  if (current === "zh") return "zh-CN";
  if (current === "en") return "en-US";
  return undefined;
}
