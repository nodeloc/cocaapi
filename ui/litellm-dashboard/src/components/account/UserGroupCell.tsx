"use client";

import { Pencil } from "lucide-react";
import { createContext, useContext } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";
import type { BillingMember } from "./billingGroupsApi";
import type { MembershipStatus } from "./useUserGroupMemberships";

export const UserGroupMembershipContext = createContext<{
  members: ReadonlyMap<string, BillingMember>;
  status: MembershipStatus;
  onChange?: (userId: string) => void;
}>({ members: new Map(), status: "disabled" });

export function UserGroupColumnCell({ userId }: { userId: string }) {
  const context = useContext(UserGroupMembershipContext);
  return <UserGroupCell member={context.members.get(userId)} status={context.status} onChange={context.onChange} />;
}

export default function UserGroupCell({
  member,
  status,
  onChange,
}: {
  member?: BillingMember;
  status: MembershipStatus;
  onChange?: (userId: string) => void;
}) {
  useUiLocale();
  if (status === "loading")
    return (
      <span className="text-muted-foreground">
        <LocalizedText text="加载中" />
      </span>
    );
  if (status === "error")
    return (
      <span className="text-muted-foreground">
        <LocalizedText text="暂不可用" />
      </span>
    );
  if (!member)
    return (
      <span className="text-muted-foreground">
        <LocalizedText text="系统账户" />
      </span>
    );
  if (!onChange) return <Badge variant="secondary">{member.group_name}</Badge>;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto max-w-full justify-start px-0"
      onClick={() => onChange(member.user_id)}
      aria-label={translateMessage("调整用户组 %{0}", [member.email ?? member.user_id])}
    >
      <Badge variant="secondary" className="max-w-48 truncate">
        {member.group_name}
      </Badge>
      <Pencil className="size-3" />
    </Button>
  );
}
