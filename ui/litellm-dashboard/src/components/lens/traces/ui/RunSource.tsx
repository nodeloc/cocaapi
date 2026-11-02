"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ArrowUpRight, MessagesSquare, UserRound } from "lucide-react";

import githubLogo from "../../../../../public/assets/logos/github.svg";
import jiraLogo from "../../../../../public/assets/logos/jira.svg";
import linearLogo from "../../../../../public/assets/logos/linear.svg";
import slackLogo from "../../../../../public/assets/logos/slack.svg";
import { Logo } from "@/components/molecules/logo/Logo";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

import type { TraceSummary } from "../types";

type Source = NonNullable<TraceSummary["source"]>;
type SourceType = Source["type"];

interface SourceApp {
  readonly label: string;
  readonly logo: string | null;
}

interface BrandedApp extends SourceApp {
  readonly domains: readonly string[];
}

const BRANDED: Readonly<Record<Exclude<SourceType, "custom">, BrandedApp>> = {
  slack: markUiCopy({ label: "Slack", logo: slackLogo.src, domains: ["slack.com"] }, { label: "Slack" }),
  teams: markUiCopy(
    { label: "Teams", logo: null, domains: ["teams.microsoft.com", "teams.cloud.microsoft"] },
    { label: "Teams" },
  ),
  discord: markUiCopy({ label: "Discord", logo: null, domains: ["discord.com"] }, { label: "Discord" }),
  linear: markUiCopy({ label: "Linear", logo: linearLogo.src, domains: ["linear.app"] }, { label: "Linear" }),
  github: markUiCopy({ label: "GitHub", logo: githubLogo.src, domains: ["github.com"] }, { label: "GitHub" }),
  jira: markUiCopy({ label: "Jira", logo: jiraLogo.src, domains: ["atlassian.net"] }, { label: "Jira" }),
};

const onDomain = (hostname: string, domain: string): boolean => hostname === domain || hostname.endsWith(`.${domain}`);

/** Brands a source only when its URL is on that app's domain, so a trace can't dress up any link as Slack. */
export function sourceApp(source: Pick<Source, "type" | "url">): SourceApp | null {
  const parsed = URL.canParse(source.url) ? new URL(source.url) : null;
  if (parsed?.protocol !== "https:") return null;
  const app = source.type === "custom" ? undefined : BRANDED[source.type];
  return app?.domains.some((domain) => onDomain(parsed.hostname, domain))
    ? app
    : { label: parsed.hostname, logo: null };
}

function AppMark({ app, className }: { app: SourceApp; className: string }) {
  useUiLocale();
  return app.logo ? (
    <Logo src={app.logo} label={localizedProperty(app, "label", app.label)} className={className} />
  ) : (
    <MessagesSquare aria-hidden className={className} />
  );
}

const chip =
  "inline-flex h-6 min-w-0 shrink items-center gap-1.5 rounded-full border border-border px-2 text-xs text-foreground";

/** Who started the run, e.g. the person who asked in Slack. */
export function RunUser({ user }: { user: string }) {
  useUiLocale();
  return (
    <span className={chip} title={user} data-testid="run-user">
      <UserRound aria-hidden className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{user}</span>
    </span>
  );
}

/** Links a run back to the conversation that started it, e.g. a Slack thread; hover previews its title. */
export function RunSourceLink({ source }: { source: Source }) {
  useUiLocale();
  const app = sourceApp(source);
  if (!app) return null;
  return (
    <HoverCard>
      <HoverCardTrigger
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={translateMessage("Open %{0} thread", [app.label])}
        className={`${chip} shrink-0 transition-colors hover:bg-muted`}
      >
        <AppMark app={app} className="size-3 shrink-0" />
        <span className="truncate">
          {localizedProperty(app, "label", app.label)}
          <LocalizedText text={" thread"} />
        </span>
        <ArrowUpRight aria-hidden className="size-3 shrink-0 text-muted-foreground" />
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 p-3">
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-1.5">
          <span className="line-clamp-2 text-sm font-medium text-foreground">
            {localizedProperty(source, "title", source.title) || translateMessage("Open in %{0}", [app.label])}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <AppMark app={app} className="size-3 shrink-0" />
            {source.user
              ? `${localizedProperty(app, "label", app.label)} · ${source.user}`
              : localizedProperty(app, "label", app.label)}
          </span>
        </a>
      </HoverCardContent>
    </HoverCard>
  );
}
