"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { billingGroupsApi, type BillingMember } from "./billingGroupsApi";

export type MembershipStatus = "disabled" | "loading" | "ready" | "error";

export function useUserGroupMemberships(
  userIds: readonly string[],
  token: string | null,
  enabled: boolean,
): {
  members: ReadonlyMap<string, BillingMember>;
  status: MembershipStatus;
} {
  const ids = [...new Set(userIds)].sort();
  const query = useQuery({
    queryKey: ["userGroupMemberships", ids],
    queryFn: () => billingGroupsApi.lookup(token ?? "", ids),
    enabled: enabled && Boolean(token) && ids.length > 0,
  });
  const members: ReadonlyMap<string, BillingMember> = useMemo(
    () => new Map((query.data?.items ?? []).map((member) => [member.user_id, member])),
    [query.data],
  );
  if (!enabled) return { members, status: "disabled" };
  if (!token) return { members, status: "loading" };
  if (ids.length === 0) return { members, status: "ready" };
  if (query.isError) return { members, status: "error" };
  return { members, status: query.isPending ? "loading" : "ready" };
}
