"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/shared/DataTable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountNotice } from "./AccountShell";
import { Pager } from "./WalletTables";
import { billingGroupsApi, type BillingGroups, type BillingMembers, type BillingMember } from "./billingGroupsApi";

export function GroupSelect({
  id,
  value,
  groups,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  groups: { id: string; name: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  useUiLocale();
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next) onChange(next);
      }}
      items={groups.map((group) => ({ value: group.id, label: group.name }))}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectItem key={group.id} value={group.id}>
            {group.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function BillingGroupMembers({ token, config }: { token: string; config: BillingGroups }) {
  useUiLocale();
  const [members, setMembers] = useState<BillingMembers | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<BillingMember | null>(null);
  const [groupId, setGroupId] = useState("default");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fail = (cause: unknown) =>
    setError(
      cause instanceof Error
        ? localizedProperty(cause, "message", cause.message)
        : translateMessage("请求失败，请稍后重试。"),
    );
  const load = useCallback(async () => {
    const result = await billingGroupsApi.members(token, filter, offset);
    setMembers(result);
  }, [token, filter, offset]);
  useEffect(() => {
    void Promise.resolve().then(load).catch(fail);
  }, [load, config.revision]);
  const select = useCallback((member: BillingMember) => {
    setSelected(member);
    setGroupId(member.group_id);
    setReason("");
    setError("");
    setMessage("");
  }, []);
  const columns = useMemo<ColumnDef<BillingMember>[]>(
    () => [
      markUiCopy(
        {
          id: "user",
          header: "用户",
          cell: ({ row }) => (
            <div>
              <p>{row.original.email ?? translateMessage("未设置邮箱")}</p>
              <p className="max-w-64 break-all whitespace-normal font-mono text-xs text-muted-foreground">
                {row.original.user_id}
              </p>
            </div>
          ),
        },
        { header: "用户" },
      ),
      markUiCopy({ accessorKey: "group_name", header: "用户组" }, { header: "用户组" }),
      markUiCopy(
        { id: "status", header: "账户状态", cell: ({ row }) => (row.original.enabled ? "正常" : "已停用") },
        { header: "账户状态" },
      ),
      markUiCopy(
        {
          id: "actions",
          header: "操作",
          cell: ({ row }) => (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => select(row.original)}>
              <LocalizedText text={"调整分组"} />
            </Button>
          ),
        },
        { header: "操作" },
      ),
    ],
    [busy, select],
  );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await billingGroupsApi.assign(token, selected.user_id, {
        group_id: groupId,
        expected_version: selected.version,
        reason,
      });
      setSelected(null);
      setMessage(translateMessage("用户分组已保存，后续调用按新分组计费。"));
      await load();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };
  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setOffset(0);
    setFilter(search.trim());
  };
  const refresh = () => {
    setSelected(null);
    setError("");
    void load().catch(fail);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>
            <LocalizedText text={"用户归组"} />
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AccountNotice error={error} message={message} />
        <p className="text-sm text-muted-foreground">
          <LocalizedText text={"新注册用户默认进入普通组。归组只调整倍率和禁用规则，账户及 Key 的模型权限继续生效。"} />
        </p>
        <form className="flex flex-wrap gap-2" onSubmit={applySearch}>
          <Label className="sr-only" htmlFor="member-search">
            <LocalizedText text={"搜索用户"} />
          </Label>
          <Input
            id="member-search"
            className="sm:max-w-xs"
            placeholder={translateMessage("邮箱或用户 ID")}
            value={search}
            maxLength={254}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button variant="outline" type="submit" disabled={busy}>
            <LocalizedText text={"搜索用户"} />
          </Button>
          <Button variant="outline" type="button" disabled={busy} onClick={refresh}>
            <LocalizedText text={"刷新用户"} />
          </Button>
        </form>
        {members && (
          <>
            <DataTable
              data={members.items}
              columns={columns}
              getRowId={(member) => member.user_id}
              paginationMode="none"
              sortingMode="none"
              noDataMessage={translateMessage("暂无匹配用户")}
            />
            <Pager offset={offset} hasMore={members.has_more} busy={busy} onPage={setOffset} />
          </>
        )}
        {selected && (
          <form className="grid gap-4 rounded-md border p-4 sm:grid-cols-2" onSubmit={save}>
            <p className="break-all text-sm sm:col-span-2">
              <LocalizedText text={"调整用户："} />
              {selected.email ?? selected.user_id}
            </p>
            <div className="space-y-2">
              <Label htmlFor="member-group">
                <LocalizedText text={"目标用户组"} />
              </Label>
              <GroupSelect
                id="member-group"
                value={groupId}
                groups={config.user_groups}
                disabled={busy}
                onChange={setGroupId}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-reason">
                <LocalizedText text={"归组原因"} />
              </Label>
              <Input
                id="member-reason"
                required
                value={reason}
                maxLength={500}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={busy || !reason.trim()}>
                <LocalizedText text={"保存用户分组"} />
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setSelected(null)}>
                <LocalizedText text={"取消"} />
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
