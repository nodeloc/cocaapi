"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { activateLocale } from "./locale";
import { useUiLocale } from "./useUiLocale";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useUiLocale();
  const pathname = usePathname();
  useEffect(activateLocale, []);
  useEffect(() => {
    if (!locale) return;
    const account = /(?:^|\/)account(?:\/|$)/.test(pathname ?? "");
    const titles = account
      ? { en: "CocaAPI Account", zh: "CocaAPI 用户中心" }
      : { en: "CocaAPI Dashboard", zh: "CocaAPI 管理后台" };
    document.title = titles[locale];
  }, [locale, pathname]);
  if (!locale)
    return (
      <div role="status" className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        CocaAPI
      </div>
    );
  return children;
}
