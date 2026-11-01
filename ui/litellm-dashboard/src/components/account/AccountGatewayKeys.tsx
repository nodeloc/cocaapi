"use client";
import { Suspense } from "react";
import ApiKeysDashboard from "@/app/(dashboard)/api-keys/ApiKeysDashboard";
import CustomerNativePage from "./native/CustomerNativePage";

export default function AccountGatewayKeys() {
  return (
    <CustomerNativePage title="Virtual Keys">
      <Suspense>
        <ApiKeysDashboard />
      </Suspense>
    </CustomerNativePage>
  );
}
