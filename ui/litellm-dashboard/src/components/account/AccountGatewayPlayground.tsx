"use client";
import { translateMessage, useUiLocale } from "@/lib/i18n";

import { Suspense } from "react";
import PlaygroundPage from "@/app/(dashboard)/playground/page";
import CustomerNativePage from "./native/CustomerNativePage";
export default function AccountGatewayPlayground() {
  useUiLocale();
  return (
    <CustomerNativePage title={translateMessage("Playground")}>
      <Suspense>
        <PlaygroundPage />
      </Suspense>
    </CustomerNativePage>
  );
}
