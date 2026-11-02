"use client";
import { LocalizedText, useUiLocale } from "@/lib/i18n";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OnboardingForm } from "./OnboardingForm";

function OnboardingContent() {
  useUiLocale();
  const searchParams = useSearchParams()!;
  const action = searchParams.get("action");
  const variant = action === "reset_password" ? "reset_password" : "signup";
  return <OnboardingForm variant={variant} />;
}

export default function Onboarding() {
  useUiLocale();
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <LocalizedText text={"Loading..."} />
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
