"use client";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { accountApi, AccountRequestError } from "../accountApi";
import { AccountDashboardShell } from "../AccountDashboardShell";
import { AccountNotice } from "../AccountShell";
import { CustomerNativeContext } from "./CustomerNativeContext";
import { createCustomerTransport } from "./customerNativeRequest";
import { registerCustomerTransport, type CustomerTransport } from "@/lib/http/customerTransport";
import { bindCustomerApiOrigin } from "@/components/networking";

export default function CustomerNativePage(cocaCopyProps0: { title: string; children: ReactNode }) {
  const { title, children } = cocaCopyProps0;
  useUiLocale();
  const [session, setSession] = useState<CustomerTransport | null>(null);
  const [error, setError] = useState("");
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
  const router = useRouter();
  useEffect(() => {
    let active = true;
    let release: (() => void) | undefined;
    accountApi
      .profile()
      .then((profile) => {
        if (!active) return;
        const transport = createCustomerTransport(profile);
        const releaseTransport = registerCustomerTransport(transport);
        const restoreOrigin = bindCustomerApiOrigin();
        release = () => {
          releaseTransport();
          restoreOrigin();
        };
        setSession(transport);
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof AccountRequestError && cause.status === 401) router.replace("/account/login/");
        else
          setError(
            cause instanceof Error
              ? localizedProperty(cause, "message", cause.message)
              : translateMessage("无法加载账号。"),
          );
      });
    return () => {
      active = false;
      release?.();
      client.clear();
    };
  }, [router, client]);
  return (
    <AccountDashboardShell
      title={localizedProperty(cocaCopyProps0, "title", title)}
      description=""
      profile={session?.profile ?? null}
      nativeContent
    >
      <AccountNotice error={error} message="" />
      {session ? (
        <CustomerNativeContext.Provider value={session}>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </CustomerNativeContext.Provider>
      ) : (
        !error && (
          <p role="status">
            <LocalizedText text={"正在加载…"} />
          </p>
        )
      )}
    </AccountDashboardShell>
  );
}
