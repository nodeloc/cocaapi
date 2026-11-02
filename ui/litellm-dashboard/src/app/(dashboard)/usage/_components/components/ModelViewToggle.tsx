"use client";
import { localizedProperty, markUiCopy, useUiLocale } from "@/lib/i18n";
export type ModelViewType = "groups" | "individual";

const MODEL_VIEW_OPTIONS: readonly { value: ModelViewType; label: string }[] = [
  markUiCopy({ value: "groups", label: "Public Model Name" }, { label: "Public Model Name" }),
  markUiCopy({ value: "individual", label: "Litellm Model Name" }, { label: "Litellm Model Name" }),
];

interface ModelViewToggleProps {
  value: ModelViewType;
  onChange: (value: ModelViewType) => void;
}

export default function ModelViewToggle({ value, onChange }: ModelViewToggleProps) {
  useUiLocale();
  return (
    <div className="flex bg-muted rounded-lg p-1">
      {MODEL_VIEW_OPTIONS.map((option) => (
        <button
          key={option.value}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            value === option.value ? "bg-card shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onChange(option.value)}
        >
          {localizedProperty(option, "label", option.label)}
        </button>
      ))}
    </div>
  );
}
