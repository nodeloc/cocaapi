"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LocalizedText, getIntlLocale, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { isProxyAdminRole } from "@/utils/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CommercePage } from "./CommercePage";
import { AccountNotice } from "./AccountShell";
import { paymentSettingsApi, type PaymentSettingsView } from "./paymentSettingsApi";

type Draft = {
  enabled: boolean;
  origin: string;
  merchant_id: string;
  private_key: string;
  public_key: string;
  clear_private_key: boolean;
  clear_public_key: boolean;
};
const empty: Draft = {
  enabled: false,
  origin: "",
  merchant_id: "",
  private_key: "",
  public_key: "",
  clear_private_key: false,
  clear_public_key: false,
};

export default function PaymentSettings() {
  useUiLocale();
  const { accessToken, userRole, isViewOnly, isAuthorized } = useAuthorized();
  const allowed = isAuthorized && !isViewOnly && isProxyAdminRole(userRole);
  const [settings, setSettings] = useState<PaymentSettingsView | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const accept = useCallback((value: PaymentSettingsView) => {
    setSettings(value);
    setDraft({ ...empty, enabled: value.enabled, origin: value.origin, merchant_id: value.merchant_id });
  }, []);
  const showError = (cause: unknown) =>
    setError(
      cause instanceof Error
        ? localizedProperty(cause, "message", cause.message)
        : translateMessage("配置请求失败，请稍后重试。"),
    );
  useEffect(() => {
    let active = true;
    if (accessToken && allowed)
      void paymentSettingsApi
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
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken || !settings || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      accept(
        await paymentSettingsApi.save(accessToken, {
          ...draft,
          revision: settings.revision,
          private_key: draft.private_key.trim() || undefined,
          public_key: draft.public_key.trim() || undefined,
        }),
      );
      setMessage(translateMessage("易支付设置已保存，新的支付请求立即生效。"));
    } catch (cause) {
      showError(cause);
    } finally {
      setDraft((current) => ({ ...current, private_key: "", public_key: "" }));
      setBusy(false);
    }
  };
  const reload = async () => {
    if (!accessToken || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      accept(await paymentSettingsApi.read(accessToken));
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  };
  if (!allowed)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        <LocalizedText text="仅完整代理管理员可以配置易支付。" />
      </div>
    );
  return (
    <CommercePage section="payments">
      <AccountNotice error={error} message={message} />
      {!settings && !error && (
        <p role="status" className="text-sm text-muted-foreground">
          <LocalizedText text="正在加载支付配置…" />
        </p>
      )}
      {settings && (
        <form onSubmit={save} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>
                  <LocalizedText text="易支付" />
                </h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="payment-enabled"
                  checked={draft.enabled}
                  disabled={busy || draft.clear_private_key || draft.clear_public_key}
                  onCheckedChange={(checked) => setDraft((current) => ({ ...current, enabled: checked === true }))}
                />
                <Label htmlFor="payment-enabled">
                  <LocalizedText text="启用易支付" />
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                <LocalizedText text="请先在支付平台开通支付宝、微信通道，再启用支付。USDT 通道尚未开通。" />
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="payment-origin">
                    <LocalizedText text="网关地址" />
                  </Label>
                  <Input
                    id="payment-origin"
                    type="url"
                    value={draft.origin}
                    maxLength={1024}
                    autoComplete="off"
                    disabled={busy}
                    placeholder="https://pay.example.com"
                    onChange={(event) => setDraft((current) => ({ ...current, origin: event.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    <LocalizedText text="填写实际收款网关的 HTTPS 域名，不含 API 路径。" />
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-merchant">
                    <LocalizedText text="商户号" />
                  </Label>
                  <Input
                    id="payment-merchant"
                    value={draft.merchant_id}
                    maxLength={18}
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={busy}
                    onChange={(event) => setDraft((current) => ({ ...current, merchant_id: event.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="grid items-start gap-6 xl:grid-cols-2">
            {(["private", "public"] as const).map((kind) => {
              const key = `${kind}_key` as const;
              const clear = `clear_${kind}_key` as const;
              const configured = settings[`${kind}_key_configured`];
              const label = kind === "private" ? translateMessage("商户私钥") : translateMessage("平台公钥");
              return (
                <Card key={kind}>
                  <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle>
                      <h2>{label}</h2>
                    </CardTitle>
                    <Badge variant="secondary">
                      {configured ? translateMessage("密钥已配置") : translateMessage("未配置密钥")}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`payment-${key}`}>{label}</Label>
                      <Textarea
                        id={`payment-${key}`}
                        value={draft[key]}
                        maxLength={16_384}
                        rows={5}
                        className="h-32 resize-y font-mono text-xs"
                        autoComplete="off"
                        spellCheck={false}
                        disabled={busy || draft[clear]}
                        placeholder={
                          configured ? translateMessage("留空保留现有密钥") : translateMessage("粘贴完整 PEM 密钥")
                        }
                        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        <LocalizedText text="密钥加密保存，不回显原值。留空保留，填写新值会替换现值。" />
                      </p>
                    </div>
                    {configured && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`payment-${clear}`}
                          checked={draft[clear]}
                          disabled={busy}
                          onCheckedChange={(checked) =>
                            setDraft((current) => ({
                              ...current,
                              [clear]: checked === true,
                              [key]: "",
                              enabled: checked === true ? false : current.enabled,
                            }))
                          }
                        />
                        <Label htmlFor={`payment-${clear}`}>
                          {kind === "private"
                            ? translateMessage("清除商户私钥并停用支付")
                            : translateMessage("清除平台公钥并停用支付")}
                        </Label>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>
                  <LocalizedText text="支付回调" />
                </h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="payment-notify">
                  <LocalizedText text="异步通知地址" />
                </Label>
                <Input id="payment-notify" readOnly value={settings.notify_url} className="font-mono text-xs" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-return">
                  <LocalizedText text="支付返回地址" />
                </Label>
                <Input id="payment-return" readOnly value={settings.return_url} className="font-mono text-xs" />
              </div>
            </CardContent>
          </Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              <LocalizedText text="保存设置" />
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={reload}>
              <LocalizedText text="重新加载" />
            </Button>
            {settings.updated_at && (
              <span className="text-xs text-muted-foreground">
                <LocalizedText text="上次保存：" />
                {new Date(settings.updated_at).toLocaleString(getIntlLocale())}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            <LocalizedText text="重新加载会放弃未保存的修改。更换商户或网关前，请先核对所有未完成订单。" />
          </p>
        </form>
      )}
    </CommercePage>
  );
}
