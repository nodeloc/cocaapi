"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/DataTable";
import { formatCredits, networkLabels, orderLabels } from "./money";
import type { Ledger, Orders } from "./walletApi";

export function Pager({
  offset,
  hasMore,
  busy,
  onPage,
}: {
  offset: number;
  hasMore: boolean;
  busy: boolean;
  onPage: (offset: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-2.5 text-sm text-muted-foreground">
      <span>每页 25 条</span>
      <div className="flex items-center gap-4">
        <span className="tabular-nums">第 {Math.floor(offset / 25) + 1} 页</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="上一页"
            disabled={busy || offset === 0}
            onClick={() => onPage(Math.max(0, offset - 25))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="下一页"
            disabled={busy || !hasMore}
            onClick={() => onPage(offset + 25)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

const kinds = { adjustment: "人工调整", redemption: "兑换码", recharge: "USDT 充值", usage: "API 调用扣费" };
const ledgerColumns: ColumnDef<Ledger["items"][number]>[] = [
  { accessorKey: "created_at", header: "时间", cell: ({ row }) => new Date(row.original.created_at).toLocaleString() },
  {
    id: "source",
    header: "来源 / 说明",
    cell: ({ row: { original: entry } }) => (
      <div>
        <p>{kinds[entry.kind]}</p>
        <p className="max-w-sm whitespace-normal break-words text-xs text-muted-foreground">{entry.reason}</p>
      </div>
    ),
  },
  {
    accessorKey: "delta_units",
    header: "变动",
    meta: { numeric: true },
    cell: ({ row }) => formatCredits(row.original.delta_units),
  },
  {
    accessorKey: "available_after",
    header: "变动后余额",
    meta: { numeric: true },
    cell: ({ row }) => formatCredits(row.original.available_after),
  },
];

export function LedgerTable({ ledger }: { ledger: Ledger }) {
  return (
    <DataTable
      data={ledger.items}
      columns={ledgerColumns}
      getRowId={(row) => row.id}
      paginationMode="none"
      sortingMode="none"
      noDataMessage="暂无余额变动"
    />
  );
}

export function OrdersTable({
  orders,
  busy,
  onRefresh,
  checkout = false,
}: {
  orders: Orders;
  busy: boolean;
  onRefresh: (id: string) => void;
  checkout?: boolean;
}) {
  const columns: ColumnDef<Orders["items"][number]>[] = [
    {
      accessorKey: "id",
      header: "订单",
      cell: ({ row: { original: order } }) => (
        <div>
          <p className="max-w-64 whitespace-normal break-all font-mono text-xs">{order.id}</p>
          <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString()}</p>
          {!checkout && (
            <p className="max-w-64 whitespace-normal break-all text-xs text-muted-foreground">{order.user_id}</p>
          )}
        </div>
      ),
    },
    {
      id: "amount",
      header: "金额 / 网络",
      cell: ({ row: { original: order } }) => (
        <div>
          <p className="tabular-nums">{formatCredits(order.credit_units)}</p>
          <p className="text-xs text-muted-foreground">
            {order.amount_usdt ? `${order.amount_usdt} USDT · ` : ""}
            {networkLabels[order.network]}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row: { original: order } }) => (
        <div>
          <Badge variant={order.status === "paid" ? "default" : "secondary"}>{orderLabels[order.status]}</Badge>
          {order.status === "review" && <p className="mt-1 text-xs text-muted-foreground">请联系管理员核查</p>}
        </div>
      ),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row: { original: order } }) => (
        <div className="flex items-center gap-2">
          {checkout && order.status === "pending" && order.checkout_url && (
            <Button
              variant="outline"
              size="sm"
              render={<a href={order.checkout_url} target="_blank" rel="noopener noreferrer" />}
            >
              前往支付
            </Button>
          )}
          {order.status !== "paid" && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onRefresh(order.id)}>
              查单
            </Button>
          )}
        </div>
      ),
    },
  ];
  return (
    <DataTable
      data={orders.items}
      columns={columns}
      getRowId={(row) => row.id}
      paginationMode="none"
      sortingMode="none"
      noDataMessage="暂无充值订单"
    />
  );
}
