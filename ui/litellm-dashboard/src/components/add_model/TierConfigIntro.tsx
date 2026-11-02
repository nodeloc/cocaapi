"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";

import { type ComplexityRouterConfigValue, usesLlmClassifier } from "./ComplexityRouterConfig";
import { restrictedBy } from "./TierRestrictions";

const TierConfigIntro: React.FC<{ value: ComplexityRouterConfigValue }> = ({ value }) => {
  useUiLocale();
  return (
    <div className="mb-4 space-y-2 text-sm text-muted-foreground">
      <p>
        <LocalizedText
          text={"Choose one or more models for each tier. Requests use the models in their assigned tier"}
        />
      </p>
      <p className="text-xs">
        {restrictedBy(value, "displayNames")?.reason ??
          translateMessage("Display names appear in the dashboard and spend logs")}
        {!value.custom_tier_set &&
          usesLlmClassifier(value.classifier_type) &&
          translateMessage(". Your judge model also uses these names to classify requests")}
      </p>
    </div>
  );
};

export default TierConfigIntro;
