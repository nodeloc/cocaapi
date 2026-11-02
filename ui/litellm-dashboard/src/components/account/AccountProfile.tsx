"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { accountApi, AccountRequestError, type Methods, type Profile, type Provider } from "./accountApi";
import { AccountNotice } from "./AccountShell";
import { AccountDashboardShell } from "./AccountDashboardShell";
import { CustomerSessionBoundary } from "./native/CustomerSessionProvider";
import type { CustomerSession } from "./native/CustomerSessionContext";

function canEditSecurity(profile: Profile | null, busy: boolean, requireVerified = true) {
  if (!profile) return false;
  const emailAllowed = !requireVerified || profile.email_verified;
  return !busy && !profile.reauthentication_required && emailAllowed;
}

export default function AccountProfile({ security = false }: { security?: boolean }) {
  return (
    <CustomerSessionBoundary>
      {(session) => <AccountProfileContent security={security} session={session} />}
    </CustomerSessionBoundary>
  );
}

function AccountProfileContent({ security, session }: { security: boolean; session: CustomerSession }) {
  useUiLocale();
  const { replace } = useRouter();
  const { profile, refreshProfile, clearSession } = session;
  const [methods, setMethods] = useState<Methods | null>(null);
  const [email, setEmail] = useState(profile.email ?? "");
  const [password, setPassword] = useState("");
  const [current, setCurrent] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const showError = useCallback(
    (reason: unknown) => {
      if (reason instanceof AccountRequestError && reason.status === 401) {
        clearSession();
        replace("/account/login/");
        return;
      }
      setError(
        reason instanceof Error
          ? localizedProperty(reason, "message", reason.message)
          : translateMessage("无法加载账号。"),
      );
    },
    [replace, clearSession],
  );
  const refresh = useCallback(async () => {
    const [account, options] = await Promise.all([refreshProfile(), accountApi.methods()]);
    setMethods(options);
    setEmail(account.email ?? "");
  }, [refreshProfile]);
  useEffect(() => {
    let active = true;
    accountApi
      .methods()
      .then((options) => {
        if (!active) return;
        setMethods(options);
      })
      .catch((reason) => {
        if (active) showError(reason);
      });
    return () => {
      active = false;
    };
  }, [showError]);

  const run = async (action: () => Promise<unknown>, success = "已保存。") => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      await refresh();
    } catch (reason) {
      showError(reason);
    } finally {
      setBusy(false);
    }
  };
  const oauth = async (provider: Provider, intent: "link" | "reauth") => {
    if (!profile) return;
    await run(async () => {
      const result = await accountApi.oauth(provider.id, profile.csrf_token, intent);
      window.location.assign(result.authorization_url);
    });
  };
  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    if (password !== confirmation) {
      setError(translateMessage("两次输入的密码不一致。"));
      return;
    }
    await run(async () => {
      await accountApi.password(password, profile.has_password ? current : undefined, profile.csrf_token);
      replace("/account/login/");
    });
  };

  const securityDisabled = !canEditSecurity(profile, busy);
  const emailDisabled = !canEditSecurity(profile, busy, false);
  return (
    <AccountDashboardShell
      title={security ? translateMessage("安全设置") : translateMessage("我的账号")}
      description={
        security
          ? translateMessage("管理密码、第三方登录与账号绑定")
          : translateMessage("查看账号信息，管理 API 接入、余额和充值记录")
      }
      profile={profile}
    >
      <AccountNotice error={error} message={message} />
      {!profile && !error && (
        <p role="status" className="text-center text-muted-foreground">
          <LocalizedText text={"正在加载账号…"} />
        </p>
      )}
      {profile && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>
                  <LocalizedText text={"账号信息"} />
                </h2>
              </CardTitle>
              <CardDescription className="break-all">
                <LocalizedText text={"用户 ID："} />
                {profile.user_id}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 break-all">{profile.email ?? translateMessage("尚未填写邮箱")}</span>
                <Badge variant={profile.email_verified ? "default" : "secondary"}>
                  {profile.email_verified ? translateMessage("已验证") : translateMessage("待验证")}
                </Badge>
              </div>
              {!profile.email_verified && (
                <>
                  <p className="text-sm text-muted-foreground">
                    <LocalizedText text={"验证邮箱后，可以使用邮箱找回账号和设置密码。"} />
                  </p>
                  {methods?.email_enabled && (
                    <form
                      className="space-y-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        run(() => accountApi.email(email, profile.csrf_token), "验证邮件已安排发送，请检查收件箱。");
                      }}
                    >
                      <Label htmlFor="profile-email">
                        <LocalizedText text={"邮箱地址"} />
                      </Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="profile-email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          disabled={emailDisabled}
                        />
                        <Button type="submit" variant="outline" disabled={emailDisabled}>
                          <LocalizedText text={"发送验证邮件"} />
                        </Button>
                      </div>
                    </form>
                  )}
                  {!methods?.email_enabled && (
                    <p className="text-sm text-muted-foreground">
                      <LocalizedText text={"邮件验证将在邮件服务配置后开放。"} />
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          {!security && (
            <div className="grid gap-4 md:grid-cols-3">
              {[
                markUiCopy(
                  { title: "余额与充值", href: "/account/wallet/", description: "查看可用额度、兑换码和余额明细" },
                  { title: "余额与充值", description: "查看可用额度、兑换码和余额明细" },
                ),
                markUiCopy(
                  { title: "充值订单", href: "/account/orders/", description: "查看充值记录和订单状态" },
                  { title: "充值订单", description: "查看充值记录和订单状态" },
                ),
                markUiCopy(
                  {
                    title: "安全设置",
                    href: "/account/security/",
                    description: translateMessage("%{0} 个第三方账号已绑定，%{1}", [
                      profile.bindings.length,
                      translateMessage(profile.has_password ? "已设置密码" : "尚未设置密码"),
                    ]),
                  },
                  { title: "安全设置" },
                ),
              ].map((item) => (
                <Card key={item.href}>
                  <CardContent className="space-y-2">
                    <Link href={item.href} className="font-semibold underline-offset-4 hover:underline">
                      {localizedProperty(item, "title", item.title)}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {localizedProperty(item, "description", item.description)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {security && (
            <div className="grid items-start gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2 className="flex items-center gap-2">
                      <ShieldCheck className="size-4" />
                      <LocalizedText text={"第三方登录"} />
                    </h2>
                  </CardTitle>
                  <CardDescription>
                    <LocalizedText text={"将不同平台绑定到同一个账号。请保留至少一种可用登录方式。"} />
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {profile.reauthentication_required && (
                    <p className="text-sm text-muted-foreground">
                      <LocalizedText text={"修改安全设置前，请"} />
                      <a className="underline underline-offset-4" href="/account/login/">
                        <LocalizedText text={"重新登录"} />
                      </a>
                      <LocalizedText text={"，或使用已绑定的平台验证身份。"} />
                    </p>
                  )}
                  {methods?.providers.map((provider) => {
                    const binding = profile.bindings.find((item) => item.provider === provider.id);
                    return (
                      <div
                        key={provider.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div>
                          <p className="font-medium text-sm">{localizedProperty(provider, "label", provider.label)}</p>
                          <p className="text-xs text-muted-foreground">
                            {binding
                              ? translateMessage("已绑定%{0}", [binding.name ? ` · ${binding.name}` : ""])
                              : translateMessage("尚未绑定")}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {binding ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => oauth(provider, "reauth")}
                              >
                                <LocalizedText text={"验证身份"} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={securityDisabled}
                                onClick={() =>
                                  run(() => accountApi.unlink(binding.id, profile.csrf_token), "已解除绑定。")
                                }
                              >
                                <LocalizedText text={"解除绑定"} />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={securityDisabled}
                              onClick={() => oauth(provider, "link")}
                            >
                              <LocalizedText text={"绑定账号"} />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {methods?.providers.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      <LocalizedText text={"第三方登录将在平台配置完成后开放。"} />
                    </p>
                  )}
                  {profile.bindings
                    .filter((binding) => !methods?.providers.some((provider) => provider.id === binding.provider))
                    .map((binding) => (
                      <p key={binding.id} className="text-sm text-muted-foreground">
                        {binding.provider}
                        <LocalizedText text={" 已绑定，该平台暂不可用。"} />
                      </p>
                    ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>{profile.has_password ? translateMessage("修改密码") : translateMessage("设置密码")}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!profile.email_verified && (
                    <p className="text-sm text-muted-foreground">
                      <LocalizedText text={"请先验证邮箱，再设置或修改密码。"} />
                    </p>
                  )}
                  <form onSubmit={savePassword} className="space-y-3">
                    <fieldset disabled={securityDisabled} className="space-y-3">
                      {profile.has_password && (
                        <div className="space-y-2">
                          <Label htmlFor="current-password">
                            <LocalizedText text={"当前密码"} />
                          </Label>
                          <PasswordInput
                            id="current-password"
                            autoComplete="current-password"
                            required
                            value={current}
                            onChange={(event) => setCurrent(event.target.value)}
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="new-password">
                          <LocalizedText text={"新密码"} />
                        </Label>
                        <PasswordInput
                          id="new-password"
                          autoComplete="new-password"
                          minLength={12}
                          maxLength={256}
                          required
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          <LocalizedText text={"至少 12 个字符，修改后会退出所有设备。"} />
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">
                          <LocalizedText text={"确认新密码"} />
                        </Label>
                        <PasswordInput
                          id="confirm-password"
                          autoComplete="new-password"
                          minLength={12}
                          maxLength={256}
                          required
                          value={confirmation}
                          onChange={(event) => setConfirmation(event.target.value)}
                        />
                      </div>
                      <Button type="submit" disabled={securityDisabled}>
                        {busy && <Loader2 className="animate-spin" />}
                        <LocalizedText text={"保存密码"} />
                      </Button>
                    </fieldset>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </AccountDashboardShell>
  );
}
