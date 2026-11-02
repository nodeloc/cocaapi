"use client";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";

import { ArrowUpRight, SearchX, TriangleAlert } from "lucide-react";
import { LoadingState } from "@/components/shared/LoadingState";
import { StateMessage } from "@/components/shared/StateMessage";
import { Button, buttonVariants } from "@/components/ui/button";

import { ApiError } from "@/lib/http/client";

const DOCS_URL = "https://docs.litellm.ai/docs/proxy/lens";

function DocsLink() {
  useUiLocale();
  return (
    <a
      href={DOCS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: "ghost", size: "sm" })}
    >
      <LocalizedText text={"Lens docs"} />
      <ArrowUpRight aria-hidden="true" className="size-3.5" />
    </a>
  );
}

function loadFailureMessage(queryError: unknown, unavailable: boolean): string {
  if (unavailable)
    return "This dashboard may be newer than the proxy. Reload the page, and if it persists, check the proxy deployment.";
  if (queryError instanceof Error) return queryError.message;
  return "Something went wrong while contacting the proxy.";
}

export function InvestigationsLoadFailed({ queryError, refresh }: { queryError: unknown; refresh: () => void }) {
  useUiLocale();
  const unavailable = queryError instanceof ApiError && queryError.status === 404;
  return (
    <StateMessage
      role="alert"
      tone="destructive"
      icon={<TriangleAlert className="size-5" />}
      title={
        unavailable ? translateMessage("Lens API is unavailable") : translateMessage("Couldn't load investigations")
      }
      description={loadFailureMessage(queryError, unavailable)}
    >
      <Button size="sm" onClick={() => (unavailable ? window.location.reload() : refresh())}>
        {unavailable ? translateMessage("Reload page") : translateMessage("Try again")}
      </Button>
      <DocsLink />
    </StateMessage>
  );
}

export function InvestigationError(cocaCopyProps0: { message: string; refresh: () => void }) {
  const { message, refresh } = cocaCopyProps0;
  useUiLocale();
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      <span className="min-w-0">{localizedProperty(cocaCopyProps0, "message", message)}</span>
      <Button variant="ghost" size="sm" onClick={refresh}>
        <LocalizedText text={"Retry"} />
      </Button>
    </div>
  );
}

export function InvestigationsLoading() {
  useUiLocale();
  return (
    <LoadingState
      title={translateMessage("Loading investigations…")}
      description={translateMessage("Fetching your investigations and their latest findings.")}
    />
  );
}

export function InvestigationMissing({ selectLens }: { selectLens: (id: string | null) => void }) {
  useUiLocale();
  return (
    <StateMessage
      role="alert"
      icon={<SearchX className="size-5" />}
      title={translateMessage("Investigation not found")}
      description={translateMessage("It may have been deleted, or the link points to a different proxy.")}
    >
      <Button size="sm" onClick={() => selectLens(null)}>
        <LocalizedText text={"View all investigations"} />
      </Button>
    </StateMessage>
  );
}
