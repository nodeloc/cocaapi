"use client";
import { LocalizedText, localizedProperty, useUiLocale } from "@/lib/i18n";

import React from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export interface ModelChoice {
  value: string;
  label: string;
}

interface ModelChoiceComboboxProps {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  choices: ModelChoice[];
  placeholder: string;
  ariaInvalid: true | undefined;
  ariaDescribedBy: string | undefined;
}

const ModelChoiceCombobox: React.FC<ModelChoiceComboboxProps> = (cocaCopyProps0) => {
  const { id, value, onChange, choices, placeholder, ariaInvalid, ariaDescribedBy } = cocaCopyProps0;
  useUiLocale();
  const selected = value ? choices.find((choice) => choice.value === value) ?? { value, label: value } : null;

  return (
    <Combobox
      items={choices}
      value={selected}
      onValueChange={(choice: ModelChoice | null) => onChange(choice?.value ?? null)}
      itemToStringLabel={(choice: ModelChoice) => choice.label}
      isItemEqualToValue={(choice: ModelChoice, current: ModelChoice) => choice.value === current.value}
    >
      <ComboboxInput
        id={id}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        placeholder={localizedProperty(cocaCopyProps0, "placeholder", placeholder)}
        className="w-full"
        showClear={value != null && value !== ""}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          <LocalizedText text={"No models found"} />
        </ComboboxEmpty>
        <ComboboxList>
          {(choice: ModelChoice) => (
            <ComboboxItem key={choice.value} value={choice}>
              {localizedProperty(choice, "label", choice.label)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
};

export default ModelChoiceCombobox;
