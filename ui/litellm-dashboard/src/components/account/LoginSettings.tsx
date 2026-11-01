"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { isProxyAdminRole } from "@/utils/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { Checkbox } from "@/components/ui/checkbox";
import { CommercePage } from "./CommercePage";
import { AccountNotice } from "./AccountShell";
import { loginSettingsApi, type LoginSettingsView } from "./loginSettingsApi";

type ProviderView = LoginSettingsView["providers"][number];
type DraftProvider = ProviderView & { client_secret: string; clear_secret: boolean };

function ProviderForm({
  provider,
  busy,
  onChange,
}: {
  provider: DraftProvider;
  busy: boolean;
  onChange: (provider: DraftProvider) => void;
}) {
  const prefix = `oauth-${provider.id}`;
  const clear = (checked: boolean) =>
    onChange({ ...provider, clear_secret: checked, client_secret: "", enabled: checked ? false : provider.enabled });
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>
          <h2>{provider.label}</h2>
        </CardTitle>
        <Badge variant="secondary">{provider.secret_configured ? "密钥已配置" : "未配置密钥"}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${prefix}-enabled`}
            checked={provider.enabled}
            disabled={busy || provider.clear_secret}
            onCheckedChange={(checked) => onChange({ ...provider, enabled: checked === true })}
          />
          <Label htmlFor={`${prefix}-enabled`}>启用 {provider.label} 登录</Label>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-client`}>{provider.label} Client ID</Label>
          <Input
            id={`${prefix}-client`}
            value={provider.client_id}
            maxLength={512}
            autoComplete="off"
            disabled={busy}
            onChange={(event) => onChange({ ...provider, client_id: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-secret`}>{provider.label} Client Secret</Label>
          <PasswordInput
            id={`${prefix}-secret`}
            value={provider.client_secret}
            maxLength={4096}
            autoComplete="new-password"
            disabled={busy || provider.clear_secret}
            placeholder={provider.secret_configured ? "留空保留现有密钥" : "输入应用密钥"}
            onChange={(event) => onChange({ ...provider, client_secret: event.target.value })}
          />
          <p className="text-xs text-muted-foreground">保存后不显示原始密钥。留空保留现值，填写新值会替换现值。</p>
        </div>
        {provider.secret_configured && (
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${prefix}-clear`}
              checked={provider.clear_secret}
              disabled={busy}
              onCheckedChange={(checked) => clear(checked === true)}
            />
            <Label htmlFor={`${prefix}-clear`}>清除 {provider.label} 密钥并停用登录</Label>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-callback`}>回调地址</Label>
          <Input id={`${prefix}-callback`} readOnly value={provider.callback_url} className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground">在 {provider.label} 应用中填写这个完整地址。</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginSettings() {
  const { accessToken, userRole, isViewOnly, isAuthorized } = useAuthorized();
  const allowed = isAuthorized && !isViewOnly && isProxyAdminRole(userRole);
  const [settings, setSettings] = useState<LoginSettingsView | null>(null);
  const [providers, setProviders] = useState<readonly DraftProvider[]>([]);
  const [registration, setRegistration] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const accept = useCallback((value: LoginSettingsView) => {
    setSettings(value);
    setRegistration(value.registration_enabled);
    setProviders(value.providers.map((provider) => ({ ...provider, client_secret: "", clear_secret: false })));
  }, []);
  const showError = (cause: unknown) => setError(cause instanceof Error ? cause.message : "配置请求失败，请稍后重试。");
  useEffect(() => {
    let active = true;
    if (accessToken && allowed)
      void loginSettingsApi
        .read(accessToken)
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
  const update = (next: DraftProvider) =>
    setProviders((current) => current.map((provider) => (provider.id === next.id ? next : provider)));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken || !settings || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = {
        revision: settings.revision,
        registration_enabled: registration,
        providers: providers.map((provider) => ({
          id: provider.id,
          enabled: provider.enabled,
          client_id: provider.client_id,
          client_secret: provider.client_secret || undefined,
          clear_secret: provider.clear_secret,
        })),
      };
      accept(await loginSettingsApi.save(accessToken, body));
      setMessage("登录与注册设置已保存，新的登录请求立即生效。");
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
      accept(await loginSettingsApi.read(accessToken));
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  };
  if (!allowed) return <div className="p-8 text-sm text-muted-foreground">仅完整代理管理员可以配置登录与注册。</div>;
  return (
    <CommercePage section="settings">
      <AccountNotice error={error} message={message} />
      {!settings && !error && (
        <p role="status" className="text-sm text-muted-foreground">
          正在加载登录配置…
        </p>
      )}
      {settings && (
        <form onSubmit={save} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>注册设置</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="registration-enabled"
                  checked={registration}
                  disabled={busy}
                  onCheckedChange={(checked) => setRegistration(checked === true)}
                />
                <Label htmlFor="registration-enabled">允许新用户注册</Label>
              </div>
              <p className="text-sm text-muted-foreground">关闭后已有用户仍可登录。启用第三方登录不自动开放注册。</p>
              <p className="text-sm text-muted-foreground">
                {settings.email_enabled
                  ? "邮件服务已配置，可使用邮箱注册和找回密码。"
                  : "邮件服务尚未配置，邮箱注册与找回密码暂不可用；第三方注册可独立启用。"}
              </p>
              <div className="flex flex-wrap gap-4 text-sm underline underline-offset-4">
                <a href="/account/login/" target="_blank" rel="noopener noreferrer">
                  打开用户登录页
                </a>
                <a href="/account/register/" target="_blank" rel="noopener noreferrer">
                  打开用户注册页
                </a>
              </div>
            </CardContent>
          </Card>
          <div className="grid items-start gap-6 xl:grid-cols-2">
            {providers.map((provider) => (
              <ProviderForm key={provider.id} provider={provider} busy={busy} onChange={update} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              保存设置
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={reload}>
              重新加载
            </Button>
            {settings.updated_at && (
              <span className="text-xs text-muted-foreground">
                上次保存：{new Date(settings.updated_at).toLocaleString()}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            重新加载会放弃未保存的修改。请先在对应平台创建 OAuth 应用，再填写凭据；真实登录需在配置后验收。
          </p>
        </form>
      )}
    </CommercePage>
  );
}
