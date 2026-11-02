"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { isProxyAdminRole } from "@/utils/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/DataTable";
import { MultiSelect } from "@/components/shared/MultiSelect";
import { CommercePage } from "./CommercePage";
import { AccountNotice } from "./AccountShell";
import BillingGroupMembers, { GroupSelect } from "./BillingGroupMembers";
import { billingGroupsApi, type BillingGroups, type BillingRule } from "./billingGroupsApi";

const defaultRule: BillingRule = {
  user_group_id: "default",
  model_group_id: "default",
  multiplier: "1",
  enabled: true,
};
const samePair = (left: BillingRule, right: BillingRule) =>
  left.user_group_id === right.user_group_id && left.model_group_id === right.model_group_id;

export default function BillingGroupsAdmin() {
  useUiLocale();
  const { accessToken, userRole, isViewOnly, isAuthorized } = useAuthorized();
  const allowed = isAuthorized && !isViewOnly && isProxyAdminRole(userRole);
  const [saved, setSaved] = useState<BillingGroups | null>(null);
  const [draft, setDraft] = useState<BillingGroups | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [rule, setRule] = useState<BillingRule>(defaultRule);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const fail = (cause: unknown) =>
    setError(
      cause instanceof Error
        ? localizedProperty(cause, "message", cause.message)
        : translateMessage("请求失败，请稍后重试。"),
    );
  const load = useCallback(async () => {
    if (!allowed || !accessToken) return;
    const [config, catalog] = await Promise.all([
      billingGroupsApi.read(accessToken),
      billingGroupsApi.catalog(accessToken),
    ]);
    setSaved(config);
    setDraft(config);
    setModels(catalog.models);
    setDirty(false);
    setRule(defaultRule);
    setReason("");
  }, [allowed, accessToken]);
  useEffect(() => {
    void Promise.resolve().then(load).catch(fail);
  }, [load]);
  const change = (next: BillingGroups) => {
    setDraft(next);
    setDirty(true);
    setMessage("");
  };
  const refresh = () => {
    setError("");
    setMessage("");
    void load().catch(fail);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !accessToken || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await billingGroupsApi.save(accessToken, {
        revision: draft.revision,
        user_groups: draft.user_groups,
        model_groups: draft.model_groups,
        rules: draft.rules,
        reason,
      });
      setSaved(next);
      setDraft(next);
      setDirty(false);
      setReason("");
      setMessage(translateMessage("分组配置已保存，后续调用使用新倍率，进行中的调用保留原倍率。"));
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };
  const columns = useMemo<ColumnDef<BillingRule>[]>(
    () => [
      markUiCopy(
        {
          id: "user",
          header: "用户组",
          cell: ({ row }) => draft?.user_groups.find((group) => group.id === row.original.user_group_id)?.name,
        },
        { header: "用户组" },
      ),
      markUiCopy(
        {
          id: "model",
          header: "模型组",
          cell: ({ row }) => draft?.model_groups.find((group) => group.id === row.original.model_group_id)?.name,
        },
        { header: "模型组" },
      ),
      markUiCopy(
        { accessorKey: "multiplier", header: "倍率", cell: ({ row }) => `${row.original.multiplier} 倍` },
        { header: "倍率" },
      ),
      markUiCopy(
        {
          id: "enabled",
          header: "调用权限",
          cell: ({ row }) => (
            <Badge variant={row.original.enabled ? "secondary" : "destructive"}>
              {row.original.enabled ? translateMessage("允许") : translateMessage("禁用")}
            </Badge>
          ),
        },
        { header: "调用权限" },
      ),
      markUiCopy(
        {
          id: "actions",
          header: "操作",
          cell: ({ row }) => (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setRule(row.original)}>
                <LocalizedText text={"编辑"} />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (draft) change({ ...draft, rules: draft.rules.filter((item) => !samePair(item, row.original)) });
                }}
              >
                <LocalizedText text={"恢复默认"} />
              </Button>
            </div>
          ),
        },
        { header: "操作" },
      ),
    ],
    [draft, busy],
  );
  if (!allowed)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        <LocalizedText text={"仅完整代理管理员可以配置分组与倍率。"} />
      </div>
    );
  return (
    <CommercePage section="groups">
      <AccountNotice error={error} message={message} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <LocalizedText
            text={"未配置的组间组合默认允许、1 倍。计费金额为基础费用乘倍率，余额检查与调用限额继续生效。"}
          />
        </p>
        <Button type="button" variant="outline" disabled={busy} onClick={refresh}>
          {dirty ? translateMessage("重新载入（放弃未保存修改）") : translateMessage("刷新配置")}
        </Button>
      </div>
      {draft && (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>
                  <h2>
                    <LocalizedText text={"用户组"} />
                  </h2>
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || draft.user_groups.length >= 100}
                  onClick={() =>
                    change({
                      ...draft,
                      user_groups: [...draft.user_groups, { id: `group-${crypto.randomUUID()}`, name: "新用户组" }],
                    })
                  }
                >
                  <LocalizedText text={"添加用户组"} />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {draft.user_groups.map((group) => (
                  <div key={group.id} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`user-name-${group.id}`} className="shrink-0">
                        <LocalizedText text={"组名"} />
                      </Label>
                      <Input
                        id={`user-name-${group.id}`}
                        aria-label={translateMessage("用户组名称 %{0}", [group.name])}
                        required
                        maxLength={80}
                        disabled={busy}
                        value={group.name}
                        onChange={(event) =>
                          change({
                            ...draft,
                            user_groups: draft.user_groups.map((item) =>
                              item.id === group.id ? { ...item, name: event.target.value } : item,
                            ),
                          })
                        }
                      />
                      {group.id === "default" ? (
                        <Badge variant="secondary">
                          <LocalizedText text={"默认组"} />
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            change({
                              ...draft,
                              user_groups: draft.user_groups.filter((item) => item.id !== group.id),
                              rules: draft.rules.filter((item) => item.user_group_id !== group.id),
                            });
                            setRule(defaultRule);
                          }}
                        >
                          <LocalizedText text={"删除"} />
                        </Button>
                      )}
                    </div>
                    <p className="break-all text-xs text-muted-foreground">
                      {group.id === "default" ? translateMessage("新注册用户默认加入此组") : group.id}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>
                  <h2>
                    <LocalizedText text={"模型组"} />
                  </h2>
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || draft.model_groups.length >= 100}
                  onClick={() =>
                    change({
                      ...draft,
                      model_groups: [
                        ...draft.model_groups,
                        { id: `models-${crypto.randomUUID()}`, name: "新模型组", models: [] },
                      ],
                    })
                  }
                >
                  <LocalizedText text={"添加模型组"} />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {draft.model_groups.map((group) => (
                  <div key={group.id} className="space-y-3 rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`model-name-${group.id}`} className="shrink-0">
                        <LocalizedText text={"组名"} />
                      </Label>
                      <Input
                        id={`model-name-${group.id}`}
                        aria-label={translateMessage("模型组名称 %{0}", [group.name])}
                        maxLength={80}
                        required
                        disabled={busy}
                        value={group.name}
                        onChange={(event) =>
                          change({
                            ...draft,
                            model_groups: draft.model_groups.map((item) =>
                              item.id === group.id ? { ...item, name: event.target.value } : item,
                            ),
                          })
                        }
                      />
                      {group.id === "default" ? (
                        <Badge variant="secondary">
                          <LocalizedText text={"默认组"} />
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            change({
                              ...draft,
                              model_groups: draft.model_groups.filter((item) => item.id !== group.id),
                              rules: draft.rules.filter((item) => item.model_group_id !== group.id),
                            });
                            setRule(defaultRule);
                          }}
                        >
                          <LocalizedText text={"删除"} />
                        </Button>
                      )}
                    </div>
                    {group.id === "default" ? (
                      <p className="text-xs text-muted-foreground">
                        <LocalizedText text={"自动包含未分配到其他组的模型。每个公开模型只属于一个模型组。"} />
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor={`model-members-${group.id}`}>
                          <LocalizedText text={"组内模型"} />
                        </Label>
                        <MultiSelect
                          id={`model-members-${group.id}`}
                          disabled={busy}
                          value={group.models}
                          placeholder={translateMessage("选择已有公开模型")}
                          options={[...new Set([...models, ...group.models])].map((model) => ({
                            value: model,
                            label: model,
                            disabled: draft.model_groups.some(
                              (other) => other.id !== group.id && other.models.includes(model),
                            ),
                          }))}
                          onValueChange={(value) =>
                            change({
                              ...draft,
                              model_groups: draft.model_groups.map((item) =>
                                item.id === group.id ? { ...item, models: value } : item,
                              ),
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>
                  <LocalizedText text={"组间倍率与禁用"} />
                </h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  change({ ...draft, rules: [...draft.rules.filter((item) => !samePair(item, rule)), rule] });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="rule-user-group">
                    <LocalizedText text={"调用用户组"} />
                  </Label>
                  <GroupSelect
                    id="rule-user-group"
                    value={rule.user_group_id}
                    groups={draft.user_groups}
                    disabled={busy}
                    onChange={(value) => setRule({ ...rule, user_group_id: value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rule-model-group">
                    <LocalizedText text={"调用模型组"} />
                  </Label>
                  <GroupSelect
                    id="rule-model-group"
                    value={rule.model_group_id}
                    groups={draft.model_groups}
                    disabled={busy}
                    onChange={(value) => setRule({ ...rule, model_group_id: value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rule-multiplier">
                    <LocalizedText text={"调用倍率"} />
                  </Label>
                  <Input
                    id="rule-multiplier"
                    required
                    disabled={busy}
                    inputMode="decimal"
                    pattern="(?:0|[1-9][0-9]{0,3})(?:\.[0-9]{1,6})?"
                    maxLength={11}
                    value={rule.multiplier}
                    onChange={(event) => setRule({ ...rule, multiplier: event.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="rule-enabled"
                    checked={rule.enabled}
                    disabled={busy}
                    onCheckedChange={(checked) => setRule({ ...rule, enabled: checked })}
                  />
                  <Label htmlFor="rule-enabled">
                    <LocalizedText text={"允许调用"} />
                  </Label>
                </div>
                <div className="sm:col-span-2 xl:col-span-4">
                  <Button type="submit" variant="outline" disabled={busy || !rule.multiplier.trim()}>
                    <LocalizedText text={"应用规则"} />
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <LocalizedText
                      text={
                        "倍率支持 0 至 1000，最多六位小数。例如 0.8 为八折，2 为两倍；0 仍要求余额大于 0。应用后须保存分组配置才会生效。"
                      }
                    />
                  </p>
                </div>
              </form>
              <DataTable
                data={draft.rules}
                columns={columns}
                getRowId={(item) => `${item.user_group_id}:${item.model_group_id}`}
                paginationMode="client"
                sortingMode="none"
                noDataMessage={translateMessage("未设置特殊规则，所有组合默认允许、1 倍")}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>
                  <LocalizedText text={"保存配置"} />
                </h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={save}>
                <p className="text-sm text-muted-foreground">
                  <LocalizedText text={"当前版本 "} />
                  {draft.revision}。{dirty ? translateMessage("有未保存的修改。") : translateMessage("配置已同步。")}{" "}
                  <LocalizedText text={"删除在用用户组前，须先调整该组用户的归属。"} />
                </p>
                <Label htmlFor="group-config-reason">
                  <LocalizedText text={"配置变更原因"} />
                </Label>
                <Input
                  id="group-config-reason"
                  value={reason}
                  required
                  disabled={busy}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                />
                <Button type="submit" disabled={busy || !dirty || !reason.trim()}>
                  <LocalizedText text={"保存分组配置"} />
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
      {saved && accessToken && <BillingGroupMembers token={accessToken} config={saved} />}
    </CommercePage>
  );
}
