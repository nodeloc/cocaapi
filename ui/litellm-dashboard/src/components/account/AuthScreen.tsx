"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { useEffect, useState, type FormEvent, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { accountApi, errorMessage, type Methods, type Provider } from "./accountApi";
import { AccountNotice, AccountShell } from "./AccountShell";

type Mode = "login" | "register" | "forgot" | "verify" | "reset";
const copy: Record<Mode, readonly [string, string, string]> = {
  login: ["登录", "登录你的 CocaAPI 账号", "登录"],
  register: ["创建账号", "使用邮箱或第三方账号注册", "注册并发送验证邮件"],
  forgot: ["找回密码", "我们会向你的邮箱发送密码重置链接", "发送重置邮件"],
  verify: ["验证邮箱", "确认邮箱地址，完成账号验证", "确认验证邮箱"],
  reset: ["重置密码", "设置新密码后，需要重新登录", "保存新密码"],
};

function useAuthSetup(setError: Dispatch<SetStateAction<string>>) {
  useUiLocale();
  const [methods, setMethods] = useState<Methods | null>(null);
  const [token, setToken] = useState("");
  useEffect(() => {
    let active = true;
    accountApi
      .methods()
      .then((value) => {
        if (!active) return;
        setMethods(value);
        const callbackError = new URLSearchParams(window.location.search).get("error");
        if (callbackError) setError(errorMessage(callbackError));
        const linkToken = new URLSearchParams(window.location.hash.slice(1)).get("token");
        if (linkToken) {
          setToken(linkToken);
          window.history.replaceState(null, "", window.location.pathname);
        }
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? localizedProperty(reason, "message", reason.message)
              : translateMessage("无法连接账号服务。"),
          );
      });
    return () => {
      active = false;
    };
  }, [setError]);
  return { methods, token };
}

function SecretField({
  mode,
  value,
  onChange,
  disabled,
}: {
  mode: Mode | "confirmation";
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  useUiLocale();
  const labels = markUiCopy(
    {
      confirmation: "确认密码",
      reset: "新密码",
      login: "密码",
      register: "密码",
      forgot: "密码",
      verify: "密码",
    },
    { confirmation: "确认密码", reset: "新密码", login: "密码", register: "密码", forgot: "密码", verify: "密码" },
  );
  const label = labels[mode];
  const id = mode === "confirmation" ? "account-confirmation" : "account-password";
  const isLogin = mode === "login";
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{localizedProperty(labels, mode, label)}</Label>
      <PasswordInput
        id={id}
        autoComplete={isLogin ? "current-password" : "new-password"}
        required
        minLength={isLogin ? 1 : 12}
        maxLength={256}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
      {!isLogin && (
        <p className="text-xs text-muted-foreground">
          <LocalizedText text={"至少 12 个字符"} />
        </p>
      )}
    </div>
  );
}

function formState(mode: Mode, methods: Methods | null, state: { done: boolean; busy: boolean; token: string }) {
  const { done, busy, token } = state;
  const closed = mode === "register" && methods !== null && !methods.registration_enabled;
  const emailUnavailable = ["register", "forgot"].includes(mode) && methods !== null && !methods.email_enabled;
  const missingToken = ["verify", "reset"].includes(mode) && !token;
  return {
    closed,
    emailUnavailable,
    missingToken,
    isPassword: ["login", "register", "reset"].includes(mode),
    isEmail: ["login", "register", "forgot"].includes(mode),
    isNewPassword: ["register", "reset"].includes(mode),
    showForm: !done && !closed && !emailUnavailable,
    canUseProviders: ["login", "register"].includes(mode) && !closed && !done,
    hasProviders: (methods?.providers.length ?? 0) > 0,
    submitDisabled: !methods || busy || missingToken,
  };
}

function AuthFooter({ mode, methods }: { mode: Mode; methods: Methods | null }) {
  useUiLocale();
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
      {mode !== "login" && (
        <a className="underline underline-offset-4" href="/account/login/">
          <LocalizedText text={"返回登录"} />
        </a>
      )}
      {mode === "login" && methods?.registration_enabled && (
        <a className="underline underline-offset-4" href="/account/register/">
          <LocalizedText text={"创建账号"} />
        </a>
      )}
      {mode === "login" && methods?.email_enabled && (
        <a className="text-muted-foreground hover:text-foreground" href="/account/forgot-password/">
          <LocalizedText text={"忘记密码"} />
        </a>
      )}
    </div>
  );
}

