"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CustomerSessionProvider } from "./native/CustomerSessionProvider";

const publicPages = new Set(["login", "register", "forgot-password", "reset-password", "verify"]);

export default function AccountSessionLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const page = pathname?.split("/").filter(Boolean).at(-1);
  if (page && publicPages.has(page)) return children;
  return <CustomerSessionProvider>{children}</CustomerSessionProvider>;
}
