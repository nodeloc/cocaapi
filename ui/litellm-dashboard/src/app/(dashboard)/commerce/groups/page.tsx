"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { uiHref } from "@/utils/uiHref";

export default function BillingGroupsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`${uiHref("access-groups")}?groupTab=billing`);
  }, [router]);
  return null;
}
