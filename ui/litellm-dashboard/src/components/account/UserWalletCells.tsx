"use client";

import { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";
import { walletApi, type Wallets } from "./walletApi";
import { formatCredits } from "./money";

export type UserWallet = Wallets["items"][number];
type WalletStatus = "disabled" | "loading" | "ready" | "error";

export function useUserWallets(userIds: readonly string[], token: string | null, enabled: boolean) {
  const ids = [...new Set(userIds)].sort();
  const query = useQuery({
    queryKey: ["adminUserWallets", ids],
    queryFn: () => walletApi.lookupWallets(token ?? "", ids),
    enabled: enabled && Boolean(token) && ids.length > 0,
  });
  const wallets: ReadonlyMap<string, UserWallet> = useMemo(
    () => new Map((query.data?.items ?? []).map((wallet) => [wallet.user_id, wallet])),
    [query.data],
  );
  if (!enabled) return { wallets, status: "disabled" as const, refetch: query.refetch };
  if (query.isError) return { wallets, status: "error" as const, refetch: query.refetch };
  if (query.isPending) return { wallets, status: "loading" as const, refetch: query.refetch };
  return { wallets, status: "ready" as const, refetch: query.refetch };
}

export const UserWalletContext = createContext<{
  wallets: ReadonlyMap<string, UserWallet>;
  status: WalletStatus;
  onOpen?: (userId: string) => void;
}>({ wallets: new Map(), status: "disabled" });

function WalletPlaceholder({ status }: { status: WalletStatus }) {
  useUiLocale();
  if (status === "loading")
    return (
      <span className="text-muted-foreground">
        <LocalizedText text="加载中" />
      </span>
    );
  if (status === "error")
    return (
      <span className="text-muted-foreground">
        <LocalizedText text="暂不可用" />
      </span>
    );
  return <span className="text-muted-foreground">-</span>;
}

export function UserWalletCell({ userId }: { userId: string }) {
  useUiLocale();
  const { wallets, status, onOpen } = useContext(UserWalletContext);
  const wallet = wallets.get(userId);
  if (status !== "ready" || !wallet) return <WalletPlaceholder status={status} />;
  return (
    <div className="space-y-1 tabular-nums">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto px-0 font-medium text-primary"
        aria-label={translateMessage("余额与流水 %{0}", [wallet.email ?? userId])}
        onClick={() => onOpen?.(userId)}
      >
        {formatCredits(wallet.available_units)}
      </Button>
      {wallet.reserved_units !== "0" && (
        <p className="text-xs text-muted-foreground">
          {translateMessage("冻结 %{0}", [formatCredits(wallet.reserved_units)])}
        </p>
      )}
      {(wallet.debt_units ?? "0") !== "0" && (
        <p className="text-xs text-destructive">
          {translateMessage("待补缴 %{0}", [formatCredits(wallet.debt_units ?? "0")])}
        </p>
      )}
    </div>
  );
}

export function UserWalletTotalsCell({ userId }: { userId: string }) {
  const { wallets, status } = useContext(UserWalletContext);
  const wallet = wallets.get(userId);
  if (status !== "ready" || !wallet) return <WalletPlaceholder status={status} />;
  return (
    <span className="tabular-nums">
      {formatCredits(wallet.credited_units)} / {formatCredits(wallet.debited_units)}
    </span>
  );
}
