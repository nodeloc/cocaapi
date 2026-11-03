"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/app/(dashboard)/usage/_components/components/overview/Primitives";
import { AccountRequestError } from "./accountApi";
import { AccountNotice } from "./AccountShell";
import { AccountDashboardShell } from "./AccountDashboardShell";
import { CustomerSessionBoundary } from "./native/CustomerSessionProvider";
import type { CustomerSession } from "./native/CustomerSessionContext";
import { referralApi, type ReferralOverview } from "./referralApi";
import { ReferralTable } from "./ReferralTable";
import { Pager } from "./WalletTables";
import { formatCredits } from "./money";

export default function AccountReferrals() {
  return <CustomerSessionBoundary>{(session) => <Content session={session} />}</CustomerSessionBoundary>;
}

function Content({ session }: { session: CustomerSession }) {
  useUiLocale();
  const { replace } = useRouter();
  const { profile, clearSession } = session;
  const [data, setData] = useState<ReferralOverview | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const showError = useCallback(
    (cause: unknown) => {
      if (cause instanceof AccountRequestError && cause.status === 401) {
        clearSession();
        replace("/account/login/");
        return;
      }
      setError(
        cause instanceof Error
          ? localizedProperty(cause, "message", cause.message)
          : translateMessage("邀请活动请求失败，请稍后重试。"),
      );
    },
    [clearSession, replace],
  );
  const load = useCallback(async () => setData(await referralApi.overview(offset)), [offset]);
  useEffect(() => {
    let active = true;
    void referralApi
      .overview(offset)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause) => {
        if (active) showError(cause);
      });
    return () => {
      active = false;
    };
  }, [offset, profile?.user_id, showError]);
  const generate = async () => {
    if (!profile || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await referralApi.issue(profile.csrf_token);
      await load();
      setMessage(translateMessage("邀请链接已生成。"));
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  };
  const copyLink = async () => {
    if (!data?.invite_url) return;
    try {
      await navigator.clipboard.writeText(data.invite_url);
      setMessage(translateMessage("邀请链接已复制。"));
    } catch {
      setError(translateMessage("无法复制，请手动复制邀请链接。"));
    }
  };
  return (
    <AccountDashboardShell
      title={translateMessage("邀请有礼")}
      description={translateMessage("分享邀请链接，查看邀请记录和奖励额度")}
      profile={profile}
    >
      <AccountNotice error={error} message={message} />
      {!data && !error && (
        <p role="status">
          <LocalizedText text="正在加载邀请记录…" />
        </p>
      )}
      {data && (
        <>
          <div className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-3 sm:divide-x">
            <div className="px-5 py-4">
              <Stat label={translateMessage("邀请人数")} value={String(data.invited_count)} size="lg" />
            </div>
            <div className="px-5 py-4">
              <Stat label={translateMessage("已获邀请奖励")} value={formatCredits(data.earned_units)} size="lg" />
            </div>
            <div className="px-5 py-4">
              <Stat label={translateMessage("受邀注册奖励")} value={formatCredits(data.signup_bonus_units)} size="lg" />
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>
                  <LocalizedText text="我的邀请链接" />
                </h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {data.enabled
                  ? translateMessage("新用户完成注册和身份验证后，你获得 %{0}，受邀用户获得 %{1}。", [
                      formatCredits(data.inviter_units),
                      formatCredits(data.invitee_units),
                    ])
                  : translateMessage("邀请奖励活动暂未开启，当前新注册不发放奖励。")}
              </p>
              {data.invite_url ? (
                <div className="space-y-2">
                  <Label htmlFor="referral-link">
                    <LocalizedText text="邀请链接" />
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="referral-link"
                      readOnly
                      value={data.invite_url}
                      className="min-w-0 flex-1 font-mono text-xs"
                    />
                    <Button type="button" variant="outline" onClick={copyLink}>
                      <LocalizedText text="复制链接" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" disabled={busy || !data.eligible} onClick={generate}>
                  <LocalizedText text="生成邀请链接" />
                </Button>
              )}
              {!data.eligible && (
                <p className="text-sm text-muted-foreground">
                  <LocalizedText text="请先验证邮箱或通过第三方账号完成身份验证。" />
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                <LocalizedText text="仅新注册账号可绑定邀请，每个账号只奖励一次。奖励规则以注册时活动配置为准，到账后可用于 API 调用。" />
              </p>
            </CardContent>
          </Card>
          <section className="space-y-3" aria-labelledby="referral-records-heading">
            <h2 id="referral-records-heading" className="text-base font-medium">
              <LocalizedText text="邀请记录" />
            </h2>
            <ReferralTable items={data.items} />
            <Pager offset={offset} hasMore={data.has_more} busy={busy} onPage={setOffset} />
          </section>
        </>
      )}
    </AccountDashboardShell>
  );
}
