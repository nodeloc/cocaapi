"use client";
import { translateMessage, useUiLocale } from "@/lib/i18n";
import type { ComponentProps } from "react";
import { Check } from "lucide-react";
import { cva, cn } from "@/lib/cva.config";

export type StepState = "complete" | "current" | "upcoming";

const stepIndicator = cva(
  "z-raised flex size-7 shrink-0 items-center justify-center rounded-full bg-card text-xs font-medium",
  {
    variants: {
      state: {
        complete: "bg-success/10 text-success",
        current: "bg-foreground text-background",
        upcoming: "border text-muted-foreground",
      },
    },
  },
);

export type StepIndicatorProps = Omit<ComponentProps<"span">, "children"> & {
  state: StepState;
  index: number;
};

export function StepIndicator({ state, index, className, ...props }: StepIndicatorProps) {
  useUiLocale();
  return (
    <span
      data-slot="step-indicator"
      data-state={state}
      aria-label={
        state === "complete"
          ? translateMessage("Step %{0} complete", [index + 1])
          : translateMessage("Step %{0}", [index + 1])
      }
      className={cn(stepIndicator({ state }), className)}
      {...props}
    >
      {state === "complete" ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}
    </span>
  );
}
