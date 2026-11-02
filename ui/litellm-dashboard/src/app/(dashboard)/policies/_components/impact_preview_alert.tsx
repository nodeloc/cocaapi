"use client";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/shared/Alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info } from "lucide-react";

interface ImpactResult {
  affected_keys_count: number;
  affected_teams_count: number;
  sample_keys: string[];
  sample_teams: string[];
}

interface ImpactPreviewAlertProps {
  impactResult: ImpactResult;
  isDefault?: boolean;
}

interface SampleListProps {
  label: string;
  samples: string[];
  totalCount: number;
}

const SampleList: React.FC<SampleListProps> = (cocaCopyProps0) => {
  const { label, samples, totalCount } = cocaCopyProps0;
  useUiLocale();
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className="text-xs text-muted-foreground">{localizedProperty(cocaCopyProps0, "label", label)}: </span>
      {samples.slice(0, 5).map((sample) => (
        <Badge key={sample} variant="outline">
          {sample}
        </Badge>
      ))}
      {totalCount > 5 && (
        <span className="text-xs text-muted-foreground">
          <LocalizedText text={"and "} />
          {totalCount - 5}
          <LocalizedText text={" more..."} />
        </span>
      )}
    </div>
  );
};

const ImpactPreviewAlert: React.FC<ImpactPreviewAlertProps> = ({ impactResult, isDefault = false }) => {
  useUiLocale();
  const isGlobal = impactResult.affected_keys_count === -1;
  const qualifier = isDefault ? "up to " : "";

  return (
    <Alert className="mb-4">
      {isGlobal ? <AlertTriangle /> : <Info />}
      <AlertTitle>
        <LocalizedText text={"Impact Preview"} />
      </AlertTitle>
      <AlertDescription>
        {isGlobal ? (
          <span>
            <LocalizedText text={"Global scope — this will affect "} />
            <strong>
              <LocalizedText text={"all keys and teams"} />
            </strong>
            .
          </span>
        ) : (
          <div>
            <span>
              <LocalizedText text={"This attachment would affect "} />
              {qualifier}
              <strong>
                {impactResult.affected_keys_count}
                <LocalizedText text={" key"} />
                {impactResult.affected_keys_count !== 1 ? translateMessage("s") : ""}
              </strong>{" "}
              <LocalizedText text={"and"} />{" "}
              <strong>
                {impactResult.affected_teams_count}
                <LocalizedText text={" team"} />
                {impactResult.affected_teams_count !== 1 ? translateMessage("s") : ""}
              </strong>
              .
            </span>
            {isDefault && (
              <div className="text-xs text-muted-foreground">
                <LocalizedText
                  text={
                    "Default attachments only apply to requests no non-default attachment matches, so fewer may be affected."
                  }
                />
              </div>
            )}
            {impactResult.sample_keys.length > 0 && (
              <SampleList
                label={translateMessage("Keys")}
                samples={impactResult.sample_keys}
                totalCount={impactResult.affected_keys_count}
              />
            )}
            {impactResult.sample_teams.length > 0 && (
              <SampleList
                label={translateMessage("Teams")}
                samples={impactResult.sample_teams}
                totalCount={impactResult.affected_teams_count}
              />
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
};

export default ImpactPreviewAlert;
