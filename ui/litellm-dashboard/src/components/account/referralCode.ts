const storageKey = "cocaapi.referral";
const valid = (value: string | null): value is string => value !== null && /^[A-Za-z0-9_-]{16,64}$/.test(value);

export function rememberReferral(): string | undefined {
  const incoming = new URLSearchParams(window.location.search).get("ref");
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (valid(stored)) return stored;
    if (valid(incoming)) {
      sessionStorage.setItem(storageKey, incoming);
      return incoming;
    }
  } catch {
    return valid(incoming) ? incoming : undefined;
  }
  return undefined;
}

export function clearReferral(): void {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {}
}
