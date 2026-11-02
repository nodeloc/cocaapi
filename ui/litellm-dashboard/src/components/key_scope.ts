import { markUiCopy } from "@/lib/i18n";
export interface KeyModelScope {
  hasModelAccess: boolean;
  label: string | null;
}

const MANAGEMENT_ROUTES_PRESET = "management_routes";
const INFO_ROUTES_PRESET = "info_routes";
const SCIM_ROUTE_PREFIX = "/scim";

const MANAGEMENT_SCOPE: KeyModelScope = markUiCopy(
  { hasModelAccess: false, label: "Management" },
  { label: "Management" },
);
const READ_ONLY_SCOPE: KeyModelScope = markUiCopy(
  { hasModelAccess: false, label: "Read-only" },
  { label: "Read-only" },
);
const SCIM_SCOPE: KeyModelScope = markUiCopy({ hasModelAccess: false, label: "SCIM" }, { label: "SCIM" });
const FULL_MODEL_ACCESS: KeyModelScope = { hasModelAccess: true, label: null };

const isScimRoute = (route: string): boolean => route.startsWith(SCIM_ROUTE_PREFIX);

const isOnlyPreset = (allowedRoutes: string[], preset: string): boolean =>
  allowedRoutes.length === 1 && allowedRoutes[0] === preset;

export const deriveKeyModelScope = (
  allowedRoutes: string[] | null | undefined,
  keyType?: string | null,
): KeyModelScope => {
  if (keyType === "management") {
    return MANAGEMENT_SCOPE;
  }

  if (keyType === "read_only") {
    return READ_ONLY_SCOPE;
  }

  if (!Array.isArray(allowedRoutes) || allowedRoutes.length === 0) {
    return FULL_MODEL_ACCESS;
  }

  if (allowedRoutes.every(isScimRoute)) {
    return SCIM_SCOPE;
  }

  if (isOnlyPreset(allowedRoutes, MANAGEMENT_ROUTES_PRESET)) {
    return MANAGEMENT_SCOPE;
  }

  if (isOnlyPreset(allowedRoutes, INFO_ROUTES_PRESET)) {
    return READ_ONLY_SCOPE;
  }

  return FULL_MODEL_ACCESS;
};
