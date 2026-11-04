import createClient from "openapi-fetch";
import type { components, paths } from "@/lib/http/schema";
import { unwrapWallet } from "./walletApi";

export type BillingGroups = components["schemas"]["BillingGroupsView"];
export type BillingGroupsUpdate = components["schemas"]["BillingGroupsUpdate"];
export type BillingMembers = components["schemas"]["BillingGroupMembers"];
export type BillingMember = BillingMembers["items"][number];
export type BillingAssignment = components["schemas"]["BillingGroupAssignment"];
export type BillingRule = BillingGroups["rules"][number];

const client = createClient<paths>({
  baseUrl: typeof window === "undefined" ? "" : window.location.origin,
  credentials: "same-origin",
  headers: { Accept: "application/json" },
  fetch: (request: Request) => globalThis.fetch(request),
});
const admin = (token: string) => ({ Authorization: `Bearer ${token}` });
export const billingGroupsApi = {
  lookup: async (token: string, userIds: readonly string[]) =>
    unwrapWallet(
      await client.POST("/commerce/admin/v1/billing-groups/members/lookup", {
        headers: admin(token),
        body: { user_ids: [...userIds] },
      }),
    ),
  assignBatch: async (token: string, body: components["schemas"]["BillingGroupBatchAssignment"]) =>
    unwrapWallet(await client.POST("/commerce/admin/v1/billing-groups/members/batch", { headers: admin(token), body })),
  read: async (token: string) =>
    unwrapWallet(await client.GET("/commerce/admin/v1/billing-groups", { headers: admin(token) })),
  catalog: async (token: string) =>
    unwrapWallet(await client.GET("/commerce/admin/v1/billing-groups/catalog", { headers: admin(token) })),
  save: async (token: string, body: BillingGroupsUpdate) =>
    unwrapWallet(await client.PUT("/commerce/admin/v1/billing-groups", { headers: admin(token), body })),
  members: async (token: string, search: string, offset: number) =>
    unwrapWallet(
      await client.GET("/commerce/admin/v1/billing-groups/members", {
        headers: admin(token),
        params: { query: { search, offset, limit: 25 } },
      }),
    ),
  assign: async (token: string, user_id: string, body: BillingAssignment) =>
    unwrapWallet(
      await client.POST("/commerce/admin/v1/billing-groups/members/{user_id}", {
        headers: admin(token),
        params: { path: { user_id } },
        body,
      }),
    ),
};
