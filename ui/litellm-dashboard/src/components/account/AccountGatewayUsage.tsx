"use client";
import { Suspense } from "react";
import UsagePage from "@/app/(dashboard)/usage/page";
import LogsPage from "@/app/(dashboard)/logs/page";
import CustomerNativePage from "./native/CustomerNativePage";
export default function AccountGatewayUsage() {
  return (
    <CustomerNativePage title="Usage">
      <Suspense>
        <UsagePage />
      </Suspense>
    </CustomerNativePage>
  );
}
export function AccountGatewayLogs() {
  return (
    <CustomerNativePage title="Logs">
      <Suspense>
        <LogsPage />
      </Suspense>
    </CustomerNativePage>
  );
}
