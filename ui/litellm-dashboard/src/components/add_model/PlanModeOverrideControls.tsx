"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import { Switch } from "@/components/ui/switch";
import { MultiSelect } from "@/components/shared/MultiSelect";
import TierRowSelect from "./TierRowSelect";
import type { ComplexityRouterConfigValue } from "./ComplexityRouterConfig";

const PlanModeOverrideControls: React.FC<{
  value: ComplexityRouterConfigValue;
  onChange: (value: ComplexityRouterConfigValue) => void;
  planModeTierOptions: { value: string; label: string }[];
}> = ({ value, onChange, planModeTierOptions }) => {
  useUiLocale();
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Switch
          checked={value.plan_mode_min_tier !== undefined}
          disabled={planModeTierOptions.length === 0}
          onCheckedChange={(enabled) =>
            onChange({
              ...value,
              plan_mode_min_tier: enabled ? planModeTierOptions.at(-1)?.value : undefined,
            })
          }
          aria-label={translateMessage("Route plan-mode requests to a minimum tier")}
        />
        <strong className="font-semibold">
          <LocalizedText text={"Route plan-mode requests to a minimum tier"} />
        </strong>
      </div>
      <span className="block text-xs mb-3 text-muted-foreground">
        <LocalizedText
          text={
            "Requests from coding agents in plan mode (Claude Code, GitHub Copilot) route to at least this tier. The classifier still wins when it picks higher, and the override only lasts while plan mode is active."
          }
        />
        {planModeTierOptions.length === 0 && translateMessage(" Add models to a tier to enable this.")}
      </span>
      {value.plan_mode_min_tier !== undefined && (
        <div style={{ maxWidth: 320 }}>
          <TierRowSelect
            label={translateMessage("Plan-mode minimum tier")}
            options={planModeTierOptions}
            value={value.plan_mode_min_tier ?? null}
            onValueChange={(tier) => onChange({ ...value, plan_mode_min_tier: tier })}
          />
        </div>
      )}
      <div className="mt-4">
        <strong className="mb-1 block font-semibold">
          <LocalizedText text={"Additional plan-mode sentinels"} />
        </strong>
        <MultiSelect
          options={(value.plan_mode_patterns ?? []).map((pattern) => ({ label: pattern, value: pattern }))}
          value={value.plan_mode_patterns ?? []}
          onValueChange={(patterns) =>
            onChange({ ...value, plan_mode_patterns: patterns.length > 0 ? patterns : undefined })
          }
          placeholder={translateMessage("e.g., enter plan mode")}
          emptyText={translateMessage("Type to add a sentinel")}
          allowCustomValues
          className="w-full"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          <LocalizedText
            text={"Case-sensitive literal strings added to the built-in Claude Code and Copilot plan-mode markers."}
          />
        </span>
      </div>
    </>
  );
};

export default PlanModeOverrideControls;
