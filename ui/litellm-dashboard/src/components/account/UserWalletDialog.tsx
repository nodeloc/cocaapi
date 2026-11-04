"use client";

import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";
import { AccountNotice } from "./AccountShell";
import { LedgerTable, Pager } from "./WalletTables";
import { walletApi, type Adjustment } from "./walletApi";
import { formatCredits } from "./money";
import { useUserWallets } from "./UserWalletCells";

function errorText(cause: unknown): string {
  return cause instanceof Error
    ? localizedProperty(cause, "message", cause.message)
    : translateMessage("请求失败，请稍后重试。");
}

export type WalletAdjustmentRequests = Map<string, { body: Adjustment; key: string }>;

export default function UserWalletDialog({
  token,
  userId,
  email,
  onClose,
  requests,
}: {
  token: string;
  userId: string;
  email: string | null;
  onClose: () => void;
  requests: WalletAdjustmentRequests;
}) {
  useUiLocale();
  const client = useQueryClient();
  const [activeTab, setActiveTab] = useState("ledger");
  const [offset, setOffset] = useState(0);
  const [amount, setAmount] = useState(() => requests.get(userId)?.body.amount_usd ?? "");
  const [direction, setDirection] = useState<Adjustment["direction"]>(
    () => requests.get(userId)?.body.direction ?? "credit",
  );
  const [reason, setReason] = useState(() => requests.get(userId)?.body.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const summaries = useUserWallets([userId], token, true);
  const wallet = summaries.status === "ready" ? summaries.wallets.get(userId) : undefined;
  const ledger = useQuery({
    queryKey: ["adminWalletLedger", userId, offset],
    queryFn: () => walletApi.adminLedger(token, userId, offset),
  });
  const adjust = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !reason.trim() || !amount.trim() || !wallet) return;
    const body: Adjustment = { amount_usd: amount.trim(), direction, reason: reason.trim() };
    const previous = requests.get(userId);
    const key =
      JSON.stringify(previous?.body) === JSON.stringify(body) && previous ? previous.key : crypto.randomUUID();
    requests.set(userId, { body, key });
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await walletApi.adjust(token, userId, body, key);
      requests.delete(userId);
      setAmount("");
      setReason("");
      setMessage(translateMessage("余额已调整，已记录操作人和原因。"));
      setOffset(0);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["adminUserWallets"] }),
        client.invalidateQueries({ queryKey: ["adminWalletLedger", userId] }),
      ]);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    await Promise.all([summaries.refetch(), ledger.refetch()]);
  };
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl" showCloseButton={!busy}>
        <SheetHeader className="border-b pr-12">
          <SheetTitle>
            <LocalizedText text="余额与流水" />
          </SheetTitle>
          <SheetDescription>{email ?? userId}</SheetDescription>
          {email && <p className="break-all font-mono text-xs text-muted-foreground">{userId}</p>}
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-6">
          <AccountNotice error={error} message={message} />
          {summaries.status === "error" && (
            <AccountNotice error={translateMessage("余额暂不可用，请刷新后重试。")} message="" />
          )}
          {summaries.status === "ready" && !wallet && (
            <AccountNotice error={translateMessage("账户已不存在，请刷新用户列表。")} message="" />
          )}
          {wallet && (
            <dl className="grid grid-cols-3 gap-4 rounded-lg border p-4 tabular-nums">
              <div>
                <dt className="text-xs text-muted-foreground">
                  <LocalizedText text="可用余额" />
                </dt>
                <dd className="mt-1 text-xl font-semibold">{formatCredits(wallet.available_units)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  <LocalizedText text="调用冻结" />
                </dt>
                <dd className="mt-1 font-medium">{formatCredits(wallet.reserved_units)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  <LocalizedText text="待补缴" />
                </dt>
                <dd className="mt-1 font-medium">{formatCredits(wallet.debt_units ?? "0")}</dd>
              </div>
              <div className="col-span-3 border-t pt-3 text-sm text-muted-foreground">
                <LocalizedText text="累计入账 / 扣减" />: {formatCredits(wallet.credited_units)} /{" "}
                {formatCredits(wallet.debited_units)}
              </div>
            </dl>
          )}
          {summaries.status === "loading" && (
            <p role="status">
              <LocalizedText text="加载中" />
            </p>
          )}
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value) setActiveTab(value);
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <TabsList variant="line">
                <TabsTrigger value="ledger">
                  <LocalizedText text="余额流水" />
                </TabsTrigger>
                <TabsTrigger value="adjust">
                  <LocalizedText text="调整余额" />
                </TabsTrigger>
              </TabsList>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || ledger.isFetching || summaries.status === "loading"}
                onClick={() => void refresh()}
              >
                <LocalizedText text="刷新" />
              </Button>
            </div>
            <TabsContent value="ledger">
              {ledger.isError && <AccountNotice error={errorText(ledger.error)} message="" />}
              {ledger.isPending && (
                <p role="status">
                  <LocalizedText text="加载中" />
                </p>
              )}
              {ledger.data && (
                <>
                  <LedgerTable ledger={ledger.data} />
                  <Pager
                    offset={offset}
                    hasMore={ledger.data.has_more}
                    busy={busy || ledger.isFetching}
                    onPage={setOffset}
                  />
                </>
              )}
            </TabsContent>
            <TabsContent value="adjust">
              <p className="mb-4 text-sm text-muted-foreground">
                <LocalizedText text="调整将直接影响用户可用额度，请核对用户并填写原因。" />
              </p>
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void adjust(event)}>
                <div className="space-y-2">
                  <Label htmlFor="user-wallet-direction">
                    <LocalizedText text="调整类型" />
                  </Label>
                  <Select
                    value={direction}
                    disabled={busy}
                    onValueChange={(value) => {
                      if (value === "credit" || value === "debit") setDirection(value);
                    }}
                    items={[
                      { value: "credit", label: translateMessage("增加额度") },
                      { value: "debit", label: translateMessage("扣减额度") },
                    ]}
                  >
                    <SelectTrigger id="user-wallet-direction" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">
                        <LocalizedText text="增加额度" />
                      </SelectItem>
                      <SelectItem value="debit">
                        <LocalizedText text="扣减额度" />
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-wallet-amount">
                    <LocalizedText text="金额（USD）" />
                  </Label>
                  <Input
                    id="user-wallet-amount"
                    inputMode="decimal"
                    required
                    maxLength={16}
                    value={amount}
                    disabled={busy}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="user-wallet-reason">
                    <LocalizedText text="调整原因" />
                  </Label>
                  <Input
                    id="user-wallet-reason"
                    required
                    maxLength={500}
                    value={reason}
                    disabled={busy}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </div>
                <Button type="submit" disabled={busy || !wallet || !reason.trim() || !amount.trim()}>
                  <LocalizedText text="确认调整" />
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
