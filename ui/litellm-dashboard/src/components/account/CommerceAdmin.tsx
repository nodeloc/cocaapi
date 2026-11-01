"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { isProxyAdminRole } from "@/utils/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { AccountNotice } from "./AccountShell";
import {
  walletApi,
  type Wallets,
  type Batches,
  type GeneratedBatch,
  type Orders,
  type Ledger,
  type Adjustment,
} from "./walletApi";
import { formatCredits } from "./money";
import { LedgerTable, OrdersTable, Pager } from "./WalletTables";

type Section = "wallets" | "redemptions" | "orders";

function batchStatus(disabled: boolean, expiry: string | null): string {
  if (disabled) return "已停用";
  return expiry && new Date(expiry) <= new Date() ? "已到期" : "有效";
}

export default function CommerceAdmin({ section = "wallets" }: { section?: Section }) {
  const { accessToken, userRole, isViewOnly, isAuthorized } = useAuthorized();
  const allowed = isAuthorized && !isViewOnly && isProxyAdminRole(userRole);
  const [wallets, setWallets] = useState<Wallets | null>(null);
  const [batches, setBatches] = useState<Batches | null>(null);
  const [orders, setOrders] = useState<Orders | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [ledgerOffset, setLedgerOffset] = useState(0);
  const [selected, setSelected] = useState("");
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [generated, setGenerated] = useState<GeneratedBatch | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("10.00");
  const [count, setCount] = useState("1");
  const [expiry, setExpiry] = useState("");
  const [direction, setDirection] = useState<Adjustment["direction"]>("credit");
  const [reason, setReason] = useState("");
  const [disableId, setDisableId] = useState("");
  const [disableReason, setDisableReason] = useState("");
  const request = useRef<{ body: string; key: string } | null>(null);
  const showError = (cause: unknown) => setError(cause instanceof Error ? cause.message : "请求失败，请稍后重试。");
  const load = useCallback(async () => {
    if (!allowed || !accessToken) return;
    if (section === "wallets") setWallets(await walletApi.wallets(accessToken, filter, offset));
    if (section === "redemptions") setBatches(await walletApi.batches(accessToken, offset));
    if (section === "orders") setOrders(await walletApi.adminOrders(accessToken, filter, offset));
  }, [allowed, accessToken, section, filter, offset]);
  useEffect(() => {
    void Promise.resolve().then(load).catch(showError);
  }, [load]);
  useEffect(() => {
    let active = true;
    if (selected && accessToken && allowed)
      void walletApi
        .adminLedger(accessToken, selected, ledgerOffset)
        .then((value) => {
          if (active) setLedger(value);
        })
        .catch((cause) => {
          if (active) showError(cause);
        });
    return () => {
      active = false;
    };
  }, [selected, accessToken, allowed, ledgerOffset]);
  const run = async (action: () => Promise<void>) => {
    if (!accessToken || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await load();
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  };
  const keyFor = (body: string) => {
    if (request.current?.body !== body) request.current = { body, key: crypto.randomUUID() };
    return request.current.key;
  };
  const selectWallet = (userId: string) => {
    setSelected(userId);
    setReason("");
    setLedger(null);
    setLedgerOffset(0);
  };
  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setOffset(0);
    setFilter(search.trim());
  };
  const generate = (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken) return;
    const body = {
      name,
      amount_usd: amount,
      count: Number(count),
      expires_at: expiry ? new Date(expiry).toISOString() : null,
    };
    const key = keyFor(JSON.stringify(body));
    void run(async () => {
      setGenerated(await walletApi.generate(accessToken, body, key));
      request.current = null;
      setMessage("批次已创建。请立即导出兑换码，离开或关闭后无法再次查看。");
    });
  };
  const adjust = (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken || !selected) return;
    const body = { amount_usd: amount, direction, reason };
    const key = keyFor(JSON.stringify({ selected, ...body }));
    void run(async () => {
      await walletApi.adjust(accessToken, selected, body, key);
      setReason("");
      request.current = null;
      setMessage("余额已调整，已记录操作人和原因。");
      setLedger(await walletApi.adminLedger(accessToken, selected, 0));
      setLedgerOffset(0);
    });
  };
  const download = () => {
    if (!generated) return;
    const url = URL.createObjectURL(
      new Blob([generated.codes.join("\n") + "\n"], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `redeem-${generated.batch.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };
  if (!allowed)
    return <div className="p-8 text-sm text-muted-foreground">仅完整代理管理员可以管理余额、充值和兑换码。</div>;
  return (
    <div lang="zh-CN" className="w-full p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">账户与充值</h1>
        <p className="text-sm text-muted-foreground mt-2">管理用户额度、兑换码批次和充值订单</p>
      </div>
      <nav aria-label="充值管理导航" className="flex flex-wrap gap-4 border-b pb-3 text-sm">
        {(
          [
            ["wallets", "/ui/commerce/", "用户余额"],
            ["redemptions", "/ui/commerce/redemptions/", "兑换码"],
            ["orders", "/ui/commerce/orders/", "充值订单"],
            ["settings", "/ui/commerce/settings/", "登录与注册"],
          ] as const
        ).map(([id, href, label]) => (
          <a
            key={id}
            href={href}
            aria-current={section === id ? "page" : undefined}
            className={section === id ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}
          >
            {label}
          </a>
        ))}
      </nav>
      <AccountNotice error={error} message={message} />
      <p className="text-sm text-muted-foreground">
        余额按 USD 额度记账。API 调用扣费尚未接入，USDT 网关当前预留接口。
      </p>
      {section !== "redemptions" && (
        <form className="flex flex-col sm:flex-row gap-2" onSubmit={applySearch}>
          <Label className="sr-only" htmlFor="commerce-search">
            搜索
          </Label>
          <Input
            id="commerce-search"
            placeholder={section === "wallets" ? "邮箱或用户 ID" : "订单 ID 或用户 ID"}
            value={search}
            maxLength={section === "wallets" ? 254 : 128}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={busy}>
            搜索
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => run(async () => {})}>
            刷新
          </Button>
        </form>
      )}
      {section === "wallets" && wallets && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead className="text-right tabular-nums">可用余额</TableHead>
                  <TableHead className="text-right tabular-nums">累计入账 / 扣减</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets.items.map((wallet) => (
                  <TableRow key={wallet.user_id}>
                    <TableCell>
                      <p>{wallet.email ?? "未设置邮箱"}</p>
                      <p className="text-xs font-mono text-muted-foreground break-all">{wallet.user_id}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCredits(wallet.available_units)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCredits(wallet.credited_units)} / {formatCredits(wallet.debited_units)}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => selectWallet(wallet.user_id)}>
                        查看与调整
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {wallets.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      暂无用户
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <Pager offset={offset} hasMore={wallets.has_more} busy={busy} onPage={setOffset} />
          </CardContent>
        </Card>
      )}
      {section === "wallets" && selected && (
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-lg font-semibold">余额调整</h2>
            <p className="text-xs font-mono break-all">{selected}</p>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={adjust}>
              <div className="space-y-2">
                <Label htmlFor="adjust-direction">调整类型</Label>
                <select
                  id="adjust-direction"
                  className="w-full border rounded-md bg-background p-2"
                  value={direction}
                  onChange={(event) => setDirection(event.target.value as Adjustment["direction"])}
                >
                  <option value="credit">增加额度</option>
                  <option value="debit">扣减额度</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adjust-amount">金额（USD）</Label>
                <Input
                  id="adjust-amount"
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="adjust-reason">调整原因</Label>
                <Input
                  id="adjust-reason"
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy || !reason.trim()}>
                确认调整
              </Button>
            </form>
            {ledger && (
              <>
                <LedgerTable ledger={ledger} />
                <Pager offset={ledgerOffset} hasMore={ledger.has_more} busy={busy} onPage={setLedgerOffset} />
              </>
            )}
          </CardContent>
        </Card>
      )}
      {section === "redemptions" && (
        <>
          {generated ? (
            <Card>
              <CardContent className="space-y-3">
                <h2 className="text-lg font-semibold">本次生成的兑换码</h2>
                <p className="text-sm text-muted-foreground">原始兑换码仅展示一次，请妥善保存。</p>
                <pre className="max-h-80 overflow-auto rounded-md border bg-muted p-3 text-xs select-all">
                  {generated.codes.join("\n")}
                </pre>
                <div className="flex gap-3">
                  <Button onClick={download}>导出 TXT</Button>
                  <Button variant="outline" onClick={() => setGenerated(null)}>
                    已保存，关闭
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <form onSubmit={generate} className="grid sm:grid-cols-2 gap-4">
                  <h2 className="sm:col-span-2 text-lg font-semibold">创建兑换码批次</h2>
                  <div className="space-y-2">
                    <Label htmlFor="batch-name">批次名称</Label>
                    <Input
                      id="batch-name"
                      required
                      maxLength={120}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="batch-amount">每个兑换额度（USD）</Label>
                    <Input
                      id="batch-amount"
                      required
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="batch-count">数量（1 至 100）</Label>
                    <Input
                      id="batch-count"
                      required
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={count}
                      onChange={(event) => setCount(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="batch-expiry">到期时间（可选，本地时区）</Label>
                    <Input
                      id="batch-expiry"
                      type="datetime-local"
                      value={expiry}
                      onChange={(event) => setExpiry(event.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={busy || !name.trim()}>
                    生成兑换码
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
          {batches && (
            <Card>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>批次</TableHead>
                      <TableHead className="text-right tabular-nums">面值</TableHead>
                      <TableHead>已兑换 / 数量</TableHead>
                      <TableHead>状态 / 有效期</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.items.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell>
                          {batch.name}
                          <p className="text-xs text-muted-foreground font-mono">{batch.id}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCredits(batch.face_units)}</TableCell>
                        <TableCell>
                          {batch.redeemed_count} / {batch.count}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{batchStatus(batch.disabled, batch.expires_at)}</Badge>
                          <p className="text-xs mt-1">
                            {batch.expires_at ? new Date(batch.expires_at).toLocaleString() : "长期有效"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || batch.disabled}
                            onClick={() => {
                              setDisableId(batch.id);
                              setDisableReason("");
                            }}
                          >
                            停用
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {batches.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          暂无兑换码批次
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <Pager offset={offset} hasMore={batches.has_more} busy={busy} onPage={setOffset} />
              </CardContent>
            </Card>
          )}
          {disableId && (
            <Card>
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (accessToken)
                      void run(async () => {
                        await walletApi.disable(accessToken, disableId, disableReason);
                        setDisableId("");
                        setMessage("批次已停用，未使用的兑换码无法继续兑换。");
                      });
                  }}
                >
                  <h2 className="font-semibold">停用批次</h2>
                  <p className="font-mono text-xs">{disableId}</p>
                  <Label htmlFor="disable-reason">停用原因</Label>
                  <Input
                    id="disable-reason"
                    required
                    maxLength={500}
                    value={disableReason}
                    onChange={(event) => setDisableReason(event.target.value)}
                  />
                  <div className="flex gap-3">
                    <Button type="submit" disabled={busy || !disableReason.trim()}>
                      确认停用
                    </Button>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => setDisableId("")}>
                      取消
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </>
      )}
      {section === "orders" && orders && (
        <Card>
          <CardContent>
            <OrdersTable
              orders={orders}
              busy={busy}
              onRefresh={(id) => {
                if (accessToken)
                  void run(async () => {
                    await walletApi.adminRefresh(accessToken, id);
                    setMessage("已从支付网关重新查询订单。");
                  });
              }}
            />
            <Pager offset={offset} hasMore={orders.has_more} busy={busy} onPage={setOffset} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
