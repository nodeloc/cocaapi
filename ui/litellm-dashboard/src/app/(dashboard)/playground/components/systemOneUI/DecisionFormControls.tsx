"use client";
import { LocalizedText, localizedProperty, useUiLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cva.config";
import { Plus, Trash2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import { IssueList, ValidationStatus } from "./ValidationFeedback";
import type { PayloadValidation } from "./lib/validatePayload";

export function RemoveButton(cocaCopyProps0: { label: string; onClick: () => void }) {
  const { label, onClick } = cocaCopyProps0;
  useUiLocale();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={localizedProperty(cocaCopyProps0, "label", label)}
      title={localizedProperty(cocaCopyProps0, "label", label)}
      onClick={onClick}
    >
      <Trash2 />
    </Button>
  );
}

export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  useUiLocale();
  return (
    <Button variant="outline" size="sm" className="w-fit" onClick={onClick}>
      <Plus />
      {children}
    </Button>
  );
}

export function FormFrame({ validation, children }: { validation: PayloadValidation<unknown>; children: ReactNode }) {
  useUiLocale();
  const issuesId = useId();

  return (
    <div
      className={cn(
        "flex min-h-96 flex-1 flex-col overflow-hidden rounded-md border bg-background",
        !validation.isValid && "border-destructive/60",
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-sm font-medium">
          <LocalizedText text={"Request form"} />
        </span>
        <ValidationStatus validation={validation} />
      </div>
      <div className="grid min-h-80 flex-1 content-start gap-4 overflow-auto p-3">{children}</div>
      <IssueList id={issuesId} validation={validation} />
    </div>
  );
}
