"use client";
import { localizedProperty, useUiLocale } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import React from "react";

const TierRowSelect: React.FC<{
  label: string;
  options: { value: string; label: string }[];
  value: string | null;
  onValueChange: (rowId: string) => void;
  placeholder?: string;
}> = (cocaCopyProps0) => {
  const { label, options, value, onValueChange, placeholder } = cocaCopyProps0;
  useUiLocale();
  return (
    <Select items={options} value={value} onValueChange={(rowId: string | null) => rowId && onValueChange(rowId)}>
      <SelectTrigger aria-label={localizedProperty(cocaCopyProps0, "label", label)} className="w-full">
        <SelectValue placeholder={localizedProperty(cocaCopyProps0, "placeholder", placeholder)} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {localizedProperty(option, "label", option.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default TierRowSelect;
