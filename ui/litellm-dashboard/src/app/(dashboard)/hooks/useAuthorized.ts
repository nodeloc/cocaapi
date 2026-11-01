"use client";

import { getProxyBaseUrl } from "@/components/networking";
import { clearTokenCookies, getCookie } from "@/utils/cookieUtils";
import { checkTokenValidity, decodeToken } from "@/utils/jwtUtils";
import { buildLoginUrlWithReturn, getLoginUrl, storeReturnUrl } from "@/utils/returnUrlUtils";
import { useCallback, useEffect, useMemo } from "react";
import { effectiveSessionRole, formatUserRole, isViewOnlySessionRole } from "@/utils/roles";
import { useUIConfig } from "./uiConfig/useUIConfig";
import { useCustomerNative } from "@/components/account/native/CustomerNativeContext";

const useAuthorized = () => {
  const customer = useCustomerNative();
  const { data: uiConfig, isLoading: isUIConfigLoading } = useUIConfig();

  const token = !customer && typeof document !== "undefined" ? getCookie("token") : null;

  const decoded = useMemo(() => decodeToken(token), [token]);
  const isTokenValid = useMemo(() => checkTokenValidity(token), [token]);
  const isLoading = isUIConfigLoading;
  const isAuthorized = isTokenValid && !uiConfig?.admin_ui_disabled;

  // Helper function to redirect to login while preserving the current URL
  const redirectToLogin = useCallback(() => {
    storeReturnUrl();
    const baseLoginUrl = getLoginUrl(getProxyBaseUrl());
    const loginUrlWithReturn = buildLoginUrlWithReturn(baseLoginUrl);
    window.location.replace(loginUrlWithReturn);
  }, []);

  // Single useEffect for all redirect logic
  useEffect(() => {
    if (customer) return;
    if (isLoading) return;

    if (!isAuthorized) {
      if (token) {
        clearTokenCookies();
      }
      redirectToLogin();
    }
  }, [isLoading, isAuthorized, token, redirectToLogin, customer]);

  if (customer)
    return {
      isLoading: false,
      isAuthorized: true,
      token: customer.marker,
      accessToken: customer.marker,
      userId: customer.profile.user_id,
      userEmail: customer.profile.email,
      userRole: "Internal User",
      userRoleLabel: "Internal User",
      isViewOnly: false,
      premiumUser: false,
      disabledPersonalKeyCreation: false,
      loginMethod: "customer",
      showSSOBanner: false,
      passwordResetRequired: false,
    };
  return {
    isLoading,
    isAuthorized,
    token: isAuthorized ? token : null,
    accessToken: decoded?.key ?? null,
    userId: decoded?.user_id ?? null,
    userEmail: decoded?.user_email ?? null,
    userRole: effectiveSessionRole(decoded?.user_role),
    userRoleLabel: formatUserRole(decoded?.user_role),
    isViewOnly: isViewOnlySessionRole(decoded?.user_role),
    premiumUser: decoded?.premium_user ?? null,
    disabledPersonalKeyCreation: decoded?.disabled_non_admin_personal_key_creation ?? null,
    loginMethod: decoded?.login_method ?? null,
    showSSOBanner: decoded?.login_method === "username_password",
    passwordResetRequired: decoded?.password_reset_required === true,
  };
};

export default useAuthorized;