export default function AuthScreen({ mode }: { mode: Mode }) {
  useUiLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const { methods, token } = useAuthSetup(setError);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!methods || busy) return;
    setError("");
    setMessage("");
    if ((mode === "register" || mode === "reset") && password !== confirmation) {
      setError(translateMessage("两次输入的密码不一致。"));
      return;
    }
    setBusy(true);
    try {
      const csrf = methods.csrf_token;
      switch (mode) {
        case "login":
          await accountApi.login(email, password, csrf);
          router.push("/account/profile/");
          break;
        case "register":
          await accountApi.register(email, password, csrf);
          setMessage(translateMessage("注册成功，请查收验证邮件。你也可以先登录查看账号。"));
          setDone(true);
          break;
        case "forgot":
          await accountApi.forgot(email, csrf);
          setMessage(translateMessage("如果账号存在，我们已安排发送重置邮件，请检查收件箱和垃圾邮件。"));
          setDone(true);
          break;
        case "verify":
          await accountApi.verify(token, csrf);
          setMessage(translateMessage("邮箱验证成功，请登录你的账号。"));
          setDone(true);
          break;
        case "reset":
          await accountApi.reset(token, password, csrf);
          setMessage(translateMessage("密码已更新，请使用新密码登录。"));
          setDone(true);
          break;
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? localizedProperty(reason, "message", reason.message)
          : translateMessage("操作失败，请稍后重试。"),
      );
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: Provider) => {
    if (!methods || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await accountApi.oauth(provider.id, methods.csrf_token);
      window.location.assign(result.authorization_url);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? localizedProperty(reason, "message", reason.message)
          : translateMessage("暂时无法授权。"),
      );
      setBusy(false);
    }
  };
  const {
    isPassword,
    isEmail,
    closed,
    emailUnavailable,
    missingToken,
    isNewPassword,
    showForm,
    canUseProviders,
    hasProviders,
    submitDisabled,
  } = formState(mode, methods, { done, busy, token });

  return (
    <AccountShell title={translateMessage(copy[mode][0])} description={translateMessage(copy[mode][1])}>
      <AccountNotice error={error} message={message} />
      {!methods && !error && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          <LocalizedText text={"正在加载登录方式…"} />
        </p>
      )}
      {closed && (
        <p className="text-sm text-muted-foreground">
          <LocalizedText text={"暂未开放新用户注册。"} />
        </p>
      )}
      {emailUnavailable && !closed && (
        <p className="text-sm text-muted-foreground">
          <LocalizedText text={"邮箱注册和找回密码将在邮件服务配置后开放。"} />
        </p>
      )}
      {showForm && (
        <form onSubmit={submit} className="space-y-4">
          {isEmail && (
            <div className="space-y-2">
              <Label htmlFor="account-email">
                <LocalizedText text={"邮箱"} />
              </Label>
              <Input
                id="account-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </div>
          )}
          {isPassword && <SecretField mode={mode} value={password} onChange={setPassword} disabled={busy} />}
          {isNewPassword && (
            <SecretField mode="confirmation" value={confirmation} onChange={setConfirmation} disabled={busy} />
          )}
          {missingToken && (
            <p className="text-sm text-muted-foreground">
              <LocalizedText text={"请从邮件中的完整链接打开此页面。"} />
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={submitDisabled}>
            {busy && <Loader2 className="animate-spin" />}
            {translateMessage(copy[mode][2])}
          </Button>
        </form>
      )}
      {canUseProviders && hasProviders && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <LocalizedText text={"或使用第三方账号"} />
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-2">
            {methods?.providers.map((provider) => (
              <Button key={provider.id} variant="outline" size="lg" disabled={busy} onClick={() => oauth(provider)}>
                {localizedProperty(provider, "label", provider.label)}
                <LocalizedText text={" 登录"} />
              </Button>
            ))}
          </div>
        </div>
      )}
      <AuthFooter mode={mode} methods={methods} />
    </AccountShell>
  );
}
