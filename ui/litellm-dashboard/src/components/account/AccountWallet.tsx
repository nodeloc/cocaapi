"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountApi, AccountRequestError, type Profile } from "./accountApi";
import { AccountNotice } from "./AccountShell";
import { AccountDashboardShell } from "./AccountDashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { walletApi, type Wallet, type Ledger, type Orders, type PaymentMethods, type Order } from "./walletApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stat } from "@/app/(dashboard)/usage/_components/components/overview/Primitives";
import { RefreshCw } from "lucide-react";
import { formatCredits } from "./money";
import { LedgerTable, OrdersTable, Pager } from "./WalletTables";

export default function AccountWallet({ ordersOnly = false }: { ordersOnly?: boolean }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [orders, setOrders] = useState<Orders | null>(null);
  const [methods, setMethods] = useState<PaymentMethods | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("10.00");
  const [network, setNetwork] = useState<Order["network"]>("tron");
  const request = useRef<{ body: string; key: string } | null>(null);
  const showError = useCallback(
    (reason: unknown) => {
      if (reason instanceof AccountRequestError && reason.status === 401) {
        router.replace("/account/login/");
        return;
      }
      setError(reason instanceof Error ? reason.message : "请求失败，请稍后重试。");
    },
    [router],
  );
  const load = useCallback(async () => {
    const [account, balance, options] = await Promise.all([
      accountApi.profile(),
      walletApi.balance(),
      walletApi.methods(),
    ]);
    setProfile(account);
    setWallet(balance);
    setMethods(options);
    if (options.networks.length)
      setNetwork((current) =>
        options.networks.some((item) => item.id === current) ? current : options.networks[0].id,
      );
    if (ordersOnly) setOrders(await walletApi.orders(offset));
    else setLedger(await walletApi.ledger(offset));
  }, [offset, ordersOnly]);
  useEffect(() => {
    void Promise.resolve().then(load).catch(showError);
  }, [load, showError]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await load();
    } catch (reason) {
      showError(reason);
    } finally {
      setBusy(false);
    }
  };
  const redeem = (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    void run(async () => {
      const entry = await walletApi.redeem(code, profile.csrf_token);
      setCode("");
      setMessage(`兑换成功，已入账 ${formatCredits(entry.delta_units)}。`);
    });
  };
  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    const body = JSON.stringify({ amount, network });
    if (request.current?.body !== body) request.current = { body, key: crypto.randomUUID() };
    const key = request.current.key;
    void run(async () => {
      await walletApi.create({ amount_usd: amount, network }, profile.csrf_token, key);
      request.current = null;
      router.push("/account/orders/");
    });
  };
  return (
    <AccountDashboardShell
      title={ordersOnly ? "充值订单" : "余额与充值"}
      description="查看余额、兑换额度和充值记录"
      profile={profile}
    >
      <AccountNotice error={error} message={message} />
      {!wallet && !error && <p role="status">正在加载钱包…</p>}
      {wallet && (
        <>
          <div className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-3 sm:divide-x">
            {[
              { label: "可用余额（USD 额度）", value: wallet.available_units },
              { label: "累计入账", value: wallet.credited_units },
              { label: "累计扣减", value: wallet.debited_units },
            ].map((item) => (
              <div key={item.label} className="min-w-0 border-b px-5 py-4 last:border-b-0 sm:border-b-0">
                <Stat
                  label={item.label}
                  value={formatCredits(item.value)}
                  size="lg"
                  exact={formatCredits(item.value)}
                />
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">当前余额用于账户额度管理，API 密钥与调用扣费将在后续接入。</p>
          {!profile?.email_verified && (
            <p className="text-sm text-muted-foreground">
              请先在
              <a href="/account/profile/" className="underline">
                我的账号
              </a>
              验证邮箱，再进行兑换或充值。
            </p>
          )}
          {!ordersOnly && (
            <>
              <div className="grid items-start gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <h2>兑换码</h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={redeem} className="space-y-4">
                      <Label htmlFor="redeem-code">兑换码</Label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          id="redeem-code"
                          autoComplete="off"
                          spellCheck={false}
                          value={code}
                          onChange={(event) => setCode(event.target.value)}
                          minLength={16}
                          maxLength={100}
                          required
                          disabled={busy || !profile?.email_verified || !methods?.redemption_enabled}
                        />
                        <Button
                          type="submit"
                          disabled={busy || !profile?.email_verified || !methods?.redemption_enabled}
                        >
                          兑换
                        </Button>
                      </div>
                      {methods && !methods.redemption_enabled && (
                        <p className="text-xs text-muted-foreground">兑换服务尚未开放。</p>
                      )}
                    </form>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <h2>USDT 充值</h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={create} className="space-y-4">
                      {!methods?.enabled ? (
                        <p className="text-sm text-muted-foreground">
                          USDT 支付尚未开放，网关接入后可选择网络并创建订单。
                        </p>
                      ) : (
                        <fieldset disabled={busy || !profile?.email_verified} className="space-y-3">
                          <Label htmlFor="recharge-amount">充值额度（USD）</Label>
                          <Input
                            id="recharge-amount"
                            inputMode="decimal"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            required
                            pattern="[0-9]+(\.[0-9]{1,2})?"
                          />
                          <Label htmlFor="recharge-network">支付网络</Label>
                          <Select
                            value={network}
                            items={methods.networks.map((item) => ({ value: item.id, label: item.label }))}
                            onValueChange={(value) => {
                              const option = methods.networks.find((item) => item.id === value);
                              if (option) setNetwork(option.id);
                            }}
                            disabled={busy || !profile?.email_verified}
                          >
                            <SelectTrigger id="recharge-network" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {methods.networks.map((item) => (
                                <SelectItem value={item.id} key={item.id}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            以支付页面显示的 USDT 数量和网络为准，支付后由服务端查单确认入账。
                          </p>
                          <Button type="submit">创建充值订单</Button>
                        </fieldset>
                      )}
                    </form>
                  </CardContent>
                </Card>
              </div>
              <section className="space-y-3" aria-labelledby="wallet-ledger-heading">
                <h2 id="wallet-ledger-heading" className="text-base font-medium">
                  余额明细
                </h2>
                {ledger && (
                  <>
                    <LedgerTable ledger={ledger} />
                    <Pager offset={offset} hasMore={ledger.has_more} busy={busy} onPage={setOffset} />
                  </>
                )}
              </section>
            </>
          )}
          {ordersOnly && orders && (
            <section className="space-y-3" aria-labelledby="wallet-orders-heading">
              <div className="flex items-center justify-between">
                <h2 id="wallet-orders-heading" className="text-base font-medium">
                  订单记录
                </h2>
                <Button variant="outline" disabled={busy} onClick={() => run(async () => {})}>
                  <RefreshCw />
                  刷新列表
                </Button>
              </div>
              <OrdersTable
                orders={orders}
                busy={busy}
                checkout
                onRefresh={(id) => {
                  if (profile)
                    void run(async () => {
                      const order = await walletApi.refresh(id, profile.csrf_token);
                      setMessage(order.status === "paid" ? "充值已到账。" : "已更新订单状态。");
                    });
                }}
              />
              <Pager offset={offset} hasMore={orders.has_more} busy={busy} onPage={setOffset} />
            </section>
          )}
        </>
      )}
    </AccountDashboardShell>
  );
}
