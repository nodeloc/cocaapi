"use client";
import { LocalizedText, getIntlLocale, translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import type { components } from "@/lib/http/schema";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/components/networking";
import { Button } from "@/components/ui/button";
import { readAgentIdentity } from "./agent_identity";

const authenticationMessage = (error: boolean, lastAuthenticated?: string | null): string => {
  if (error) return "Could not load authentication evidence";
  if (lastAuthenticated)
    return `Last authenticated identity match: ${new Date(lastAuthenticated).toLocaleString(getIntlLocale())}`;
  return "Configured, awaiting an authenticated request";
};

export const AgentIdentityDetails = ({
  agentId,
  identity: value,
  accessToken,
  isAdmin,
}: {
  agentId: string;
  identity: unknown;
  accessToken: string | null;
  isAdmin: boolean;
}) => {
  useUiLocale();
  const identity = readAgentIdentity(value);
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: ["agent-identity", agentId, identity],
    queryFn: () =>
      apiClient.get<components["schemas"]["ManagedAgentIdentityStatus"]>(
        `/v1/agents/${encodeURIComponent(agentId)}/identity`,
        {
          accessToken: accessToken ?? "",
        },
      ),
    enabled: Boolean(isAdmin && accessToken && identity),
  });

  if (!identity || !isAdmin) return null;
  const executionLabel = data?.enabled ? "Enabled" : "Disabled";
  return (
    <section
      aria-label={translateMessage("Agent Identity")}
      className="mb-6 space-y-2 rounded-lg border border-border p-4"
    >
      <h3 className="font-medium">
        <LocalizedText text={"Agent Identity: Microsoft Entra ID"} />
      </h3>
      <p className="text-sm">
        <LocalizedText text={"Tenant: "} />
        <span className="font-mono">{identity.tenant_id}</span>
      </p>
      <>
        <p className="text-sm">
          <LocalizedText text={"Application (Client) ID: "} />
          <span className="font-mono">{identity.client_id}</span>
        </p>
        <p className="text-sm">
          <LocalizedText text={"Enterprise application Object ID: "} />
          {identity.service_principal_id || translateMessage("Not configured")}
        </p>
      </>
      <p className="text-sm">
        <LocalizedText text={"Execution: "} />
        {data ? executionLabel : translateMessage("Loading")}
        <LocalizedText text={" · Mode: "} />
        {data?.execution_mode ?? translateMessage("Loading")}
      </p>
      <p className="text-sm">
        {data?.identity?.active === false
          ? translateMessage("Identity unbound; execution is disabled")
          : authenticationMessage(isError, data?.last_authenticated_at)}
      </p>
      <p className="text-xs text-muted-foreground">
        <LocalizedText
          text={
            "Recent evidence comes from a validated Entra token matching this binding. It is persisted across restarts and cleared when the binding changes. Tool and model permissions are checked separately."
          }
        />
      </p>
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          disabled={isFetching}
          onClick={() => {
            void refetch();
          }}
        >
          <LocalizedText text={"Refresh authentication evidence"} />
        </Button>
        <a className="text-sm underline" href="/ui/logs/">
          <LocalizedText text={"View request logs"} />
        </a>
      </div>
    </section>
  );
};
