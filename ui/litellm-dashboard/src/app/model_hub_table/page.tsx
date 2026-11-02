"use client";
import { LocalizedText, useUiLocale } from "@/lib/i18n";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ModelHubTable from "@/components/AIHub/ModelHubTable";

function PublicModelHubTableContent() {
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

  return (
    <ModelHubTable
      accessToken={accessToken}
      publicPage={true}
      premiumUser={false}
      userRole={null}
      canOpenPlayground={false}
    />
  );
}

export default function PublicModelHubTable() {
  useUiLocale();
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <LocalizedText text={"Loading..."} />
        </div>
      }
    >
      <PublicModelHubTableContent />
    </Suspense>
  );
}
