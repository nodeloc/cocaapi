"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";
import { AccountRequestError } from "./accountApi";
import { billingGroupsApi, type BillingGroups, type BillingMember } from "./billingGroupsApi";
import { GroupSelect } from "./BillingGroupMembers";
import { AccountNotice } from "./AccountShell";

type Snapshot = { members: BillingMember[]; groups: BillingGroups["user_groups"] };

export default function UserGroupChangeDialog({
  token,
  userIds,
  skippedCount = 0,
  onClose,
  onSaved,
}: {
  token: string;
  userIds: readonly string[];
  skippedCount?: number;
  onClose: () => void;
  onSaved: (members: readonly BillingMember[]) => void;
}) {
  useUiLocale();
  const client = useQueryClient();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [groupId, setGroupId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([billingGroupsApi.read(token), billingGroupsApi.lookup(token, userIds)])
      .then(([config, result]) => {
        if (!active) return;
        if (
          result.items.length !== userIds.length ||
          result.items.some((member) => !userIds.includes(member.user_id))
        ) {
          setError(translateMessage("部分账户已不存在，请刷新列表后重试。"));
          return;
        }
        setSnapshot({ groups: config.user_groups, members: result.items });
        setGroupId((previous) => {
          if (config.user_groups.some((group) => group.id === previous)) return previous;
          const current = result.items[0]?.group_id;
          const same = result.items.every((member) => member.group_id === current);
          const known = config.user_groups.some((group) => group.id === current);
          return current && same && known ? current : "default";
        });
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? localizedProperty(cause, "message", cause.message)
              : translateMessage("请求失败，请稍后重试。"),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, userIds, reload]);
  const validGroup = snapshot?.groups.some((group) => group.id === groupId) ?? false;
  const reloadMembers = () => {
    setLoading(true);
    setSnapshot(null);
    setError("");
    setReload((value) => value + 1);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!snapshot || busy || loading || !reason.trim() || !validGroup) return;
    setBusy(true);
    setError("");
    try {
      const result = await billingGroupsApi.assignBatch(token, {
        group_id: groupId,
        reason: reason.trim(),
        members: snapshot.members.map((member) => ({ user_id: member.user_id, expected_version: member.version })),
      });
      await client.invalidateQueries({ queryKey: ["userGroupMemberships"] });
      onSaved(result.items);
      onClose();
    } catch (cause) {
      if (cause instanceof AccountRequestError && cause.status === 409) {
        setError(translateMessage("用户分组已被修改，请重新载入后重试。本次未调整任何用户。"));
        return;
      }
      setError(
        cause instanceof Error
          ? localizedProperty(cause, "message", cause.message)
          : translateMessage("请求失败，请稍后重试。"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <LocalizedText text={userIds.length > 1 ? "批量调整用户组" : "调整用户组"} />
          </DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={save}>
          <p className="text-sm text-muted-foreground">
            {translateMessage("已选择 %{0} 个用户", [String(userIds.length)])}
          </p>
          {skippedCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {translateMessage("已跳过 %{0} 个系统账户", [String(skippedCount)])}
            </p>
          )}
          <AccountNotice error={error} message="" />
          {loading && (
            <p role="status" className="text-sm text-muted-foreground">
              <LocalizedText text="加载中" />
            </p>
          )}
          {snapshot && (
            <>
              <div className="space-y-2">
                <Label htmlFor="group-change-target">
                  <LocalizedText text="目标用户组" />
                </Label>
                <GroupSelect
                  id="group-change-target"
                  value={groupId}
                  groups={snapshot.groups}
                  disabled={busy}
                  onChange={setGroupId}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="group-change-reason">
                  <LocalizedText text="调整原因" />
                </Label>
                <Input
                  id="group-change-reason"
                  required
                  maxLength={500}
                  value={reason}
                  disabled={busy}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                <LocalizedText text="调整后按新用户组的模型权限和倍率处理后续调用，进行中的调用保留原计费规则。" />
              </p>
            </>
          )}
          <DialogFooter>
            {error && (
              <Button type="button" variant="outline" disabled={busy || loading} onClick={reloadMembers}>
                <LocalizedText text="重新载入" />
              </Button>
            )}
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              <LocalizedText text="取消" />
            </Button>
            <Button type="submit" disabled={busy || loading || !snapshot || !validGroup || !reason.trim()}>
              <LocalizedText text="保存用户组" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
