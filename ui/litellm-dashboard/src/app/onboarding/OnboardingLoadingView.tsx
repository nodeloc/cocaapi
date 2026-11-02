"use client";
import { translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import { UiLoadingSpinner } from "@/components/ui/ui-loading-spinner";

export function OnboardingLoadingView() {
  useUiLocale();
  return (
    <div className="mx-auto w-full max-w-md mt-10 flex justify-center">
      <UiLoadingSpinner
        role="status"
        aria-label={translateMessage("Loading invitation")}
        className="size-8 text-muted-foreground"
      />
    </div>
  );
}
