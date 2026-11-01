import createClient from "openapi-fetch";
import type { components, paths } from "@/lib/http/schema";
import { AccountRequestError, errorMessage } from "./accountApi";

export type Access = components["schemas"]["GatewayAccess"];
export type Keys = components["schemas"]["GatewayKeys"];
export type Usage = components["schemas"]["GatewayUsage"];
export type Logs = components["schemas"]["GatewayLogs"];

const clientOptions = {
  baseUrl: typeof window === "undefined" ? "" : window.location.origin,
  credentials: "same-origin" as const,
  headers: { Accept: "application/json" },
  fetch: (request: Request) => globalThis.fetch(request),
};
const client = createClient<paths>(clientOptions);

function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined && result.response.ok) return result.data;
  const detail =
    result.error && typeof result.error === "object" && "detail" in result.error ? result.error.detail : null;
  throw new AccountRequestError(
    typeof detail === "string" ? errorMessage(detail) : "网关请求失败，请稍后重试。",
    result.response.status,
  );
}

export const gatewayApi = {
  access: async () => unwrap(await client.GET("/account/api/v1/gateway/access")),
  keys: async (offset = 0) =>
    unwrap(await client.GET("/account/api/v1/gateway/keys", { params: { query: { offset, limit: 25 } } })),
  create: async (name: string, expires_in_days: number, csrf: string) =>
    unwrap(
      await client.POST("/account/api/v1/gateway/keys", {
        body: { name, expires_in_days },
        headers: { "X-CSRF-Token": csrf },
      }),
    ),
  remove: async (key_id: string, csrf: string) =>
    unwrap(
      await client.POST("/account/api/v1/gateway/keys/{key_id}/delete", {
        params: { path: { key_id } },
        headers: { "X-CSRF-Token": csrf },
      }),
    ),
  usage: async (days = 30) =>
    unwrap(await client.GET("/account/api/v1/gateway/usage", { params: { query: { days } } })),
  logs: async (days = 30, offset = 0) =>
    unwrap(await client.GET("/account/api/v1/gateway/logs", { params: { query: { days, offset, limit: 25 } } })),
  chat: async (body: components["schemas"]["PlaygroundInput"], csrf: string) =>
    unwrap(
      await client.POST("/account/api/v1/gateway/playground", {
        body,
        headers: { "X-CSRF-Token": csrf },
      }),
    ),
};
