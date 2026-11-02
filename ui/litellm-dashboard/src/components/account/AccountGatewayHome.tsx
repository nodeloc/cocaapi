"use client";
import { translateMessage, useUiLocale } from "@/lib/i18n";

import HomePage from "@/app/(dashboard)/home/_components/HomePage";
import CustomerNativePage from "./native/CustomerNativePage";
export default function AccountGatewayHome() {
  useUiLocale();
  return (
    <CustomerNativePage title={translateMessage("Home")}>
      <HomePage />
    </CustomerNativePage>
  );
}
