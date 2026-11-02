"use client";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Unplug } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UiLoadingSpinner } from "@/components/ui/ui-loading-spinner";
import { fetchMCPGatewaySessions, terminateMCPGatewaySessions } from "@/components/networking";
import type {
  MCPGatewaySessionGroupCount,
  MCPGatewaySessionSelector,
  MCPGatewaySessionsResponse,
  MCPGatewaySessionsTerminateResponse,
} from "@/components/mcp_tools/types";
import { createQueryKeys } from "@/app/(dashboard)/hooks/common/queryKeysFactory";

const mcpGatewaySessionKeys = createQueryKeys("mcpGatewaySessions");
const REFETCH_INTERVAL_MS = 15000;
const UNKNOWN_LABEL = "(unknown)";

export function formatIdleSeconds(idleSeconds: number): string {
  const total = Math.max(0, Math.floor(idleSeconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function groupLabel(label: string | null): string {
  if (label === null) return UNKNOWN_LABEL;
  return label === "" ? '""' : label;
}

export function describeSelector(selector: MCPGatewaySessionSelector): string {
  if (selector.user_id !== undefined) return `every live session opened by user ${groupLabel(selector.user_id)}`;
  return `session ${selector.session_id_prefix}`;
}

export function describeTerminateResult(result: MCPGatewaySessionsTerminateResponse): string {
  const noun = result.terminated_sessions === 1 ? "session" : "sessions";
  return `Disconnected ${result.terminated_sessions} ${noun} on worker pid ${result.worker_pid}.`;
}

function StatCard(cocaCopyProps0: { label: string; value: number }) {
  const { label, value } = cocaCopyProps0;
  useUiLocale();
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3">
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{localizedProperty(cocaCopyProps0, "label", label)}</div>
    </div>
  );
}

function DisconnectUserButton({
  userId,
  onDisconnectUser,
}: {
  userId: string | null;
  onDisconnectUser: (userId: string) => void;
}) {
  useUiLocale();
  if (userId === null || userId === "") return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onDisconnectUser(userId)}
      aria-label={translateMessage("Disconnect all sessions for user %{0}", [groupLabel(userId)])}
    >
      <Unplug className="size-4" />
      <LocalizedText text={"Disconnect all"} />
    </Button>
  );
}

