"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { accountApi, AccountRequestError, type Methods, type Profile, type Provider } from "./accountApi";
import { AccountNotice, AccountShell } from "./AccountShell";

function canEditSecurity(profile: Profile | null, busy: boolean, requireVerified = true) {
  if (!profile) return false;
  const emailAllowed = !requireVerified || profile.email_verified;
  return !busy && !profile.reauthentication_required && emailAllowed;
}

export default function AccountProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [methods, setMethods] = useState<Methods | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [current, setCurrent] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const showError = useCallback(
    (reason: unknown) => {
      if (reason instanceof AccountRequestError && reason.status === 401) {
        router.replace("/account/login/");
        return;
      }
      setError(reason instanceof Error ? reason.message : "无法加载账号。");
    },
    [router],
  );
  const refresh = useCallback(async () => {
    const [account, options] = await Promise.all([accountApi.profile(), accountApi.methods()]);
    setProfile(account);
    setMethods(options);
    setEmail(account.email ?? "");
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([accountApi.profile(), accountApi.methods()])
      .then(([account, options]) => {
        if (!active) return;
        setProfile(account);
        setMethods(options);
        setEmail(account.email ?? "");
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
      setError("两次输入的密码不一致。");
      return;
    }
    await run(async () => {
      await accountApi.password(password, profile.has_password ? current : undefined, profile.csrf_token);
      router.replace("/account/login/");
    });
  };

  const securityDisabled = !canEditSecurity(profile, busy);
  const emailDisabled = !canEditSecurity(profile, busy, false);
  return (
    <AccountShell title="我的账号" description="管理邮箱、密码和第三方登录" wide>
      <nav aria-label="账号导航" className="flex justify-center gap-5 text-sm underline underline-offset-4">
        <a href="/account/profile/" aria-current="page">
          我的账号
        </a>
        <a href="/account/wallet/">余额与充值</a>
        <a href="/account/orders/">充值订单</a>
      </nav>
      <AccountNotice error={error} message={message} />
      {!profile && !error && (
        <p role="status" className="text-center text-muted-foreground">
          正在加载账号…
        </p>
      )}
      {profile && (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">账号信息</h2>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await accountApi.logout(profile.csrf_token);
                    router.replace("/account/login/");
                  })
                }
              >
                退出登录
              </Button>
            </div>
            <p className="text-xs text-muted-foreground break-all">用户 ID：{profile.user_id}</p>
            <div className="flex items-center gap-2 text-sm">
              <span>{profile.email ?? "尚未填写邮箱"}</span>
              <Badge variant={profile.email_verified ? "default" : "secondary"}>
                {profile.email_verified ? "已验证" : "待验证"}
              </Badge>
            </div>
            {!profile.email_verified && (
              <>
                <p className="text-sm text-muted-foreground">验证邮箱后，可以使用邮箱找回账号和设置密码。</p>
                {methods?.email_enabled && (
                  <form
                    className="space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(() => accountApi.email(email, profile.csrf_token), "验证邮件已安排发送，请检查收件箱。");
                    }}
                  >
                    <Label htmlFor="profile-email">邮箱地址</Label>
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
                        发送验证邮件
                      </Button>
                    </div>
                  </form>
                )}
                {!methods?.email_enabled && (
                  <p className="text-sm text-muted-foreground">邮件验证将在邮件服务配置后开放。</p>
                )}
              </>
            )}
          </section>
          <section className="border-t pt-5 space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="size-5" />
              第三方登录
            </h2>
            <p className="text-sm text-muted-foreground">将不同平台绑定到同一个账号。请保留至少一种可用登录方式。</p>
            {profile.reauthentication_required && (
              <p className="text-sm text-muted-foreground">
                修改安全设置前，请
                <a className="underline underline-offset-4" href="/account/login/">
                  重新登录
                </a>
                ，或使用已绑定的平台验证身份。
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
                    <p className="font-medium text-sm">{provider.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {binding ? `已绑定${binding.name ? ` · ${binding.name}` : ""}` : "尚未绑定"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {binding ? (
                      <>
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => oauth(provider, "reauth")}>
                          验证身份
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={securityDisabled}
                          onClick={() => run(() => accountApi.unlink(binding.id, profile.csrf_token), "已解除绑定。")}
                        >
                          解除绑定
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={securityDisabled}
                        onClick={() => oauth(provider, "link")}
                      >
                        绑定账号
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {methods?.providers.length === 0 && (
              <p className="text-sm text-muted-foreground">第三方登录将在平台配置完成后开放。</p>
            )}
            {profile.bindings
              .filter((binding) => !methods?.providers.some((provider) => provider.id === binding.provider))
              .map((binding) => (
                <p key={binding.id} className="text-sm text-muted-foreground">
                  {binding.provider} 已绑定，该平台暂不可用。
                </p>
              ))}
          </section>
          <section className="border-t pt-5 space-y-3">
            <h2 className="text-lg font-semibold">{profile.has_password ? "修改密码" : "设置密码"}</h2>
            {!profile.email_verified && (
              <p className="text-sm text-muted-foreground">请先验证邮箱，再设置或修改密码。</p>
            )}
            <form onSubmit={savePassword} className="space-y-3">
              <fieldset disabled={securityDisabled} className="space-y-3">
                {profile.has_password && (
                  <div className="space-y-2">
                    <Label htmlFor="current-password">当前密码</Label>
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
                  <Label htmlFor="new-password">新密码</Label>
                  <PasswordInput
                    id="new-password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={256}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">至少 12 个字符，修改后会退出所有设备。</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">确认新密码</Label>
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
                  {busy && <Loader2 className="animate-spin" />}保存密码
                </Button>
              </fieldset>
            </form>
          </section>
        </>
      )}
    </AccountShell>
  );
}
