"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { localizedProperty, markUiCopy, translateMessage, useUiLocale, getIntlLocale } from "@/lib/i18n";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import type { ReferralItem } from "./referralApi";
import { formatCredits } from "./money";

const copy = {
  pending: "待验证或待发放",
  granted: "已发放",
  inactive: "注册时活动未开启",
  ineligible: "暂不符合奖励条件",
};
const states = markUiCopy(copy, copy);

export function ReferralTable({ items, admin = false }: { items: ReferralItem[]; admin?: boolean }) {
  useUiLocale();
  const inviter: ColumnDef<ReferralItem> = {
    id: "inviter",
    header: translateMessage("邀请人"),
    cell: ({ row }) => <span className="break-all font-mono text-xs">{row.original.inviter_label}</span>,
  };
  const inviteeBonus: ColumnDef<ReferralItem> = {
    id: "invitee-reward",
    header: translateMessage("受邀人奖励"),
    cell: ({ row }) => formatCredits(row.original.invitee_units),
  };
  const basic: ColumnDef<ReferralItem>[] = [
    {
      id: "invitee",
      header: translateMessage("受邀用户"),
      cell: ({ row }) => <span className="break-all font-mono text-xs">{row.original.invitee_label}</span>,
    },
    {
      id: "created",
      header: translateMessage("注册时间"),
      cell: ({ row }) => new Date(row.original.created_at).toLocaleString(getIntlLocale()),
    },
    {
      id: "state",
      header: translateMessage("奖励状态"),
      cell: ({ row }) => (
        <Badge variant="secondary">{localizedProperty(states, row.original.state, states[row.original.state])}</Badge>
      ),
    },
    {
      id: "reward",
      header: translateMessage("邀请奖励"),
      cell: ({ row }) => formatCredits(row.original.inviter_units),
    },
  ];
  return (
    <DataTable
      data={items}
      columns={admin ? [inviter, ...basic, inviteeBonus] : basic}
      getRowId={(row) => row.id}
      paginationMode="none"
      sortingMode="none"
      noDataMessage={translateMessage("暂无邀请记录")}
    />
  );
}
