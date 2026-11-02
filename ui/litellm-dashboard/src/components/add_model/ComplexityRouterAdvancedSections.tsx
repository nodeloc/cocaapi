"use client";
import { LocalizedText, localizedProperty, markUiCopy, useUiLocale } from "@/lib/i18n";
import React from "react";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import type { ModelGroup } from "@/components/llm_calls/fetch_models";
import {
  effectiveClassifierType,
  heuristicTuningType,
  usesClassifierContext,
  usesLlmClassifier,
  type ComplexityRouterConfigValue,
} from "./ComplexityRouterConfig";
import AdaptiveRoutingConfig from "./AdaptiveRoutingConfig";
import CacheAwareRoutingConfig from "./CacheAwareRoutingConfig";
import ClassificationMethodConfig from "./ClassificationMethodConfig";
import ForecastClassifierConfig from "./ForecastClassifierConfig";
import ContextWindowEscalationConfig from "./ContextWindowEscalationConfig";
import ResponseFormatControls from "./ResponseFormatControls";
import StallEscalationConfig from "./StallEscalationConfig";
import { Restricted, restrictedBy } from "./TierRestrictions";
import EscalationKeywords from "./EscalationKeywords";
import KeywordTierRules, { type KeywordTierRule } from "./KeywordTierRules";
import SemanticKeywordMatching from "./SemanticKeywordMatching";
import CompressionControls from "./CompressionControls";
import PlanModeOverrideControls from "./PlanModeOverrideControls";
import { AffinityControls } from "./AffinityControls";
import { ModalityRoutingControls } from "./ModalityRoutingControls";
import HousekeepingRoutingControls from "./HousekeepingRoutingControls";
import ReminderMarkers from "./ReminderMarkers";
import type { AutoRouterCompressionState } from "./buildAutoRouterCompression";
import { activeTierName, type TierRow } from "./tier_rows";

interface ComplexityRouterAdvancedSectionsProps {
  hideClassifier?: boolean;
  value: ComplexityRouterConfigValue;
  onChange: (value: ComplexityRouterConfigValue) => void;
  forecast: boolean;
  modelOptions: { value: string; label: string }[];
  classifierEffortOptionsByModel: Record<string, string[] | null | undefined>;
  customTechnicalKeywords?: string[];
  onCustomTechnicalKeywordsChange?: (keywords: string[]) => void;
  showValidationErrors: boolean;
  defaultModel?: string;
  planModeTierOptions: { value: string; label: string }[];
  keywordTierRules: KeywordTierRule[];
  onKeywordTierRulesChange?: (rules: KeywordTierRule[]) => void;
  semanticMatchingEnabled: boolean;
  onSemanticMatchingEnabledChange?: (enabled: boolean) => void;
  embeddingModel?: string;
  onEmbeddingModelChange: (model: string) => void;
  matchThreshold: number;
  onMatchThresholdChange: (threshold: number) => void;
  escalationKeywords: string[];
  onEscalationKeywordsChange?: (keywords: string[]) => void;
  autoRouterCompression: AutoRouterCompressionState;
  onAutoRouterCompressionChange?: (state: AutoRouterCompressionState) => void;
  modelInfo: ModelGroup[];
  tierRows: TierRow[];
  customTierSet: ComplexityRouterConfigValue["custom_tier_set"];
}

