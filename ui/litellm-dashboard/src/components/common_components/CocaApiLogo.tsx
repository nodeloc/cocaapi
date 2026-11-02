"use client";
import { translateMessage, useUiLocale } from "@/lib/i18n";
import { cn } from "@/lib/cva.config";
import { withServerRoot } from "@/lib/assetPaths";
import { serverRootPath } from "@/lib/serverRootPath";
import Image from "next/image";

export function cocaApiLogoSrc({ dark = false, compact = false } = {}): string {
  const variant = compact ? "mark" : "logo-horizontal";
  return withServerRoot(`/ui/assets/cocaapi/cocaapi-${variant}-${dark ? "white" : "black"}.svg`, serverRootPath);
}

export function CocaApiLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  useUiLocale();
  const size = compact ? "size-7" : "h-auto w-40";
  return (
    <span className="inline-flex shrink-0 items-center">
      <Image
        src={cocaApiLogoSrc({ compact })}
        width={compact ? 104 : 446}
        height={compact ? 104 : 96}
        alt={translateMessage("CocaAPI")}
        loading="eager"
        className={cn(size, "object-contain dark:hidden", className)}
      />
      <Image
        src={cocaApiLogoSrc({ compact, dark: true })}
        width={compact ? 104 : 446}
        height={compact ? 104 : 96}
        alt={translateMessage("CocaAPI")}
        loading="eager"
        className={cn(size, "hidden object-contain dark:block", className)}
      />
    </span>
  );
}
