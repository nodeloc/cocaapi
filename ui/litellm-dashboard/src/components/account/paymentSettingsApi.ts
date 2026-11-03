import { markUiCopy } from "@/lib/i18n";
import createClient from "openapi-fetch";
import type { components, paths } from "@/lib/http/schema";
import { AccountRequestError } from "./accountApi";

export type PaymentSettingsView = components["schemas"]["PaymentConfigurationView"];
export type PaymentSettingsInput = components["schemas"]["PaymentConfigurationInput"];

const client = createClient<paths>({
  baseUrl: typeof window === "undefined" ? "" : window.location.origin,
  credentials: "same-origin",
  headers: { Accept: "application/json" },
  fetch: (request: Request) => globalThis.fetch(request),
});
const copy = {
  payment_settings_conflict: "设置已被其他管理员更新，请重新加载后再保存。",
  payment_credentials_required: "启用易支付前，请填写网关地址、商户号和两项密钥。",
  invalid_payment_settings: "请检查易支付设置，清除密钥时不能同时填写新值。",
  invalid_payment_key: "密钥格式错误，请使用至少 2048 位的 RSA 商户私钥和平台公钥。",
  payment_settings_unavailable: "支付配置无法读取或解密，请检查服务端认证密钥。",
};
const messages: Readonly<Record<string, string>> = markUiCopy(copy, copy);

function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined && result.response.ok) return result.data;
  const detail =
    result.error && typeof result.error === "object" && "detail" in result.error ? result.error.detail : null;
  throw new AccountRequestError(
    (typeof detail === "string" ? messages[detail] : undefined) ?? "无法保存易支付设置，请检查填写的信息和管理员权限。",
    result.response.status,
  );
}
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

export const paymentSettingsApi = {
  read: async (token: string) =>
    unwrap(await client.GET("/commerce/admin/v1/payment-settings", { headers: headers(token) })),
  save: async (token: string, body: PaymentSettingsInput) =>
    unwrap(await client.PUT("/commerce/admin/v1/payment-settings", { headers: headers(token), body })),
};
