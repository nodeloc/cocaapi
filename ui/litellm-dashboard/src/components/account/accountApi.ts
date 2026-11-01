import createClient from "openapi-fetch";
import type { components, paths } from "@/lib/http/schema";

export type Methods = components["schemas"]["MethodsView"];
export type Profile = components["schemas"]["ProfileView"];
export type Provider = components["schemas"]["ProviderView"];

const clientOptions = {
  baseUrl: typeof window === "undefined" ? "" : window.location.origin,
  credentials: "same-origin" as const,
  headers: { Accept: "application/json" },
  fetch: (request: Request) => globalThis.fetch(request),
};
const client = createClient<paths>(clientOptions);

export class AccountRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const errors: Readonly<Record<string, string>> = {
  invalid_request: "请检查填写的信息，密码至少需要 12 个字符。",
  account_service_unavailable: "账号服务尚未配置，请稍后再试。",
  invalid_credentials: "邮箱或密码不正确。",
  registration_closed: "暂未开放新用户注册。",
  email_unavailable: "邮件服务尚未配置，暂时无法发送邮件。",
  email_in_use: "该邮箱已被使用。请登录原账号后绑定第三方账号。",
  too_many_attempts: "操作过于频繁，请一分钟后重试。",
  invalid_or_expired_token: "链接已失效或已使用，请重新申请。",
  invalid_authorization: "授权已过期或浏览器不匹配，请重新登录。",
  authorization_cancelled: "已取消授权，你可以重新选择登录方式。",
  provider_authorization_failed: "第三方授权失败，请稍后重试。",
  provider_unavailable: "该登录方式暂不可用。",
  reauthentication_required: "请先重新验证身份，再修改账号安全设置。",
  authorization_session_changed: "登录状态已改变，请重新发起绑定。",
  identity_already_linked: "该第三方账号已被绑定，请使用原账号登录。",
  identity_not_linked: "请选择已绑定的第三方账号验证身份。",
  last_login_method_or_missing_binding: "请保留至少一种可用登录方式，或先验证邮箱并设置密码。",
  email_verification_required: "请先验证邮箱。",
  email_change_not_allowed: "已验证的邮箱暂不支持修改。",
  invalid_csrf: "页面状态已过期，请刷新页面后重试。",
  invalid_origin: "请求来源无效，请刷新页面后重试。",
  authentication_required: "请先登录。",
};

export function errorMessage(code: string): string {
  return errors[code] ?? "操作失败，请稍后重试。";
}

function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined && result.response.ok) return result.data;
  const detail =
    result.error && typeof result.error === "object" && "detail" in result.error ? result.error.detail : null;
  throw new AccountRequestError(
    typeof detail === "string" ? errorMessage(detail) : "请检查填写的信息，密码至少需要 12 个字符。",
    result.response.status,
  );
}

const headers = (csrf: string) => ({ "X-CSRF-Token": csrf });

export const accountApi = {
  methods: async () => unwrap(await client.GET("/account/api/v1/auth-methods")),
  profile: async () => unwrap(await client.GET("/account/api/v1/me")),
  login: async (email: string, password: string, csrf: string) =>
    unwrap(await client.POST("/account/api/v1/login", { body: { email, password }, headers: headers(csrf) })),
  register: async (email: string, password: string, csrf: string) =>
    unwrap(await client.POST("/account/api/v1/register", { body: { email, password }, headers: headers(csrf) })),
  forgot: async (email: string, csrf: string) =>
    unwrap(await client.POST("/account/api/v1/forgot-password", { body: { email }, headers: headers(csrf) })),
  verify: async (token: string, csrf: string) =>
    unwrap(await client.POST("/account/api/v1/verify-email", { body: { token }, headers: headers(csrf) })),
  reset: async (token: string, password: string, csrf: string) =>
    unwrap(await client.POST("/account/api/v1/reset-password", { body: { token, password }, headers: headers(csrf) })),
  logout: async (csrf: string) => unwrap(await client.POST("/account/api/v1/logout", { headers: headers(csrf) })),
  resend: async (email: string, csrf: string) =>
    unwrap(await client.POST("/account/api/v1/verification-email", { body: { email }, headers: headers(csrf) })),
  email: async (email: string, csrf: string) =>
    unwrap(await client.POST("/account/api/v1/email", { body: { email }, headers: headers(csrf) })),
  password: async (password: string, current_password: string | undefined, csrf: string) =>
    unwrap(
      await client.POST("/account/api/v1/password", { body: { password, current_password }, headers: headers(csrf) }),
    ),
  unlink: async (binding_id: string, csrf: string) =>
    unwrap(
      await client.POST("/account/api/v1/bindings/{binding_id}/remove", {
        params: { path: { binding_id } },
        headers: headers(csrf),
      }),
    ),
  oauth: async (provider: Provider["id"], csrf: string, intent: "login" | "link" | "reauth" = "login") => {
    const body = {
      return_path: intent === "login" ? "/account/profile/" : "/account/security/",
      intent: intent === "reauth" ? ("reauth" as const) : ("login" as const),
    };
    const params = { params: { path: { provider } }, body, headers: headers(csrf) };
    return unwrap(
      intent === "link"
        ? await client.POST("/account/api/v1/oauth/{provider}/link", params)
        : await client.POST("/account/api/v1/oauth/{provider}/start", params),
    );
  },
};
