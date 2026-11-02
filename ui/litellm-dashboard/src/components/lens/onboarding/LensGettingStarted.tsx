"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { useRef } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LensReadiness } from "../hooks/useLensReadiness";
import { LensIntroduction } from "./LensIntroduction";
import { OnboardingSetup } from "./OnboardingSetup";

const PREREQUISITES = [
  markUiCopy({ title: "LiteLLM gateway", detail: "Access to its configuration" }, { title: "LiteLLM gateway" }),
  markUiCopy({ title: "Trace storage", detail: "Included, or use your own ClickHouse" }, { title: "Trace storage" }),
  markUiCopy(
    { title: "Docker or Kubernetes", detail: "Use your existing deployment" },
    { title: "Docker or Kubernetes" },
  ),
  markUiCopy(
    { title: "An analysis model", detail: "For investigations, after tracing is connected" },
    { title: "An analysis model" },
  ),
] as const;

export interface LensGettingStartedProps {
  readonly state: LensReadiness;
  readonly onStart: () => void;
  readonly onExit: (to: "traces" | "investigations") => void;
}

export function LensGettingStarted({ state, onStart, onExit }: LensGettingStartedProps) {
  useUiLocale();
  const setupRef = useRef<HTMLElement>(null);
  const exitTo = state.tracesReady ? "traces" : "investigations";
  const start = () => {
    onStart();
    setupRef.current?.scrollIntoView({ block: "start" });
    setupRef.current?.focus({ preventScroll: true });
  };
  return (
    <section
      aria-label={translateMessage("Get started with Lens")}
      className="@container mx-auto w-full max-w-7xl space-y-6"
    >
      <LensIntroduction onStart={start} />
      <div className="grid items-start gap-6 @3xl:grid-cols-[minmax(0,1fr)_280px] @3xl:gap-8">
        <OnboardingSetup
          ref={setupRef}
          tabIndex={-1}
          state={state}
          onFocusCapture={onStart}
          action={
            (state.activityReady || state.hasInvestigations) && (
              <Button variant="outline" size="sm" onClick={() => onExit(exitTo)}>
                {exitTo === "traces" ? translateMessage("View traces") : translateMessage("View investigations")}
              </Button>
            )
          }
        />
        <Prerequisites />
      </div>
    </section>
  );
}

function Prerequisites() {
  useUiLocale();
  return (
    <aside className="rounded-2xl border bg-card p-6" aria-labelledby="lens-prerequisites">
      <h2 id="lens-prerequisites" className="text-base font-semibold">
        <LocalizedText text={"Before you start"} />
      </h2>
      <ul className="mt-5 space-y-5 text-sm">
        {PREREQUISITES.map((item) => (
          <li key={item.title} className="flex gap-3">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">{localizedProperty(item, "title", item.title)}</p>
              <p className="mt-1 leading-5 text-muted-foreground">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex gap-2 border-t pt-5 text-xs leading-5 text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
          <LocalizedText
            text={
              "Your infrastructure stores the traces. Investigation content is sent to your selected model provider through the gateway."
            }
          />
        </p>
      </div>
    </aside>
  );
}
