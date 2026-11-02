"use client";
import { translateMessage, useUiLocale } from "@/lib/i18n";

import { Suspense } from "react";
import UsagePage from "@/app/(dashboard)/usage/page";
import LogsPage from "@/app/(dashboard)/logs/page";
import CustomerNativePage from "./native/CustomerNativePage";
export default function AccountGatewayUsage() {
  useUiLocale();
  return (
    <CustomerNativePage title={translateMessage("Usage")}>
      <Suspense>
        <UsagePage />
      </Suspense>
    </CustomerNativePage>
  );
}
export function AccountGatewayLogs() {
  useUiLocale();
  return (
    <CustomerNativePage title={translateMessage("Logs")}>
      <Suspense>
        <LogsPage />
      </Suspense>
    </CustomerNativePage>
  );
}
