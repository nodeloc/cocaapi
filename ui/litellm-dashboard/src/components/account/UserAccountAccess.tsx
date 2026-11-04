"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LocalizedText, localizedProperty, translateMessage } from "@/lib/i18n";
import { AccountNotice } from "./AccountShell";
import { billingGroupsApi, type BillingMember } from "./billingGroupsApi";
import type { MembershipStatus } from "./useUserGroupMemberships";
import UserGroupChangeDialog from "./UserGroupChangeDialog";

export function useUserAccountAccess(token: string | null, userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["adminUserAccess", userId],
    queryFn: () => billingGroupsApi.access(token ?? "", userId),
    enabled: enabled && Boolean(token),
  });
}

function ModelBadges({ models, noModels }: { models: readonly string[]; noModels: boolean }) {
  if (noModels)
    return (
      <p className="text-sm text-muted-foreground">
        <LocalizedText text="尚未分配可用模型" />
      </p>
    );
  if (models.length === 0)
    return (
      <Badge variant="secondary">
        <LocalizedText text="All proxy models" />
      </Badge>
    );
  return (
    <>
      {models.map((model) => (
        <Badge key={model} variant="secondary" className="max-w-full break-all whitespace-normal">
          {model === "all-proxy-models" ? translateMessage("All proxy models") : model}
        </Badge>
      ))}
    </>
  );
}

export default function UserAccountAccess({
  token,
  userId,
  member,
  status,
  canManage,
  nativeModels,
  onChanged,
}: {
  token: string;
  userId: string;
  member?: BillingMember;
  status: MembershipStatus;
  canManage: boolean;
  nativeModels: readonly string[];
  onChanged: () => void;
}) {
  const client = useQueryClient();
  const [changing, setChanging] = useState(false);
  const ids = useMemo(() => [userId], [userId]);
  const access = useUserAccountAccess(token, userId, Boolean(member) && status === "ready");
  const groupSaved = () => {
    void client.invalidateQueries({ queryKey: ["adminUserAccess", userId] });
    onChanged();
  };
  const models = member ? access.data?.models ?? [] : nativeModels;
  const noModels = member ? models.length === 0 : models.includes("no-default-models");
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>
            <LocalizedText text="用户组与模型权限" />
          </h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {status === "loading" && (
          <p role="status">
            <LocalizedText text="加载中" />
          </p>
        )}
        {status === "error" && <AccountNotice error={translateMessage("用户组暂不可用，请刷新后重试。")} message="" />}
        {status === "ready" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{member?.group_name ?? translateMessage("系统账户")}</Badge>
                {member && (
                  <Badge variant="outline">
                    <LocalizedText text={member.enabled ? "正常" : "已停用"} />
                  </Badge>
                )}
              </div>
              {canManage && member && (
                <Button variant="outline" size="sm" onClick={() => setChanging(true)}>
                  <LocalizedText text="调整分组" />
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                <LocalizedText text={member ? "当前可用模型" : "Personal Models"} />
              </p>
              {member && access.isPending && (
                <p role="status">
                  <LocalizedText text="加载中" />
                </p>
              )}
              {member && access.isError && (
                <AccountNotice error={localizedProperty(access.error, "message", access.error.message)} message="" />
              )}
              {(!member || access.isSuccess) && (
                <div className="flex flex-wrap gap-2">
                  <ModelBadges models={models} noModels={noModels} />
                </div>
              )}
              {member && access.data?.model_access_source !== "personal" && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <LocalizedText text="模型权限由用户组统一管理，实际调用仍受 API Key 权限、余额和调用限额限制。" />
                </p>
              )}
            </div>
          </>
        )}
        {changing && member && (
          <UserGroupChangeDialog token={token} userIds={ids} onClose={() => setChanging(false)} onSaved={groupSaved} />
        )}
      </CardContent>
    </Card>
  );
}
