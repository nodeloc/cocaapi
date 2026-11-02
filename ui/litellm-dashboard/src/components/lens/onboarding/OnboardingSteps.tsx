"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TracingSetupFields, useLensService } from "@/components/lens/onboarding/tracing/TracingSetupCard";
import { cn } from "@/lib/cva.config";
import { useLensAccessToken } from "../data/LensServices";
import type { LensReadiness } from "../hooks/useLensReadiness";
import { initialSetupStep } from "../model/readiness";
import { StepIndicator, type StepState } from "../ui/StepIndicator";
import { useOnboarding } from "./OnboardingContext";

type StepProps = { state: LensReadiness; goTo: (step: number) => void; storageReady: boolean };

function useLocked() {
  useUiLocale();
  const { readOnly, canInvestigate } = useOnboarding();
  return readOnly || !canInvestigate;
}

function StorageStep({ state, goTo, storageReady }: StepProps) {
  useUiLocale();
  const { readOnly, openTrace } = useOnboarding();
  const accessToken = useLensAccessToken();
  if (!storageReady)
    return (
      <>
        <TracingSetupFields
          detail="Tracing is not enabled"
          accessToken={accessToken}
          onOpenTrace={openTrace}
          onCheck={state.refresh}
          checking={state.checking}
          readOnly={readOnly}
        />
        <ActivityContinuation state={state} />
      </>
    );
  return (
    <div className="space-y-4">
      <p role="status" className="text-sm text-success">
        <LocalizedText text={"Trace storage is connected"} />
      </p>
      <Button onClick={() => goTo(1)}>
        <LocalizedText text={"Continue to your agent "} />
        <ArrowRight aria-hidden="true" className="size-4" />
      </Button>
      <ActivityContinuation state={state} />
    </div>
  );
}

function continuationLabel(state: LensReadiness) {
  if (state.connected) return "Continue to investigation";
  return state.tracesReady ? "Continue to worker" : "Continue with request logs";
}

function ActivityContinuation({ state }: { state: LensReadiness }) {
  useUiLocale();
  const { connect, create } = useOnboarding();
  const locked = useLocked();
  if (!state.activityReady) return null;
  return (
    <div className="mt-4">
      <Button onClick={state.connected ? create : connect} disabled={locked}>
        {continuationLabel(state)}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Button>
      {state.requestsReady && !state.tracesReady && (
        <p className="mt-2 text-xs text-muted-foreground">
          <LocalizedText
            text={"Request logs are already available. You can investigate them now and add agent traces later."}
          />
        </p>
      )}
    </div>
  );
}

function AgentStep({ state }: StepProps) {
  useUiLocale();
  const { readOnly, canMintTracingKey, openTrace } = useOnboarding();
  const accessToken = useLensAccessToken();
  return (
    <>
      <div hidden={state.tracesReady}>
        <TracingSetupFields
          detail={null}
          accessToken={accessToken}
          onOpenTrace={(value) => {
            state.refresh();
            openTrace(value);
          }}
          onCheck={state.refresh}
          checking={state.checking}
          readOnly={readOnly}
          canMintTracingKey={canMintTracingKey}
        />
      </div>
      {state.tracesReady && (
        <p role="status" className="text-sm text-success">
          <LocalizedText
            text={"Your first trace is ready. Continue setup so Lens can investigate your agent’s behavior."}
          />
        </p>
      )}
      <ActivityContinuation state={state} />
    </>
  );
}