function GroupCountTable(cocaCopyProps1: {
  title: string;
  groups: MCPGatewaySessionGroupCount[];
  labelHeader: string;
  onDisconnectUser?: (userId: string) => void;
}) {
  const { title, groups, labelHeader, onDisconnectUser } = cocaCopyProps1;
  useUiLocale();
  return (
    <section
      aria-label={localizedProperty(cocaCopyProps1, "title", title)}
      className="rounded-lg border border-border bg-card"
    >
      <h3 className="border-b border-border px-4 py-2 text-sm font-semibold text-foreground">
        {localizedProperty(cocaCopyProps1, "title", title)}
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{labelHeader}</TableHead>
            <TableHead className="text-right">
              <LocalizedText text={"Sessions"} />
            </TableHead>
            {onDisconnectUser ? (
              <TableHead className="text-right">
                <LocalizedText text={"Actions"} />
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.label ?? "__unknown__"}>
              <TableCell className="font-mono text-xs">{groupLabel(group.label)}</TableCell>
              <TableCell className="text-right">{group.count}</TableCell>
              {onDisconnectUser ? (
                <TableCell className="text-right">
                  <DisconnectUserButton userId={group.label} onDisconnectUser={onDisconnectUser} />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function SessionsBody({
  data,
  error,
  isLoading,
  onDisconnect,
}: {
  data: MCPGatewaySessionsResponse | undefined;
  error: Error | null;
  isLoading: boolean;
  onDisconnect: ((selector: MCPGatewaySessionSelector) => void) | null;
}) {
  useUiLocale();
  if (isLoading) {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-12"
      >
        <UiLoadingSpinner className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          <LocalizedText text={"Loading live connections..."} />
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>
          <LocalizedText text={"Could not load live connections"} />
        </AlertTitle>
        <AlertDescription>{localizedProperty(error, "message", error.message)}</AlertDescription>
      </Alert>
    );
  }
  if (!data) return null;
  if (data.total_sessions === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">
          <LocalizedText text={"No live MCP connections on this worker (pid "} />
          {data.worker_pid}
          <LocalizedText text={"). Connect an AI client to the gateway to see it here."} />
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={translateMessage("Live sessions")} value={data.total_sessions} />
        <StatCard label={translateMessage("AI clients")} value={data.by_client.length} />
        <StatCard label={translateMessage("Users")} value={data.by_user.length} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GroupCountTable
          title={translateMessage("Sessions by AI client")}
          labelHeader="Client"
          groups={data.by_client}
        />
        <GroupCountTable
          title={translateMessage("Sessions by user")}
          labelHeader="User"
          groups={data.by_user}
          onDisconnectUser={onDisconnect ? (userId) => onDisconnect({ user_id: userId }) : undefined}
        />
      </div>
      <section aria-label={translateMessage("Live sessions")} className="rounded-lg border border-border bg-card">
        <h3 className="border-b border-border px-4 py-2 text-sm font-semibold text-foreground">
          <LocalizedText text={"Live sessions (worker pid "} />
          {data.worker_pid})
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <LocalizedText text={"Session"} />
              </TableHead>
              <TableHead>
                <LocalizedText text={"Client"} />
              </TableHead>
              <TableHead>
                <LocalizedText text={"User"} />
              </TableHead>
              <TableHead>
                <LocalizedText text={"Key alias"} />
              </TableHead>
              <TableHead>
                <LocalizedText text={"Team"} />
              </TableHead>
              <TableHead>
                <LocalizedText text={"Client IP"} />
              </TableHead>
              <TableHead className="text-right">
                <LocalizedText text={"Idle"} />
              </TableHead>
              <TableHead className="text-right">
                <LocalizedText text={"In flight"} />
              </TableHead>
              {onDisconnect ? (
                <TableHead className="text-right">
                  <LocalizedText text={"Actions"} />
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.sessions.map((session, index) => (
              <TableRow key={`${session.session_id_prefix}-${index}`}>
                <TableCell className="font-mono text-xs">{session.session_id_prefix}</TableCell>
                <TableCell>
                  {session.client_name === null ? (
                    <span className="text-muted-foreground">{UNKNOWN_LABEL}</span>
                  ) : (
                    <>
                      <span className="font-mono text-xs">{groupLabel(session.client_name)}</span>
                      {session.client_version ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          <LocalizedText text={"v"} />
                          {session.client_version}
                        </span>
                      ) : null}
                    </>
                  )}
                </TableCell>
                <TableCell>
                  {session.user_id === null ? (
                    <span className="text-muted-foreground">{UNKNOWN_LABEL}</span>
                  ) : (
                    <>
                      <span className="font-mono text-xs">{session.user_id}</span>
                      {session.user_email ? (
                        <span className="ml-1 text-xs text-muted-foreground">{session.user_email}</span>
                      ) : null}
                    </>
                  )}
                </TableCell>
                <TableCell className="text-xs">{session.key_alias ?? "-"}</TableCell>
                <TableCell className="text-xs">{session.team_alias ?? session.team_id ?? "-"}</TableCell>
                <TableCell className="font-mono text-xs">{session.client_ip || "-"}</TableCell>
                <TableCell className="text-right text-xs">{formatIdleSeconds(session.idle_seconds)}</TableCell>
                <TableCell className="text-right text-xs">{session.in_flight_requests}</TableCell>
                {onDisconnect ? (
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDisconnect({ session_id_prefix: session.session_id_prefix })}
                      aria-label={translateMessage("Disconnect session %{0}", [session.session_id_prefix])}
                    >
                      <Unplug className="size-4" />
                      <LocalizedText text={"Disconnect"} />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}

interface MCPGatewaySessionsTabProps {
  accessToken: string | null;
  canTerminate: boolean;
}

export function MCPGatewaySessionsTab({ accessToken, canTerminate }: MCPGatewaySessionsTabProps) {
  useUiLocale();
  const queryClient = useQueryClient();
  const [pendingSelector, setPendingSelector] = useState<MCPGatewaySessionSelector | null>(null);
  const queryOptions = {
    queryKey: mcpGatewaySessionKeys.lists(),
    queryFn: () => fetchMCPGatewaySessions(accessToken!),
    enabled: !!accessToken,
    refetchInterval: REFETCH_INTERVAL_MS,
  };
  const { data, error, isLoading, isFetching, refetch } = useQuery<MCPGatewaySessionsResponse, Error>(queryOptions);
  const terminate = useMutation<MCPGatewaySessionsTerminateResponse, Error, MCPGatewaySessionSelector>({
    mutationFn: (selector) => terminateMCPGatewaySessions(accessToken!, selector),
    onSettled: () => queryClient.invalidateQueries({ queryKey: mcpGatewaySessionKeys.lists() }),
  });
  const confirmDisconnect = () => {
    if (pendingSelector === null) return;
    terminate.mutate(pendingSelector);
    setPendingSelector(null);
  };

  return (
    <div className="mt-4 space-y-4" data-testid="mcp-gateway-sessions-tab">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            <LocalizedText text={"Live Connections"} />
          </h2>
          <p className="text-sm text-muted-foreground">
            <LocalizedText
              text={
                "Stateful Streamable HTTP sessions currently open on this proxy worker, grouped by the AI client that sent the MCP initialize request and by the authenticated LiteLLM user. Stateless requests and SSE connections are not counted."
              }
            />
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label={translateMessage("Refresh live connections")}
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          <LocalizedText text={"Refresh"} />
        </Button>
      </div>

      {terminate.isError ? (
        <Alert variant="destructive">
          <AlertTitle>
            <LocalizedText text={"Could not disconnect"} />
          </AlertTitle>
          <AlertDescription>{localizedProperty(terminate.error, "message")}</AlertDescription>
        </Alert>
      ) : null}
      {terminate.isSuccess ? (
        <Alert>
          <AlertTitle>
            <LocalizedText text={"Disconnected"} />
          </AlertTitle>
          <AlertDescription>
            {describeTerminateResult(terminate.data)}
            <LocalizedText
              text={
                " Clients holding those sessions must send a new initialize request, which re-runs authentication. Sessions on other proxy workers are not affected."
              }
            />
          </AlertDescription>
        </Alert>
      ) : null}

      <SessionsBody
        data={data}
        error={error}
        isLoading={isLoading}
        onDisconnect={canTerminate ? setPendingSelector : null}
      />

      <AlertDialog open={pendingSelector !== null} onOpenChange={(open) => !open && setPendingSelector(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <LocalizedText text={"Disconnect MCP session"} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSelector
                ? translateMessage("This force-closes %{0} on this proxy worker. ", [describeSelector(pendingSelector)])
                : ""}
              <LocalizedText
                text={"In-flight requests fail and the client must initialize again before it can call tools."}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setPendingSelector(null)}>
              <LocalizedText text={"Cancel"} />
            </Button>
            <Button variant="destructive" onClick={confirmDisconnect} disabled={terminate.isPending}>
              <LocalizedText text={"Disconnect"} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default MCPGatewaySessionsTab;
