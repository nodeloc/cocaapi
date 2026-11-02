"use client";
import { localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";

import React, { useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export interface SearchSelectOption {
  label: string;
  value: string;
  /** Optional muted second line (e.g. an id); also matched when searching. */
  sublabel?: string;
  /** Optional leading glyph (e.g. a provider logo); not matched when searching. */
  icon?: React.ReactNode;
}

interface SearchSelectProps {
  options: SearchSelectOption[];
  value?: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  inputId?: string;
  allowClear?: boolean;
  "aria-label"?: string;
}

const matchesQuery = (option: SearchSelectOption, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    localizedProperty(option, "label", option.label).toLowerCase().includes(q) ||
    (option.sublabel?.toLowerCase().includes(q) ?? false)
  );
};

export function SearchSelect({
  options,
  value,
  onValueChange,
  placeholder = translateMessage("Select…"),
  emptyText = translateMessage("No results"),
  disabled = false,
  className,
  inputId,
  allowClear = true,
  "aria-label": ariaLabel,
}: SearchSelectProps) {
  useUiLocale();
  const [query, setQuery] = useState<{ value: string | null | undefined; text: string } | null>(null);
  const selected =
    value == null || value === "" ? null : options.find((option) => option.value === value) ?? { label: value, value };
  const items =
    selected !== null && !options.some((option) => option.value === selected.value) ? [selected, ...options] : options;
  const selectedLabel = selected ? localizedProperty(selected, "label", selected.label) : "";

  return (
    <Combobox
      items={items}
      value={selected}
      inputValue={query && query.value === value ? query.text : selectedLabel}
      onInputValueChange={(text, details) => setQuery(details.reason === "input-change" ? { value, text } : null)}
      onValueChange={(item: SearchSelectOption | null) => {
        setQuery(null);
        onValueChange(item?.value ?? null);
      }}
      isItemEqualToValue={(a: SearchSelectOption, b: SearchSelectOption) => a.value === b.value}
      itemToStringLabel={(item: SearchSelectOption) => localizedProperty(item, "label", item.label)}
      filter={matchesQuery}
      disabled={disabled}
    >
      <ComboboxInput
        id={inputId}
        aria-label={ariaLabel}
        placeholder={placeholder}
        showClear={allowClear && value != null && value !== ""}
        className={`h-8 w-full text-sm ${className ?? ""}`}
      />
      <ComboboxContent side="bottom" collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(item: SearchSelectOption) => (
            <ComboboxItem key={item.value} value={item}>
              {item.icon}
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{localizedProperty(item, "label", item.label)}</span>
                {item.sublabel != null && item.sublabel !== "" && (
                  <span className="truncate text-xs text-muted-foreground">{item.sublabel}</span>
                )}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
