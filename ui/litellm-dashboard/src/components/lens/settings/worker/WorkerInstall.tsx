"use client";
import { LocalizedText, useUiLocale } from "@/lib/i18n";

import type { ComponentProps, ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cva.config";
import { SettingsCard } from "../SettingsSection";

export type WorkerInstallProps = ComponentProps<"div"> & {
  connected: boolean;
  /** Rendered once the worker connects, in place of the install steps. */
  children: ReactNode;
};

export function WorkerInstall({ connected, children, className, ...props }: WorkerInstallProps) {
  useUiLocale();
  if (!connected)
    return (
      <SettingsCard {...props} data-slot="worker-install" className={cn("flex flex-col gap-5", className)}>
        <header className="space-y-1">
          <h3 className="text-base font-semibold">
            <LocalizedText text={"Connecting Lens"} />
          </h3>
          <p className="text-sm text-muted-foreground">
            <LocalizedText text={"Your Lens service connects automatically."} />
          </p>
        </header>
        <p role="status" className="text-sm text-muted-foreground">
          <LocalizedText
            text={
              "Connecting your Lens service… This page updates automatically. Check the service logs if it does not connect."
            }
          />
        </p>
      </SettingsCard>
    );
  return (
    <SettingsCard
      {...props}
      data-slot="worker-install"
      className={cn("flex flex-col items-center gap-5 text-center", className)}
    >
      <header className="flex flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="size-6" />
        </div>
        <h3 className="text-base font-semibold">
          <LocalizedText text={"Worker connected"} />
        </h3>
        <p className="text-sm text-muted-foreground">
          <LocalizedText text={"Ready to run investigations."} />
        </p>
      </header>
      {children}
    </SettingsCard>
  );
}
