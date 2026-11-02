"use client";
import { LocalizedText, useUiLocale } from "@/lib/i18n";
import { Shield } from "lucide-react";

import { Button } from "@/components/ui/button";

interface SSOSettingsEmptyPlaceholderProps {
  onAdd: () => void;
}

export default function SSOSettingsEmptyPlaceholder({ onAdd }: SSOSettingsEmptyPlaceholderProps) {
  useUiLocale();
  return (
    <div className="flex w-full flex-col items-center rounded-lg border border-dashed border-border bg-card p-12 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <Shield className="size-6 text-muted-foreground" />
      </div>
      <h4 className="text-base font-semibold text-foreground">
        <LocalizedText text={"No SSO Configuration Found"} />
      </h4>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        <LocalizedText
          text={
            "Configure Single Sign-On (SSO) to enable seamless authentication for your team members using your identity provider."
          }
        />
      </p>
      <Button size="lg" onClick={onAdd} className="mt-4">
        <LocalizedText text={"Configure SSO"} />
      </Button>
    </div>
  );
}
