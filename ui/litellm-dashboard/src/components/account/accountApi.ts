import { markUiCopy } from "@/lib/i18n";
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

const errors: Readonly<Record<string, string>> = markUiCopy(
  {
    invalid_request: "请检查填写的信息，密码至少需要 12 个字符。",
    account_service_unavailable: "账号服务尚未配置，请稍后再试。",
    invalid_credentials: "邮箱或密码不正确。",
    registration_closed: "暂未开放新用户注册。",
    email_unavailable: "邮件服务尚未配置，暂时无法发送邮件。",
    email_in_use: "该邮箱已被使用。请登录原账号后绑定第三方账号。",
    invalid_referral_code: "邀请码无效或邀请人已停用，请检查邀请链接。",
    too_many_attempts: "操作过于频繁，请一分钟后重试。",
    invalid_or_expired_token: "链接已失效或已使用，请重新申请。",
    invalid_authorization: "授权已过期或浏览器不匹配，请重新登录。",
    authorization_cancelled: "已取消授权，你可以重新选择登录方式。",
    provider_authorization_failed: "第三方授权失败，请稍后重试。",
    provider_credentials_invalid: "第三方登录的应用凭据无效，请联系管理员检查 Client ID 和 Client Secret。",
    provider_unavailable: "该登录方式暂不可用。",
    reauthentication_required: "请重新登录或在安全设置中验证身份，然后重试。",
    authorization_session_changed: "登录状态已改变，请重新发起绑定。",
    identity_already_linked: "该第三方账号已被绑定，请使用原账号登录。",
    identity_not_linked: "请选择已绑定的第三方账号验证身份。",
    last_login_method_or_missing_binding: "请保留至少一种可用登录方式，或先验证邮箱并设置密码。",
    email_verification_required: "请先验证邮箱。",
    email_change_not_allowed: "已验证的邮箱暂不支持修改。",
    invalid_csrf: "页面状态已过期，请刷新页面后重试。",
    invalid_origin: "请求来源无效，请刷新页面后重试。",
    authentication_required: "请先登录。",
    model_access_required: "尚未分配可用模型，请联系管理员开通。",
    api_budget_exhausted: "调用预算未开通或已用尽，请联系管理员处理。",
    insufficient_balance: "可用余额不足以支付本次调用，请充值或降低输出 Token 上限。",
    wallet_pricing_unavailable: "模型计价暂不可用，请联系管理员检查模型价格。",
    wallet_billing_unavailable: "调用结算暂不可用，请稍后重试。",
    wallet_request_not_supported: "当前钱包计费暂不支持该请求参数，请查看接入说明。",
    wallet_route_not_supported: "当前钱包计费暂未开放这个 API 接口。",
    key_not_found: "密钥不存在或不属于当前账号。",
    key_limit_reached: "个人密钥数量已达上限，请先删除不用的密钥。",
    gateway_request_failed: "网关操作失败，请稍后重试。",
    gateway_unavailable: "网关暂不可用，请稍后重试。",
    model_request_rejected: "模型调用被拒绝，请检查密钥有效期、模型权限、预算和速率限制。",
    personal_key_unavailable: "平台默认密钥配置不适用于个人账号，请联系管理员检查默认团队或权限设置。",
  },
  {
    invalid_request: "请检查填写的信息，密码至少需要 12 个字符。",
    account_service_unavailable: "账号服务尚未配置，请稍后再试。",
    invalid_credentials: "邮箱或密码不正确。",
    registration_closed: "暂未开放新用户注册。",
    email_unavailable: "邮件服务尚未配置，暂时无法发送邮件。",
    email_in_use: "该邮箱已被使用。请登录原账号后绑定第三方账号。",
    invalid_referral_code: "邀请码无效或邀请人已停用，请检查邀请链接。",
    too_many_attempts: "操作过于频繁，请一分钟后重试。",
    invalid_or_expired_token: "链接已失效或已使用，请重新申请。",
    invalid_authorization: "授权已过期或浏览器不匹配，请重新登录。",
    authorization_cancelled: "已取消授权，你可以重新选择登录方式。",
    provider_authorization_failed: "第三方授权失败，请稍后重试。",
    provider_credentials_invalid: "第三方登录的应用凭据无效，请联系管理员检查 Client ID 和 Client Secret。",
    provider_unavailable: "该登录方式暂不可用。",
    reauthentication_required: "请重新登录或在安全设置中验证身份，然后重试。",
    authorization_session_changed: "登录状态已改变，请重新发起绑定。",
    identity_already_linked: "该第三方账号已被绑定，请使用原账号登录。",
    identity_not_linked: "请选择已绑定的第三方账号验证身份。",
    last_login_method_or_missing_binding: "请保留至少一种可用登录方式，或先验证邮箱并设置密码。",
    email_verification_required: "请先验证邮箱。",
    email_change_not_allowed: "已验证的邮箱暂不支持修改。",
    invalid_csrf: "页面状态已过期，请刷新页面后重试。",
    invalid_origin: "请求来源无效，请刷新页面后重试。",
    authentication_required: "请先登录。",
    model_access_required: "尚未分配可用模型，请联系管理员开通。",
    api_budget_exhausted: "调用预算未开通或已用尽，请联系管理员处理。",
    insufficient_balance: "可用余额不足以支付本次调用，请充值或降低输出 Token 上限。",
    wallet_pricing_unavailable: "模型计价暂不可用，请联系管理员检查模型价格。",
    wallet_billing_unavailable: "调用结算暂不可用，请稍后重试。",
    wallet_request_not_supported: "当前钱包计费暂不支持该请求参数，请查看接入说明。",
    wallet_route_not_supported: "当前钱包计费暂未开放这个 API 接口。",
    key_not_found: "密钥不存在或不属于当前账号。",
    key_limit_reached: "个人密钥数量已达上限，请先删除不用的密钥。",
    gateway_request_failed: "网关操作失败，请稍后重试。",
    gateway_unavailable: "网关暂不可用，请稍后重试。",
    model_request_rejected: "模型调用被拒绝，请检查密钥有效期、模型权限、预算和速率限制。",
    personal_key_unavailable: "平台默认密钥配置不适用于个人账号，请联系管理员检查默认团队或权限设置。",
  },
);

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
  register: async (email: string, password: string, csrf: string, referral_code?: string) =>
    unwrap(
      await client.POST("/account/api/v1/register", {
        body: { email, password, referral_code },
        headers: headers(csrf),
      }),
    ),
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
  oauth: async (
    provider: Provider["id"],
    csrf: string,
    intent: "login" | "link" | "reauth" = "login",
    referral_code?: string,
  ) => {
    const body = {
      return_path: intent === "login" ? "/account/profile/" : "/account/security/",
      intent: intent === "reauth" ? ("reauth" as const) : ("login" as const),
      referral_code: intent === "login" ? referral_code : undefined,
    };
    const params = { params: { path: { provider } }, body, headers: headers(csrf) };
    return unwrap(
      intent === "link"
        ? await client.POST("/account/api/v1/oauth/{provider}/link", params)
        : await client.POST("/account/api/v1/oauth/{provider}/start", params),
    );
  },
};
