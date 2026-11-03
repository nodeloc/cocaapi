import createClient from "openapi-fetch";
import { markUiCopy } from "@/lib/i18n";
import type { components, paths } from "@/lib/http/schema";
import { AccountRequestError } from "./accountApi";

export type ReferralOverview = components["schemas"]["ReferralOverview"];
export type ReferralPage = components["schemas"]["ReferralPage"];
export type ReferralItem = components["schemas"]["ReferralItem"];
export type ReferralSettingsView = components["schemas"]["ReferralSettingsView"];
type SettingsInput = components["schemas"]["ReferralSettingsInput"];

const options = {
  baseUrl: typeof window === "undefined" ? "" : window.location.origin,
  credentials: "same-origin" as const,
  headers: { Accept: "application/json" },
  fetch: (request: Request) => globalThis.fetch(request),
};
const client = createClient<paths>(options);
const copy = {
  referral_verification_required: "请先验证邮箱或通过第三方账号完成身份验证。",
  referral_settings_conflict: "设置已被其他管理员更新，请重新加载后再保存。",
  referral_settings_unavailable: "邀请活动配置暂时无法读取，请稍后重试。",
  invalid_referral_settings: "请检查奖励金额，最多保留两位小数。",
  referral_amount_required: "启用活动前，请填写双方大于零的奖励金额。",
  invalid_referral_code: "邀请码无效或邀请人已停用，请检查邀请链接。",
};
const messages: Readonly<Record<string, string>> = markUiCopy(copy, copy);
function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined && result.response.ok) return result.data;
  const detail =
    result.error && typeof result.error === "object" && "detail" in result.error ? result.error.detail : null;
  throw new AccountRequestError(
    (typeof detail === "string" ? messages[detail] : undefined) ?? "邀请活动请求失败，请稍后重试。",
    result.response.status,
  );
}
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
export const referralApi = {
  overview: async (offset: number) =>
    unwrap(await client.GET("/account/api/v1/referrals", { params: { query: { offset, limit: 25 } } })),
  issue: async (csrf: string) =>
    unwrap(await client.POST("/account/api/v1/referrals/code", { headers: { "X-CSRF-Token": csrf } })),
  settings: async (token: string) =>
    unwrap(await client.GET("/commerce/admin/v1/referral-settings", { headers: headers(token) })),
  save: async (token: string, body: SettingsInput) =>
    unwrap(await client.PUT("/commerce/admin/v1/referral-settings", { headers: headers(token), body })),
  records: async (token: string, offset: number) =>
    unwrap(
      await client.GET("/commerce/admin/v1/referrals", {
        headers: headers(token),
        params: { query: { offset, limit: 25 } },
      }),
    ),
};
