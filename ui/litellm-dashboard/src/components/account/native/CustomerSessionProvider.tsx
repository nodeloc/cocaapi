"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bindCustomerApiOrigin } from "@/components/networking";
import { registerCustomerTransport, type CustomerTransport } from "@/lib/http/customerTransport";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { accountApi, AccountRequestError, type Profile } from "../accountApi";
import { AccountDashboardShell } from "../AccountDashboardShell";
import { AccountNotice } from "../AccountShell";
import { CustomerNativeContext } from "./CustomerNativeContext";
import { CustomerSessionContext, useCustomerSession, type CustomerSession } from "./CustomerSessionContext";
import { createCustomerTransport } from "./customerNativeRequest";

export function CustomerSessionProvider({ children }: { children: ReactNode }) {
  useUiLocale();
  const { replace } = useRouter();
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [transport, setTransport] = useState<CustomerTransport | null>(null);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const active = useRef(false);
  const release = useRef<(() => void) | null>(null);
  const identity = useRef<string | null>(null);
  const pending = useRef<Promise<Profile> | null>(null);
  const revalidateSession = useRef<(() => Promise<Profile>) | null>(null);
  const generation = useRef(0);

  const releaseSession = useCallback(() => {
    generation.current++;
    pending.current = null;
    release.current?.();
    release.current = null;
    identity.current = null;
    client.clear();
  }, [client]);

  const clearSession = useCallback(() => {
    releaseSession();
    setTransport(null);
  }, [releaseSession]);

  const refreshProfile = useCallback((): Promise<Profile> => {
    if (pending.current) return pending.current;
    const version = generation.current;
    const request = accountApi
      .profile()
      .then((profile) => {
        if (!active.current || version !== generation.current) return profile;
        if (identity.current !== profile.user_id) client.clear();
        release.current?.();
        const transportVersion = ++generation.current;
        const base = createCustomerTransport(profile);
        const next: CustomerTransport = {
          ...base,
          request: async (request) => {
            const response = await base.request(request);
            if (response.status === 401 && active.current && transportVersion === generation.current) {
              await revalidateSession.current?.().catch(() => undefined);
            }
            return response;
          },
        };
        const unregister = registerCustomerTransport(next);
        const restoreOrigin = bindCustomerApiOrigin();
        release.current = () => {
          unregister();
          restoreOrigin();
        };
        identity.current = profile.user_id;
        setTransport(next);
        setError("");
        return profile;
      })
      .catch((cause: unknown) => {
        if (active.current && version === generation.current) {
          if (cause instanceof AccountRequestError && cause.status === 401) {
            clearSession();
            replace("/account/login/");
          } else {
            setError(
              cause instanceof Error
                ? localizedProperty(cause, "message", cause.message)
                : translateMessage("无法加载账号。"),
            );
          }
        }
        throw cause;
      })
      .finally(() => {
        if (pending.current === request) pending.current = null;
      });
    pending.current = request;
    return request;
  }, [clearSession, client, replace]);

  useEffect(() => {
    active.current = true;
    revalidateSession.current = refreshProfile;
    const revalidate = () => {
      void refreshProfile().catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    revalidate();
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active.current = false;
      revalidateSession.current = null;
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", onVisible);
      releaseSession();
    };
  }, [refreshProfile, releaseSession]);

  if (!transport)
    return (
      <AccountDashboardShell title={translateMessage("用户中心")} description="" profile={null}>
        <AccountNotice error={error} message="" />
        {error ? (
          <Button
            onClick={() => {
              void refreshProfile().catch(() => undefined);
            }}
          >
            <LocalizedText text="刷新" />
          </Button>
        ) : (
          <p role="status">
            <LocalizedText text="正在加载…" />
          </p>
        )}
      </AccountDashboardShell>
    );

  return (
    <CustomerSessionContext.Provider
      value={{ profile: transport.profile, refreshProfile, clearSession, collapsed, setCollapsed }}
    >
      <CustomerNativeContext.Provider value={transport}>
        <QueryClientProvider client={client}>
          <div key={transport.profile.user_id} className="contents">
            {children}
          </div>
        </QueryClientProvider>
      </CustomerNativeContext.Provider>
    </CustomerSessionContext.Provider>
  );
}

export function CustomerSessionBoundary({ children }: { children: (session: CustomerSession) => ReactNode }) {
  const session = useCustomerSession();
  if (session) return children(session);
  return (
    <CustomerSessionProvider>
      <CustomerSessionBoundary>{children}</CustomerSessionBoundary>
    </CustomerSessionProvider>
  );
}
