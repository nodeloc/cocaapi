import createClient from "openapi-fetch";
import type { components, paths } from "@/lib/http/schema";
import { AccountRequestError } from "./accountApi";

export type LoginSettingsView = components["schemas"]["LoginConfigurationView"];
export type LoginSettingsInput = components["schemas"]["LoginConfigurationInput"];

const options = {
  baseUrl: typeof window === "undefined" ? "" : window.location.origin,
  credentials: "same-origin" as const,
  headers: { Accept: "application/json" },
  fetch: (request: Request) => globalThis.fetch(request),
};
const client = createClient<paths>(options);
const messages: Readonly<Record<string, string>> = {
  login_settings_conflict: "设置已被其他管理员更新，请重新加载后再保存。",
  provider_credentials_required: "启用登录方式前，请填写 Client ID 和 Client Secret。",
  invalid_login_settings: "请检查提供商、Client ID 和密钥设置。",
  login_settings_unavailable: "登录配置无法读取或解密，请检查服务端认证密钥。",
};
function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined && result.response.ok) return result.data;
  const detail =
    result.error && typeof result.error === "object" && "detail" in result.error ? result.error.detail : null;
  const message = typeof detail === "string" ? messages[detail] : undefined;
  throw new AccountRequestError(message ?? "无法保存登录设置，请检查填写的信息和管理员权限。", result.response.status);
}
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

export const loginSettingsApi = {
  read: async (token: string) =>
    unwrap(await client.GET("/commerce/admin/v1/login-settings", { headers: headers(token) })),
  save: async (token: string, body: LoginSettingsInput) =>
    unwrap(await client.PUT("/commerce/admin/v1/login-settings", { headers: headers(token), body })),
};
