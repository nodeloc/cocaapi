import createClient from "openapi-fetch";
import type { components, paths } from "@/lib/http/schema";
import { AccountRequestError, errorMessage } from "./accountApi";

export type Wallet = components["schemas"]["WalletSnapshot"];
export type Ledger = components["schemas"]["LedgerPage"];
export type Order = components["schemas"]["RechargeOrder"];
export type Orders = components["schemas"]["OrderPage"];
export type PaymentMethods = components["schemas"]["PaymentMethods"];
export type Wallets = components["schemas"]["WalletPage"];
export type Batches = components["schemas"]["BatchPage"];
export type GeneratedBatch = components["schemas"]["GeneratedBatch"];
export type BatchInput = components["schemas"]["BatchInput"];
export type Adjustment = components["schemas"]["AdjustmentInput"];

const client = createClient<paths>({
  baseUrl: typeof window === "undefined" ? "" : window.location.origin,
  credentials: "same-origin",
  headers: { Accept: "application/json" },
  fetch: (request: Request) => globalThis.fetch(request),
});
const messages: Readonly<Record<string, string>> = {
  invalid_request: "请检查金额、数量和填写的信息。",
  balance_limit_reached: "金额超过余额上限。",
  invalid_redemption: "兑换码无效、已失效或已被使用。",
  invalid_expiry: "到期时间须晚于当前时间。",
  reason_required: "请填写操作原因。",
  invalid_amount: "金额须为 0.01 至 100000 美元，最多两位小数。",
  invalid_or_unavailable_code: "兑换码无效、已失效或已被使用。",
  invalid_redemption_code: "兑换码无效、已失效或已被使用。",
  redemption_unavailable: "兑换服务尚未配置。",
  payment_unavailable: "USDT 支付尚未开放。",
  network_unavailable: "该网络暂不可用。",
  insufficient_balance: "可用余额不足。",
  balance_limit_exceeded: "金额超过余额上限。",
  idempotency_conflict: "该请求已处理，请刷新查看结果。",
  batch_already_created: "该批次已创建，原始兑换码只能在首次创建时查看。",
  invalid_batch: "请检查批次名称、数量和有效期。",
  order_not_ready: "订单仍在创建，请稍后查单。",
  gateway_timeout: "支付网关响应超时，请在订单记录中查询结果。",
  gateway_invalid_response: "支付网关返回异常，请联系管理员核查订单。",
};
export function unwrapWallet<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined && result.response.ok) return result.data;
  const detail =
    result.error && typeof result.error === "object" && "detail" in result.error ? result.error.detail : null;
  throw new AccountRequestError(
    typeof detail === "string" ? messages[detail] ?? errorMessage(detail) : "请求失败，请检查填写的信息。",
    result.response.status,
  );
}
const csrf = (token: string) => ({ "X-CSRF-Token": token });
const keyed = (token: string, key: string) => ({ ...csrf(token), "Idempotency-Key": key });
const admin = (token: string) => ({ Authorization: `Bearer ${token}` });

export const walletApi = {
  balance: async () => unwrapWallet(await client.GET("/account/api/v1/wallet")),
  ledger: async (offset: number) =>
    unwrapWallet(await client.GET("/account/api/v1/wallet/transactions", { params: { query: { offset, limit: 25 } } })),
  methods: async () => unwrapWallet(await client.GET("/account/api/v1/payment-methods")),
  redeem: async (code: string, token: string) =>
    unwrapWallet(await client.POST("/account/api/v1/redemptions", { body: { code }, headers: csrf(token) })),
  orders: async (offset: number) =>
    unwrapWallet(await client.GET("/account/api/v1/recharge-orders", { params: { query: { offset, limit: 25 } } })),
  create: async (body: components["schemas"]["RechargeInput"], token: string, key: string) =>
    unwrapWallet(
      await client.POST("/account/api/v1/recharge-orders", {
        body,
        headers: keyed(token, key),
        params: { header: { "Idempotency-Key": key } },
      }),
    ),
  refresh: async (order_id: string, token: string) =>
    unwrapWallet(
      await client.POST("/account/api/v1/recharge-orders/{order_id}/refresh", {
        params: { path: { order_id } },
        headers: csrf(token),
      }),
    ),
  wallets: async (token: string, search: string, offset: number) =>
    unwrapWallet(
      await client.GET("/commerce/admin/v1/wallets", {
        headers: admin(token),
        params: { query: { search, offset, limit: 25 } },
      }),
    ),
  adminLedger: async (token: string, user_id: string, offset: number) =>
    unwrapWallet(
      await client.GET("/commerce/admin/v1/wallets/{user_id}/transactions", {
        headers: admin(token),
        params: { path: { user_id }, query: { offset, limit: 25 } },
      }),
    ),
  adjust: async (token: string, user_id: string, body: Adjustment, key: string) =>
    unwrapWallet(
      await client.POST("/commerce/admin/v1/wallets/{user_id}/adjustments", {
        headers: { ...admin(token), "Idempotency-Key": key },
        params: { path: { user_id }, header: { "Idempotency-Key": key } },
        body,
      }),
    ),
  batches: async (token: string, offset: number) =>
    unwrapWallet(
      await client.GET("/commerce/admin/v1/redeem-batches", {
        headers: admin(token),
        params: { query: { offset, limit: 25 } },
      }),
    ),
  generate: async (token: string, body: BatchInput, key: string) =>
    unwrapWallet(
      await client.POST("/commerce/admin/v1/redeem-batches", {
        headers: { ...admin(token), "Idempotency-Key": key },
        params: { header: { "Idempotency-Key": key } },
        body,
      }),
    ),
  disable: async (token: string, batch_id: string, reason: string) =>
    unwrapWallet(
      await client.POST("/commerce/admin/v1/redeem-batches/{batch_id}/disable", {
        headers: admin(token),
        params: { path: { batch_id } },
        body: { reason },
      }),
    ),
  adminOrders: async (token: string, search: string, offset: number) =>
    unwrapWallet(
      await client.GET("/commerce/admin/v1/recharge-orders", {
        headers: admin(token),
        params: { query: { search, offset, limit: 25 } },
      }),
    ),
  adminRefresh: async (token: string, order_id: string) =>
    unwrapWallet(
      await client.POST("/commerce/admin/v1/recharge-orders/{order_id}/refresh", {
        headers: admin(token),
        params: { path: { order_id } },
      }),
    ),
};