const ComplexityRouterAdvancedSections: React.FC<ComplexityRouterAdvancedSectionsProps> = ({
  hideClassifier,
  value,
  onChange,
  forecast,
  modelOptions,
  classifierEffortOptionsByModel,
  customTechnicalKeywords,
  onCustomTechnicalKeywordsChange,
  showValidationErrors,
  defaultModel,
  planModeTierOptions,
  keywordTierRules,
  onKeywordTierRulesChange,
  semanticMatchingEnabled,
  onSemanticMatchingEnabledChange,
  embeddingModel,
  onEmbeddingModelChange,
  matchThreshold,
  onMatchThresholdChange,
  escalationKeywords,
  onEscalationKeywordsChange,
  autoRouterCompression,
  onAutoRouterCompressionChange,
  modelInfo,
  tierRows,
  customTierSet,
}) => {
  useUiLocale();
  const classifierType = effectiveClassifierType(value);
  const classificationProps = {
    advancedOnly: true,
    value,
    onChange,
    modelOptions,
    effortOptionsByModel: classifierEffortOptionsByModel,
    customTechnicalKeywords,
    onCustomTechnicalKeywordsChange,
    showValidationErrors,
    defaultModel,
  };
  const sections = [
    ...(forecast
      ? [
          {
            key: "classifier",
            label: (
              <strong className="text-foreground font-semibold">
                <LocalizedText text={"Classifier tuning"} />
              </strong>
            ),
            children: (
              <ForecastClassifierConfig
                section="advanced"
                value={value}
                onChange={onChange}
                modelOptions={modelOptions}
                effortOptionsByModel={classifierEffortOptionsByModel}
              />
            ),
          },
        ]
      : []),
    ...(!forecast && (usesClassifierContext(classifierType) || classifierType === "custom")
      ? [
          {
            key: "classifier",
            label: (
              <strong className="text-foreground font-semibold">
                <LocalizedText text={"Classification Method"} />
              </strong>
            ),
            children: <ClassificationMethodConfig {...classificationProps} section="classifier" />,
          },
        ]
      : []),
    ...(heuristicTuningType(value)
      ? [
          {
            key: "heuristic",
            label: (
              <strong className="text-foreground font-semibold">
                <LocalizedText text={"Heuristic tuning"} />
              </strong>
            ),
            children: <ClassificationMethodConfig {...classificationProps} section="heuristic" />,
          },
        ]
      : []),
    {
      key: "adaptive",
      label: (
        <strong className="text-foreground font-semibold">
          <LocalizedText text={"Adaptive Routing"} />
        </strong>
      ),
      children: (
        <Restricted by={restrictedBy(value, "adaptive")}>
          <AdaptiveRoutingConfig value={value} onChange={onChange} />
        </Restricted>
      ),
    },
    {
      key: "affinity",
      label: (
        <strong className="text-foreground font-semibold">
          <LocalizedText text={"Affinity"} />
        </strong>
      ),
      children: <AffinityControls value={value} onChange={onChange} />,
    },
    {
      key: "cache-aware",
      label: (
        <strong className="text-foreground font-semibold">
          <LocalizedText text={"Cache-aware routing"} />
        </strong>
      ),
      children: <CacheAwareRoutingConfig value={value} onChange={onChange} />,
    },
    {
      key: "modality",
      label: (
        <strong className="text-foreground font-semibold">
          <LocalizedText text={"Modality Routing"} />
        </strong>
      ),
      children: <ModalityRoutingControls value={value} onChange={onChange} />,
    },
    {
      key: "plan-mode",
      label: (
        <strong className="text-foreground font-semibold">
          <LocalizedText text={"Plan-Mode Override"} />
        </strong>
      ),
      children: (
        <PlanModeOverrideControls value={value} onChange={onChange} planModeTierOptions={planModeTierOptions} />
      ),
    },
    {
      key: "housekeeping",
      label: (
        <strong className="text-foreground font-semibold">
          <LocalizedText text={"Housekeeping Routing"} />
        </strong>
      ),
      children: <HousekeepingRoutingControls value={value} onChange={onChange} />,
    },
    {
      key: "reminder-markers",
      label: (
        <strong className="text-foreground font-semibold">
          <LocalizedText text={"Ignore Custom Tags"} />
        </strong>
      ),
      children: <ReminderMarkers value={value} onChange={onChange} showValidationErrors={showValidationErrors} />,
    },
    {
      key: "context-window",
      label: (
        <strong className="text-foreground font-semibold">
          <LocalizedText text={"Context Window Escalation"} />
        </strong>
      ),
      children: <ContextWindowEscalationConfig value={value} onChange={onChange} />,
    },
    {
      key: "stall-escalation",
      label: (
        <strong className="text-foreground font-semibold">
          <LocalizedText text={"Stalled Task Escalation"} />
        </strong>
      ),
      children: (
        <Restricted by={restrictedBy(value, "stallEscalation")}>
          <StallEscalationConfig value={value} onChange={onChange} />
        </Restricted>
      ),
    },
    {
      key: "response",
      label: (
        <strong className="text-foreground font-semibold">
          <LocalizedText text={"Response Format"} />
        </strong>
      ),
      children: <ResponseFormatControls value={value} onChange={onChange} />,
    },
    ...(onEscalationKeywordsChange
      ? [
          {
            key: "escalation",
            label: (
              <strong className="text-foreground font-semibold">
                <LocalizedText text={"Escalation Keywords"} />
              </strong>
            ),
            children: (
              <Restricted by={restrictedBy(value, "escalation")}>
                <EscalationKeywords keywords={escalationKeywords} onChange={onEscalationKeywordsChange} />
              </Restricted>
            ),
          },
        ]
      : []),
    ...(onAutoRouterCompressionChange
      ? [
          {
            key: "compression",
            label: (
              <strong className="text-foreground font-semibold">
                <LocalizedText text={"Compression"} />
              </strong>
            ),
            children: <CompressionControls value={autoRouterCompression} onChange={onAutoRouterCompressionChange} />,
          },
        ]
      : []),
    ...(onKeywordTierRulesChange || onSemanticMatchingEnabledChange
      ? [
          {
            key: "keyword-semantic",
            label: (
              <strong className="text-foreground font-semibold">
                <LocalizedText text={"Keyword/Semantic Matching"} />
              </strong>
            ),
            children: (
              <>
                {onKeywordTierRulesChange && (
                  <KeywordTierRules
                    rules={keywordTierRules}
                    onChange={onKeywordTierRulesChange}
                    tierLabels={value.tier_labels}
                    tierNames={customTierSet || forecast ? tierRows.map(activeTierName).filter(Boolean) : undefined}
                  />
                )}
                {onKeywordTierRulesChange && onSemanticMatchingEnabledChange && <Separator className="my-4" />}
                {onSemanticMatchingEnabledChange && (
                  <SemanticKeywordMatching
                    enabled={semanticMatchingEnabled}
                    onEnabledChange={onSemanticMatchingEnabledChange}
                    embeddingModel={embeddingModel}
                    onEmbeddingModelChange={onEmbeddingModelChange}
                    matchThreshold={matchThreshold}
                    onMatchThresholdChange={onMatchThresholdChange}
                    modelInfo={modelInfo}
                    showValidationErrors={showValidationErrors}
                  />
                )}
              </>
            ),
          },
        ]
      : []),
  ];

  const groups = [
    markUiCopy({ label: "Heuristic tuning", keys: ["heuristic"] }, { label: "Heuristic tuning" }),
    markUiCopy(
      { label: usesLlmClassifier(classifierType) ? "LLM tuning" : "Classifier tuning", keys: ["classifier"] },
      { label: ["LLM tuning", "Classifier tuning"] },
    ),
    markUiCopy({ label: "Request preprocessing", keys: ["reminder-markers"] }, { label: "Request preprocessing" }),
    markUiCopy(
      {
        label: "Routing rules and recovery",
        keys: [
          "modality",
          "plan-mode",
          "housekeeping",
          "context-window",
          "stall-escalation",
          "escalation",
          "keyword-semantic",
        ],
      },
      { label: "Routing rules and recovery" },
    ),
    markUiCopy(
      { label: "Sessions and efficiency", keys: ["affinity", "adaptive", "cache-aware", "compression"] },
      { label: "Sessions and efficiency" },
    ),
    markUiCopy({ label: "Compatibility", keys: ["response"] }, { label: "Compatibility" }),
  ].filter(
    (group) =>
      !(hideClassifier && group.keys.includes("classifier")) && sections.some(({ key }) => group.keys.includes(key)),
  );
  const [openGroups, setOpenGroups] = React.useState<string[]>(() =>
    showValidationErrors ? groups.map((group) => group.label) : [],
  );
  const [previousValidation, setPreviousValidation] = React.useState(showValidationErrors);
  if (previousValidation !== showValidationErrors) {
    setPreviousValidation(showValidationErrors);
    if (showValidationErrors) setOpenGroups(groups.map((group) => group.label));
  }
  return (
    <div>
      {["llm", "heuristic_first", "hybrid"].includes(classifierType) && (
        <div className="px-4 py-3">
          <ClassificationMethodConfig {...classificationProps} section="selection" />
        </div>
      )}
      {groups.map((group) => (
        <Collapsible
          key={group.label}
          open={openGroups.includes(group.label)}
          onOpenChange={(open) =>
            setOpenGroups((current) =>
              open ? [...current, group.label] : current.filter((label) => label !== group.label),
            )
          }
          className="border-b border-border last:border-b-0"
        >
          <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left font-medium">
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-90" />
            {localizedProperty(group, "label", group.label)}
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-6 px-4 pb-4">
            {sections
              .filter(
                ({ key }) =>
                  group.keys.includes(key) &&
                  (!forecast || !["adaptive", "context-window", "escalation"].includes(key)),
              )
              .map((cocaCopyProps0) => {
                const { key, label, children } = cocaCopyProps0;
                return (
                  <section key={key} className="space-y-3">
                    {key !== "classifier" && key !== "heuristic" && (
                      <h4>{localizedProperty(cocaCopyProps0, "label", label)}</h4>
                    )}
                    {children}
                  </section>
                );
              })}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
};

export default ComplexityRouterAdvancedSections;
