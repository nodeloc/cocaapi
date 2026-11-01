"use client";
import { Suspense } from "react";
import PlaygroundPage from "@/app/(dashboard)/playground/page";
import CustomerNativePage from "./native/CustomerNativePage";
export default function AccountGatewayPlayground() {
  return (
    <CustomerNativePage title="Playground">
      <Suspense>
        <PlaygroundPage />
      </Suspense>
    </CustomerNativePage>
  );
}
