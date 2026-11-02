"use client";
import { translateMessage, useUiLocale } from "@/lib/i18n";

import APIReferenceView from "@/app/(dashboard)/api-reference/_components/APIReferenceView";
import CustomerNativePage from "./native/CustomerNativePage";
const settings = { PROXY_BASE_URL: "https://cocaapi.com/v1" };
export default function AccountGatewayDocs() {
  useUiLocale();
  return (
    <CustomerNativePage title={translateMessage("API Reference")}>
      <APIReferenceView proxySettings={settings} />
    </CustomerNativePage>
  );
}
