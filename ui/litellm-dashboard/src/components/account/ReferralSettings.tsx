"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { isProxyAdminRole } from "@/utils/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommercePage } from "./CommercePage";
import { AccountNotice } from "./AccountShell";
import { referralApi, type ReferralPage, type ReferralSettingsView } from "./referralApi";
import { ReferralTable } from "./ReferralTable";
import { Pager } from "./WalletTables";
import { formatCredits } from "./money";

export default function ReferralSettings() {
  useUiLocale();
  const { accessToken, userRole, isAuthorized, isViewOnly } = useAuthorized();
  const allowed = isAuthorized && !isViewOnly && isProxyAdminRole(userRole);
  const [settings, setSettings] = useState<ReferralSettingsView | null>(null);
  const [records, setRecords] = useState<ReferralPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [inviter, setInviter] = useState("0.00");
  const [invitee, setInvitee] = useState("0.00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const accept = useCallback((value: ReferralSettingsView) => {
    setSettings(value);
    setEnabled(value.enabled);
    setInviter(formatCredits(value.inviter_units ?? "0").slice(1));
    setInvitee(formatCredits(value.invitee_units ?? "0").slice(1));
  }, []);
  const showError = (cause: unknown) =>
    setError(
      cause instanceof Error
        ? localizedProperty(cause, "message", cause.message)
        : translateMessage("邀请活动请求失败，请稍后重试。"),
    );
  useEffect(() => {
    let active = true;
    if (accessToken && allowed)
      void referralApi
        .settings(accessToken)
        .then((value) => {
          if (active) accept(value);
        })
        .catch((cause) => {
          if (active) showError(cause);
        });
    return () => {
      active = false;
    };
  }, [accessToken, allowed, accept]);
  useEffect(() => {
    let active = true;
    if (accessToken && allowed)
      void referralApi
        .records(accessToken, offset)
        .then((value) => {
          if (active) setRecords(value);
        })
        .catch((cause) => {
          if (active) showError(cause);
        });
    return () => {
      active = false;
    };
  }, [accessToken, allowed, offset]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken || !settings || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      accept(
        await referralApi.save(accessToken, {
          revision: settings.revision,
          enabled,
          inviter_amount_usd: inviter.trim(),
          invitee_amount_usd: invitee.trim(),
        }),
      );
      setMessage(translateMessage("邀请有礼设置已保存。"));
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  };
  const reload = async () => {
    if (!accessToken || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      accept(await referralApi.settings(accessToken));
      setRecords(await referralApi.records(accessToken, offset));
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  };
  if (!allowed)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        <LocalizedText text="仅完整代理管理员可以配置邀请有礼。" />
      </div>
    );
  return (
    <CommercePage section="referrals">
      <AccountNotice error={error} message={message} />
      {!settings && !error && (
        <p role="status">
          <LocalizedText text="正在加载邀请活动配置…" />
        </p>
      )}
      {settings && (
        <form onSubmit={save} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>
                  <LocalizedText text="邀请奖励设置" />
                </h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="referrals-enabled"
                  checked={enabled}
                  disabled={busy}
                  onCheckedChange={(checked) => setEnabled(checked === true)}
                />
                <Label htmlFor="referrals-enabled">
                  <LocalizedText text="启用邀请有礼" />
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                <LocalizedText text="新用户完成邮箱验证或 OAuth 注册后，双方各获得一次额度。默认关闭。" />
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="referral-inviter">
                    <LocalizedText text="邀请人奖励（USD）" />
                  </Label>
                  <Input
                    id="referral-inviter"
                    value={inviter}
                    inputMode="decimal"
                    required
                    maxLength={16}
                    pattern="[0-9]+(\.[0-9]{1,2})?"
                    disabled={busy}
                    onChange={(event) => setInviter(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="referral-invitee">
                    <LocalizedText text="受邀人奖励（USD）" />
                  </Label>
                  <Input
                    id="referral-invitee"
                    value={invitee}
                    inputMode="decimal"
                    required
                    maxLength={16}
                    pattern="[0-9]+(\.[0-9]{1,2})?"
                    disabled={busy}
                    onChange={(event) => setInvitee(event.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                <LocalizedText text="奖励金额以注册时配置为准。关闭后新注册不计奖，已记录的待验证邀请仍按原规则发放。" />
              </p>
              <p className="text-xs text-muted-foreground">
                <LocalizedText text="奖励直接进入 USD 额度余额，保留原有余额检查和 API 扣费规则。" />
              </p>
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}>
              <LocalizedText text="保存设置" />
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={reload}>
              <LocalizedText text="重新加载" />
            </Button>
          </div>
        </form>
      )}
      {records && (
        <section className="space-y-3" aria-labelledby="admin-referral-records">
          <h2 id="admin-referral-records" className="text-base font-medium">
            <LocalizedText text="邀请记录" />
          </h2>
          <ReferralTable items={records.items} admin />
          <Pager offset={offset} hasMore={records.has_more} busy={busy} onPage={setOffset} />
        </section>
      )}
    </CommercePage>
  );
}
