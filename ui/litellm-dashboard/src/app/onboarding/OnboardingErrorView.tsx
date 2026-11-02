"use client";
import { LocalizedText, useUiLocale } from "@/lib/i18n";
import React from "react";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/shared/Alert";
import { buttonVariants } from "@/components/ui/button";
import { getLoginUrl } from "@/utils/returnUrlUtils";

export function OnboardingErrorView() {
  useUiLocale();
  return (
    <div className="mx-auto w-full max-w-md mt-10">
      <Alert variant="error">
        <CircleAlert />
        <AlertTitle>
          <LocalizedText text={"Failed to load invitation"} />
        </AlertTitle>
        <AlertDescription>
          <LocalizedText text={"The invitation link may be invalid or expired."} />
        </AlertDescription>
      </Alert>
      <div className="mt-4">
        <a href={getLoginUrl()} className={buttonVariants({ variant: "outline" })}>
          <LocalizedText text={"Back to Login"} />
        </a>
      </div>
    </div>
  );
}
