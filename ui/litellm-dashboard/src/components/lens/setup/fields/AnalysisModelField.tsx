"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";

import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SearchSelect } from "@/components/shared/SearchSelect";
import { analysisModelOptions, type ModelGate } from "./analysisModels";
import type { AnalysisModels } from "./useAnalysisModels";
import type { InvestigationInput } from "../investigationSchema";

export interface AnalysisModelFieldProps {
  readonly models: AnalysisModels;
  readonly gate: ModelGate;
}

export function AnalysisModelField({ models, gate }: AnalysisModelFieldProps) {
  useUiLocale();
  const { control } = useFormContext<InvestigationInput>();
  const model = useWatch({ control, name: "selectedModel" });
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        <LocalizedText text={"Analysis model"} />
      </p>
      <Controller
        control={control}
        name="selectedModel"
        render={({ field }) => (
          <SearchSelect
            aria-label={translateMessage("Analysis model")}
            options={analysisModelOptions(models.models, models.modelDetails)}
            value={field.value ?? ""}
            onValueChange={(value) => field.onChange(value ?? "")}
            placeholder={
              models.modelsLoading ? translateMessage("Loading models…") : translateMessage("Choose a model")
            }
            disabled={models.modelsLoading}
            emptyText={translateMessage("No matching models configured on this gateway")}
          />
        )}
      />
      {models.modelsError && (
        <p role="alert" className="text-sm text-destructive">
          <LocalizedText text={"Could not load models: "} />
          {models.modelsError}
        </p>
      )}
      {gate.unavailable && (
        <p role="alert" className="text-sm text-destructive">
          {model}
          <LocalizedText text={" is no longer available. Choose another analysis model."} />
        </p>
      )}
      {gate.unsupported && (
        <p role="alert" className="text-sm text-destructive">
          <LocalizedText text={"Choose a chat model that supports JSON output."} />
        </p>
      )}
    </div>
  );
}
