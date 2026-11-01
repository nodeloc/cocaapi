"use client";
import HomePage from "@/app/(dashboard)/home/_components/HomePage";
import CustomerNativePage from "./native/CustomerNativePage";
export default function AccountGatewayHome() {
  return (
    <CustomerNativePage title="Home">
      <HomePage />
    </CustomerNativePage>
  );
}
