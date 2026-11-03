"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { uiHref } from "@/utils/uiHref";

export default function CommercePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`${uiHref("users")}?userTab=wallets`);
  }, [router]);
  return null;
}
