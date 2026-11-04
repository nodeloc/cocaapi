"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LocalizedText } from "@/lib/i18n";
import UserWalletPanel, { type WalletAdjustmentRequests } from "./UserWalletPanel";
export type { WalletAdjustmentRequests } from "./UserWalletPanel";

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
  const [busy, setBusy] = useState(false);
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
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <UserWalletPanel token={token} userId={userId} requests={requests} onBusyChange={setBusy} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
