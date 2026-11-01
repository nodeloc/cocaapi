"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { accountApi, AccountRequestError, type Profile } from "./accountApi";
import { AccountDashboardShell } from "./AccountDashboardShell";
import { AccountNotice } from "./AccountShell";
import { Card, CardContent } from "@/components/ui/card";

export function useGatewayPage<T>(load: () => Promise<T>) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const report = useCallback(
    (cause: unknown) => {
      if (cause instanceof AccountRequestError && cause.status === 401) {
        router.replace("/account/login/");
        return;
      }
      setError(cause instanceof Error ? cause.message : "无法加载，请稍后重试。");
    },
    [router],
  );
  useEffect(() => {
    let active = true;
    Promise.all([
      accountApi.profile().then((value) => {
        if (active) setProfile(value);
      }),
      load().then((value) => {
        if (active) setData(value);
      }),
    ])
      .catch((cause) => {
        if (active) report(cause);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load, revision, report]);
  const refresh = () => {
    setError("");
    setLoading(true);
    setRevision((value) => value + 1);
  };
  return { profile, data, error, loading, report, refresh };
}

export function GatewayFrame({
  title,
  description,
  page,
  children,
}: {
  title: string;
  description: string;
  page: { profile: Profile | null; error: string; loading: boolean };
  children: ReactNode;
}) {
  return (
    <AccountDashboardShell title={title} description={description} profile={page.profile}>
      <AccountNotice error={page.error} message="" />
      {page.loading && (
        <p role="status" className="text-sm text-muted-foreground">
          正在加载…
        </p>
      )}
      {children}
    </AccountDashboardShell>
  );
}

export function SummaryCards({ items }: { items: ReadonlyArray<{ label: string; value: string }> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="break-all text-2xl font-semibold tabular-nums">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export const usd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(value);
export const number = (value: number) => new Intl.NumberFormat("zh-CN").format(value);
export const when = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : "未设置");
