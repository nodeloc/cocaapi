"use client";
import { translateMessage, useUiLocale } from "@/lib/i18n";

import { Suspense } from "react";
import ApiKeysDashboard from "@/app/(dashboard)/api-keys/ApiKeysDashboard";
import CustomerNativePage from "./native/CustomerNativePage";

export default function AccountGatewayKeys() {
  useUiLocale();
  return (
    <CustomerNativePage title={translateMessage("Virtual Keys")}>
      <Suspense>
        <ApiKeysDashboard />
      </Suspense>
    </CustomerNativePage>
  );
}
