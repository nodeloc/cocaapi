"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  formatGuardrailMode,
  formatLoggingOnlyScope,
  loggingOnlyContinueFromParams,
  modeIncludesLoggingOnly,
} from "./guardrail_info_helpers";

type GuardrailModeParams = {
  mode?: unknown;
  default_on?: boolean;
  logging_only_scope?: string | null;
  logging_only_continue_on_input_failure?: boolean | null;
};

export const GuardrailModeCard: React.FC<{ litellmParams: GuardrailModeParams }> = ({ litellmParams }) => {
  useUiLocale();
  return (
    <Card className="block p-6">
      <p>
        <LocalizedText text={"Mode"} />
      </p>
      <div className="mt-2">
        <h3 className="text-lg font-medium">{formatGuardrailMode(litellmParams.mode) || "-"}</h3>
        <Badge variant={litellmParams.default_on ? "secondary" : "outline"}>
          {litellmParams.default_on ? translateMessage("Default On") : translateMessage("Default Off")}
        </Badge>
      </div>
      {modeIncludesLoggingOnly(litellmParams.mode) && (
        <div className="mt-4">
          <p>
            <LocalizedText text={"Logging only scope"} />
          </p>
          <h3 className="text-lg font-medium">{formatLoggingOnlyScope(litellmParams.logging_only_scope)}</h3>
          <p className="mt-2">
            <LocalizedText text={"Continue after a flagged request"} />
          </p>
          <h3 className="text-lg font-medium">
            {loggingOnlyContinueFromParams(litellmParams) ? translateMessage("On") : translateMessage("Off")}
          </h3>
        </div>
      )}
    </Card>
  );
};

export const GuardrailModeRows: React.FC<{ litellmParams: GuardrailModeParams }> = ({ litellmParams }) => {
  useUiLocale();
  return (
    <>
      <div>
        <p className="font-medium">
          <LocalizedText text={"Mode"} />
        </p>
        <div>{formatGuardrailMode(litellmParams.mode) || "-"}</div>
      </div>
      {modeIncludesLoggingOnly(litellmParams.mode) && (
        <div>
          <p className="font-medium">
            <LocalizedText text={"Logging only scope"} />
          </p>
          <div>{formatLoggingOnlyScope(litellmParams.logging_only_scope)}</div>
          <p className="font-medium">
            <LocalizedText text={"Continue after a flagged request"} />
          </p>
          <div>{loggingOnlyContinueFromParams(litellmParams) ? translateMessage("On") : translateMessage("Off")}</div>
        </div>
      )}
    </>
  );
};
