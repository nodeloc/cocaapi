"use client";
import { LocalizedText, useUiLocale } from "@/lib/i18n";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PublicModelHubPage from "@/components/public_model_hub";

function PublicModelHubContent() {
  useUiLocale();
  const searchParams = useSearchParams()!;
  const key = searchParams.get("key");
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    if (!key) {
      return;
    }
    setAccessToken(key);
  }, [key]);

  return <PublicModelHubPage accessToken={accessToken} />;
}

export default function PublicModelHub() {
  useUiLocale();
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <LocalizedText text={"Loading..."} />
        </div>
      }
    >
      <PublicModelHubContent />
    </Suspense>
  );
}