function WorkerStep({ state }: StepProps) {
  useUiLocale();
  const { connect, create } = useOnboarding();
  const locked = useLocked();
  return (
    <div className="space-y-4">
      <p role="status" className="text-sm text-muted-foreground">
        {state.connected
          ? translateMessage("Worker connected. You’re ready to create an investigation.")
          : translateMessage(
              "The worker reviews recorded activity using a model on your gateway. You choose its analysis model and spending limit.",
            )}
      </p>
      {!state.activityReady && (
        <p className="text-sm text-muted-foreground">
          <LocalizedText text={"Recorded activity is required before connecting a worker."} />
        </p>
      )}
      <Button onClick={state.connected ? create : connect} disabled={!state.activityReady || locked}>
        {state.connected ? translateMessage("Continue to investigation") : translateMessage("Connect worker")}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}

function InvestigationStep({ state }: StepProps) {
  useUiLocale();
  const { create } = useOnboarding();
  const locked = useLocked();
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">
        <LocalizedText
          text={
            "Choose the activity to review and describe how your agent should behave. Lens will show findings with evidence and suggested changes."
          }
        />
      </p>
      {!state.ready && (
        <p className="text-sm text-muted-foreground">
          <LocalizedText
            text={"Recorded activity and a connected worker are required before you can run an investigation."}
          />
        </p>
      )}
      <Button onClick={create} disabled={!state.ready || locked}>
        <LocalizedText text={"New investigation "} />
        <ArrowRight aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}

interface StepDefinition {
  readonly title: string;
  readonly description: string;
  readonly complete: (state: LensReadiness, storageReady: boolean) => boolean;
  readonly Content: (props: StepProps) => ReactNode;
}

const STEPS: readonly StepDefinition[] = [
  markUiCopy(
    {
      title: "Install Lens",
      description: "Enable Lens in your Helm or Docker deployment.",
      complete: (_state, storageReady) => storageReady,
      Content: StorageStep,
    },
    { title: "Install Lens", description: "Enable Lens in your Helm or Docker deployment." },
  ),
  markUiCopy(
    {
      title: "Send your first trace",
      description: "Capture your agent’s inputs, outputs, and tool calls.",
      complete: (state) => state.tracesReady,
      Content: AgentStep,
    },
    { title: "Send your first trace", description: "Capture your agent’s inputs, outputs, and tool calls." },
  ),
  markUiCopy(
    {
      title: "Connect a worker",
      description: "Choose an analysis model and spending limit.",
      complete: (state) => state.connected,
      Content: WorkerStep,
    },
    { title: "Connect a worker", description: "Choose an analysis model and spending limit." },
  ),
  markUiCopy(
    {
      title: "Run your first investigation",
      description: "Describe the expected behavior and review a sample of activity.",
      complete: (state) => state.hasInvestigations,
      Content: InvestigationStep,
    },
    {
      title: "Run your first investigation",
      description: "Describe the expected behavior and review a sample of activity.",
    },
  ),
];

function stepState(complete: boolean, open: boolean): StepState {
  if (complete) return "complete";
  return open ? "current" : "upcoming";
}

export function OnboardingSteps({
  state,
  className,
  includeTracing,
}: {
  state: LensReadiness;
  className?: string;
  includeTracing: boolean;
}) {
  useUiLocale();
  const id = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const offset = includeTracing ? 0 : 2;
  const accessToken = useLensAccessToken();
  const service = useLensService(accessToken);
  const storageReady = Boolean(service.data?.connected && service.data.status.storage_ready && service.data.url);
  const [step, setStep] = useState(() => Math.max(offset, initialSetupStep(state)));
  const visibleStep = !storageReady && step === 1 ? 0 : step;
  const goTo = (index: number) => {
    setStep(index);
    listRef.current?.querySelector<HTMLButtonElement>(`[aria-controls="${id}-${index}"]`)?.focus();
  };
  return (
    <ol
      ref={listRef}
      data-slot="onboarding-steps"
      className={cn("divide-y overflow-hidden rounded-2xl border bg-card", className)}
    >
      {STEPS.slice(offset).map((cocaCopyProps0, index) => {
        const { title, description, complete, Content } = cocaCopyProps0;
        const stepIndex = index + offset;
        const open = Math.max(offset, visibleStep) === stepIndex;
        return (
          <li key={title}>
            <h3>
              <button
                type="button"
                id={`${id}-trigger-${stepIndex}`}
                aria-expanded={open}
                aria-controls={`${id}-${stepIndex}`}
                onClick={() => setStep(stepIndex)}
                className="group flex w-full items-start gap-4 p-5 text-left outline-none hover:bg-muted/30 focus-visible:bg-muted/50 sm:p-6"
              >
                <StepIndicator index={index} state={stepState(complete(state, storageReady), open)} />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm font-medium sm:text-base",
                      !open && "text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    {localizedProperty(cocaCopyProps0, "title", title)}
                  </span>
                  <span className="mt-1 block text-sm leading-6 font-normal text-muted-foreground">
                    {localizedProperty(cocaCopyProps0, "description", description)}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn("mt-1 size-4 shrink-0 text-muted-foreground", open && "rotate-180")}
                />
              </button>
            </h3>
            <div
              id={`${id}-${stepIndex}`}
              role="region"
              aria-labelledby={`${id}-trigger-${stepIndex}`}
              hidden={!open}
              className="px-5 pb-6 sm:pr-6 sm:pb-7 sm:pl-17"
            >
              <Content state={state} goTo={goTo} storageReady={storageReady} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
