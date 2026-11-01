"use client";
import { Suspense } from "react";
import ModelsAndEndpointsPage from "@/app/(dashboard)/models-and-endpoints/page";
import BudgetPanel from "@/app/(dashboard)/budgets/_components/budget_panel";
import CustomerNativePage from "./native/CustomerNativePage";
import { useCustomerNative } from "./native/CustomerNativeContext";
function PersonalLimits() {
  const customer = useCustomerNative();
  return <BudgetPanel accessToken={customer?.marker ?? null} />;
}
export default function AccountGatewayCatalog({ limits = false }: { limits?: boolean }) {
  return (
    <CustomerNativePage title={limits ? "Budgets" : "Models + Endpoints"}>
      <Suspense>{limits ? <PersonalLimits /> : <ModelsAndEndpointsPage />}</Suspense>
    </CustomerNativePage>
  );
}
