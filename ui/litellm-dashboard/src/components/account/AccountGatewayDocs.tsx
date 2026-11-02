"use client";
import { translateMessage, useUiLocale } from "@/lib/i18n";

import APIReferenceView from "@/app/(dashboard)/api-reference/_components/APIReferenceView";
import CustomerNativePage from "./native/CustomerNativePage";
export default function AccountGatewayDocs() {
  useUiLocale();
  const settings = { PROXY_BASE_URL: typeof window === "undefined" ? "" : `${window.location.origin}/v1` };
  return (
    <CustomerNativePage title={translateMessage("API Reference")}>
      <APIReferenceView proxySettings={settings} />
    </CustomerNativePage>
  );
}
