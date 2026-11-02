"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";

import type { ComponentProps } from "react";
import { uiHref } from "@/utils/uiHref";
import { cn } from "@/lib/cva.config";

export type ReadinessBannerProps = ComponentProps<"div"> & { activityReady: boolean };

export function ReadinessBanner({ activityReady, className, ...props }: ReadinessBannerProps) {
  useUiLocale();
  return (
    <div
      {...props}
      data-slot="readiness-banner"
      role="status"
      className={cn("flex flex-wrap items-center gap-2 border-y py-3 text-sm text-muted-foreground", className)}
    >
      {activityReady
        ? translateMessage("Connect a worker to run new investigations. Saved results are still available.")
        : translateMessage("Recorded activity is not ready. Saved results are still available.")}
      {!activityReady && (
        <a className="font-medium underline" href={uiHref("lens/?tab=traces")}>
          <LocalizedText text={"Check traces"} />
        </a>
      )}
    </div>
  );
}
