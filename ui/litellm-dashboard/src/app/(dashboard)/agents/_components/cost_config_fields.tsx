"use client";
import { localizedProperty, useUiLocale } from "@/lib/i18n";
import React from "react";
import { Input } from "@/components/ui/input";
import { AGENT_FORM_CONFIG } from "./agent_config";
import { AgentFormField, labelWithHint } from "./AgentFormKit";

export const COST_FIELD_NAMES: readonly string[] = AGENT_FORM_CONFIG.cost.fields.map((field) => field.name);

const CostConfigFields: React.FC = () => {
  useUiLocale();
  return (
    <>
      {AGENT_FORM_CONFIG.cost.fields.map((field) => (
        <AgentFormField
          key={field.name}
          name={field.name}
          label={
            field.tooltip ? labelWithHint(field.label, field.tooltip) : localizedProperty(field, "label", field.label)
          }
        >
          {({ value, onChange, ref, ...control }) => (
            <Input
              {...control}
              ref={ref}
              type="number"
              step="0.000001"
              placeholder={localizedProperty(field, "placeholder", field.placeholder)}
              value={typeof value === "string" || typeof value === "number" ? value : ""}
              onChange={onChange}
            />
          )}
        </AgentFormField>
      ))}
    </>
  );
};

export default CostConfigFields;
