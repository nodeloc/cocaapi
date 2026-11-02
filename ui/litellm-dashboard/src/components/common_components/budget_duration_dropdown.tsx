"use client";
import { LocalizedText, markUiCopy, useUiLocale } from "@/lib/i18n";
import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const NEVER_RESETS_BUDGET_DURATION = "none";

const DURATION_LABELS: Record<string, string> = markUiCopy(
  {
    [NEVER_RESETS_BUDGET_DURATION]: "Never resets",
    "1h": "hourly",
    "24h": "daily",
    "7d": "weekly",
    "30d": "monthly",
  },
  { [NEVER_RESETS_BUDGET_DURATION]: "Never resets", "1h": "hourly", "24h": "daily", "7d": "weekly", "30d": "monthly" },
);

interface BudgetDurationDropdownProps {
  id?: string;
  value?: string | null;
  onChange?: (value: string | null) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  showNeverResets?: boolean;
}

const BudgetDurationDropdown: React.FC<BudgetDurationDropdownProps> = ({
  id,
  value,
  onChange,
  className = "",
  style = {},
  placeholder = "n/a",
  showNeverResets = false,
}) => {
  useUiLocale();
  return (
    <Select items={DURATION_LABELS} value={value || null} onValueChange={onChange}>
      <SelectTrigger id={id} className={`w-full ${className}`} style={style}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={null}>{placeholder}</SelectItem>
        {showNeverResets ? (
          <SelectItem value={NEVER_RESETS_BUDGET_DURATION}>
            <LocalizedText text={"Never resets"} />
          </SelectItem>
        ) : null}
        <SelectItem value="1h">
          <LocalizedText text={"hourly"} />
        </SelectItem>
        <SelectItem value="24h">
          <LocalizedText text={"daily"} />
        </SelectItem>
        <SelectItem value="7d">
          <LocalizedText text={"weekly"} />
        </SelectItem>
        <SelectItem value="30d">
          <LocalizedText text={"monthly"} />
        </SelectItem>
      </SelectContent>
    </Select>
  );
};

export const getBudgetDurationLabel = (value: string | null | undefined): string => {
  if (!value) return "Not set";

  const budgetDurationMap: Record<string, string> = {
    "1h": "hourly",
    "24h": "daily",
    "7d": "weekly",
    "30d": "monthly",
  };

  return budgetDurationMap[value] || value;
};

export default BudgetDurationDropdown;
