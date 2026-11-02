"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";

import React, { useState } from "react";
import Link from "next/link";
import { Info, X } from "lucide-react";

const DEPRECATION_DISCUSSION_URL = "https://github.com/BerriAI/litellm/discussions/32090";
const DEPRECATION_TARGET_DATE = "September 1, 2026";

interface DeprecationBannerProps {
  featureName: string;
}

export const DeprecationBanner: React.FC<DeprecationBannerProps> = ({ featureName }) => {
  useUiLocale();
  const [isClosed, setIsClosed] = useState(false);

  if (isClosed) {
    return null;
  }

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{translateMessage("%{0} is on a draft deprecation list", [featureName])}</p>
        <p className="mt-1 break-words text-muted-foreground">
          {translateMessage(
            "%{0} is one of several experimental features we're considering removing, potentially as early as %{1}. This list is a draft and is not final. If you rely on this feature, please share feedback on the ",
            [featureName, DEPRECATION_TARGET_DATE],
          )}
          <Link
            href={DEPRECATION_DISCUSSION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            <LocalizedText text={"deprecation discussion"} />
          </Link>
          .
        </p>
      </div>
      <button
        type="button"
        aria-label={translateMessage("Close")}
        onClick={() => setIsClosed(true)}
        className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
};
