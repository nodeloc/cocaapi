import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
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
    <div className="flex items-center justify-end gap-3 pt-3 text-sm">
      <Button
        variant="outline"
        size="sm"
        disabled={busy || offset === 0}
        onClick={() => onPage(Math.max(0, offset - 25))}
      >
        上一页
      </Button>
      <span>第 {Math.floor(offset / 25) + 1} 页</span>
      <Button variant="outline" size="sm" disabled={busy || !hasMore} onClick={() => onPage(offset + 25)}>
        下一页
      </Button>
    </div>
  );
}

export function LedgerTable({ ledger }: { ledger: Ledger }) {
  const kinds = { adjustment: "人工调整", redemption: "兑换码", recharge: "USDT 充值" };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>时间</TableHead>
          <TableHead>来源 / 说明</TableHead>
          <TableHead className="text-right tabular-nums">变动</TableHead>
          <TableHead className="text-right tabular-nums">变动后余额</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ledger.items.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</TableCell>
            <TableCell>
              <p>{kinds[entry.kind]}</p>
              <p className="text-xs text-muted-foreground break-all">{entry.reason}</p>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatCredits(entry.delta_units)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCredits(entry.available_after)}</TableCell>
          </TableRow>
        ))}
        {ledger.items.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
              暂无余额变动
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>订单</TableHead>
          <TableHead>金额 / 网络</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.items.map((order) => (
          <TableRow key={order.id}>
            <TableCell>
              <p className="font-mono text-xs break-all">{order.id}</p>
              <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString()}</p>
              {!checkout && <p className="text-xs break-all">{order.user_id}</p>}
            </TableCell>
            <TableCell>
              <p>{formatCredits(order.credit_units)}</p>
              <p className="text-xs text-muted-foreground">
                {order.amount_usdt ? `${order.amount_usdt} USDT · ` : ""}
                {networkLabels[order.network]}
              </p>
            </TableCell>
            <TableCell>
              <Badge variant={order.status === "paid" ? "default" : "secondary"}>{orderLabels[order.status]}</Badge>
              {order.status === "review" && <p className="text-xs text-muted-foreground mt-1">请联系管理员核查</p>}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-2">
                {checkout && order.status === "pending" && order.checkout_url && (
                  <a
                    className="text-sm underline underline-offset-4"
                    href={order.checkout_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    前往支付
                  </a>
                )}
                {order.status !== "paid" && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => onRefresh(order.id)}>
                    查单
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
        {orders.items.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
              暂无充值订单
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
