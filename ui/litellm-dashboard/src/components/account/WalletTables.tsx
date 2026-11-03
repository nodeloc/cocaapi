"use client";
import { LocalizedText, getIntlLocale, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/DataTable";
import { formatCredits, networkLabels, orderLabels } from "./money";
import type { Ledger, Orders } from "./walletApi";
import { checkoutDeadline, checkoutExpired, payableCheckout } from "./paymentCheckout";

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
  useUiLocale();
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-2.5 text-sm text-muted-foreground">
      <span>
        <LocalizedText text={"每页 25 条"} />
      </span>
      <div className="flex items-center gap-4">
        <span className="tabular-nums">{translateMessage("第 %{0} 页", [Math.floor(offset / 25) + 1])}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={translateMessage("上一页")}
            disabled={busy || offset === 0}
            onClick={() => onPage(Math.max(0, offset - 25))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={translateMessage("下一页")}
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

const kinds = markUiCopy(
  { adjustment: "人工调整", redemption: "兑换码", recharge: "在线充值", usage: "API 调用扣费", referral: "邀请奖励" },
  { adjustment: "人工调整", redemption: "兑换码", recharge: "在线充值", usage: "API 调用扣费", referral: "邀请奖励" },
);
const ledgerColumns: ColumnDef<Ledger["items"][number]>[] = [
  markUiCopy(
    {
      accessorKey: "created_at",
      header: "时间",
      cell: ({ row }) => new Date(row.original.created_at).toLocaleString(getIntlLocale()),
    },
    { header: "时间" },
  ),
  markUiCopy(
    {
      id: "source",
      header: "来源 / 说明",
      cell: ({ row: { original: entry } }) => (
        <div>
          <p>{localizedProperty(kinds, entry.kind, kinds[entry.kind])}</p>
          <p className="max-w-sm whitespace-normal break-words text-xs text-muted-foreground">{entry.reason}</p>
          {entry.pricing_snapshot && (
            <p className="max-w-sm whitespace-normal text-xs text-muted-foreground">
              {entry.pricing_snapshot.user_group_name} / {entry.pricing_snapshot.model_group_name}
              {" · "}
              {entry.pricing_snapshot.multiplier_millionths / 1_000_000}
              <LocalizedText text={" 倍"} />
              {entry.base_cost_units != null && (
                <>
                  <LocalizedText text={" · 基础费用 "} />
                  {formatCredits(entry.base_cost_units)}
                </>
              )}
            </p>
          )}
        </div>
      ),
    },
    { header: "来源 / 说明" },
  ),
  markUiCopy(
    {
      accessorKey: "delta_units",
      header: "变动",
      meta: { numeric: true },
      cell: ({ row }) => formatCredits(row.original.delta_units),
    },
    { header: "变动" },
  ),
  markUiCopy(
    {
      accessorKey: "available_after",
      header: "变动后余额",
      meta: { numeric: true },
      cell: ({ row }) => formatCredits(row.original.available_after),
    },
    { header: "变动后余额" },
  ),
];

export function LedgerTable({ ledger }: { ledger: Ledger }) {
  useUiLocale();
  return (
    <DataTable
      data={ledger.items}
      columns={ledgerColumns}
      getRowId={(row) => row.id}
      paginationMode="none"
      sortingMode="none"
      noDataMessage={translateMessage("暂无余额变动")}
    />
  );
}

export function OrdersTable({
  orders,
  busy,
  onRefresh,
  onCheckout,
  checkout = false,
}: {
  orders: Orders;
  busy: boolean;
  onRefresh: (id: string) => void;
  onCheckout?: (id: string) => void;
  checkout?: boolean;
}) {
  useUiLocale();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const until = Math.min(
      ...orders.items
        .map((order) => (order.status === "pending" ? checkoutDeadline(order) : null))
        .filter((value): value is number => value !== null && Number.isFinite(value) && value > now),
    );
    if (!Number.isFinite(until)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(until - Date.now(), 0), 2_147_483_647));
    return () => clearTimeout(timer);
  }, [orders.items, now]);
  const columns: ColumnDef<Orders["items"][number]>[] = [
    markUiCopy(
      {
        accessorKey: "id",
        header: "订单",
        cell: ({ row: { original: order } }) => (
          <div>
            <p className="max-w-64 whitespace-normal break-all font-mono text-xs">{order.id}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(order.created_at).toLocaleString(getIntlLocale())}
            </p>
            {!checkout && (
              <p className="max-w-64 whitespace-normal break-all text-xs text-muted-foreground">{order.user_id}</p>
            )}
          </div>
        ),
      },
      { header: "订单" },
    ),
    markUiCopy(
      {
        id: "amount",
        header: "金额 / 网络",
        cell: ({ row: { original: order } }) => (
          <div>
            <p className="tabular-nums">{formatCredits(order.credit_units)}</p>
            <p className="text-xs text-muted-foreground">
              {order.payment_amount ?? order.amount_usdt
                ? `${order.payment_amount ?? order.amount_usdt} ${order.asset} · `
                : ""}
              {localizedProperty(networkLabels, order.network, networkLabels[order.network])}
            </p>
            {order.quote?.rate && (
              <p className="text-xs text-muted-foreground">
                {translateMessage("下单汇率：1 USD = %{0} CNY", [order.quote.rate])}
              </p>
            )}
          </div>
        ),
      },
      { header: "金额 / 网络" },
    ),
    markUiCopy(
      {
        accessorKey: "status",
        header: "状态",
        cell: ({ row: { original: order } }) => (
          <div>
            <Badge variant={order.status === "paid" ? "default" : "secondary"}>
              {checkoutExpired(order, now)
                ? translateMessage("已过期")
                : localizedProperty(orderLabels, order.status, orderLabels[order.status])}
            </Badge>
            {order.status === "review" && (
              <p className="mt-1 text-xs text-muted-foreground">
                <LocalizedText text={"请联系管理员核查"} />
              </p>
            )}
            {order.status === "pending" && !checkoutExpired(order, now) && order.checkout_expires_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                {translateMessage("支付有效期至 %{0}", [
                  new Date(order.checkout_expires_at).toLocaleString(getIntlLocale()),
                ])}
              </p>
            )}
          </div>
        ),
      },
      { header: "状态" },
    ),
    markUiCopy(
      {
        id: "actions",
        header: "操作",
        cell: ({ row: { original: order } }) => (
          <div className="flex items-center gap-2">
            {checkout && onCheckout && payableCheckout(order, now) && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onCheckout(order.id)}>
                <LocalizedText text={"去支付"} />
              </Button>
            )}
            {order.status !== "paid" && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onRefresh(order.id)}>
                <LocalizedText text={"查单"} />
              </Button>
            )}
          </div>
        ),
      },
      { header: "操作" },
    ),
  ];
  return (
    <DataTable
      data={orders.items}
      columns={columns}
      getRowId={(row) => row.id}
      paginationMode="none"
      sortingMode="none"
      noDataMessage={translateMessage("暂无充值订单")}
    />
  );
}
