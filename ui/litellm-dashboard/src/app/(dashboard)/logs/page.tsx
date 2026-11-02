"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";

import { useCustomerNative } from "@/components/account/native/CustomerNativeContext";
import { useState } from "react";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import useCan from "@/app/(dashboard)/hooks/useCan";
import DeletedKeysPage from "@/components/DeletedKeysPage/DeletedKeysPage";
import DeletedTeamsPage from "@/components/DeletedTeamsPage/DeletedTeamsPage";
import AuditLogsPanel from "@/components/logs/audit/AuditLogsPanel";
import RequestLogsPanel from "@/components/logs/request/RequestLogsPanel";
import { Page, PageTabs, PageTabsList, PageTabsTrigger, PageTabsContent } from "@/components/shared/Page";
import { UiLoadingSpinner } from "@/components/ui/ui-loading-spinner";

type LogsTab = "request logs" | "audit logs" | "deleted keys" | "deleted teams";

export default function LogsPage() {
  useUiLocale();
  const { accessToken, userRole, userId, token, premiumUser } = useAuthorized();
  const [activeTab, setActiveTab] = useState<LogsTab>("request logs");
  const customer = useCustomerNative();
  const canViewAuditLogs = useCan("viewAuditLogs");
  const canViewDeletedTeams = useCan("viewDeletedTeams");

  const credentialsPending = !accessToken || !token;
  const identityPending = !userRole || !userId;

  if (credentialsPending || identityPending) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={translateMessage("Loading")}
        className="flex h-64 items-center justify-center"
      >
        <UiLoadingSpinner className="size-8 text-primary" />
      </div>
    );
  }

  return (
    <Page className="h-full">
      <PageTabs value={activeTab} onValueChange={(value: LogsTab) => setActiveTab(value)}>
        <PageTabsList>
          <PageTabsTrigger value="request logs">
            <LocalizedText text={"Request Logs"} />
          </PageTabsTrigger>
          {canViewAuditLogs && (
            <PageTabsTrigger value="audit logs">
              <LocalizedText text={"Audit Logs"} />
            </PageTabsTrigger>
          )}
          {!customer && (
            <PageTabsTrigger value="deleted keys">
              <LocalizedText text={"Deleted Keys"} />
            </PageTabsTrigger>
          )}
          {canViewDeletedTeams && (
            <PageTabsTrigger value="deleted teams">
              <LocalizedText text={"Deleted Teams"} />
            </PageTabsTrigger>
          )}
        </PageTabsList>

        <PageTabsContent value="request logs" keepMounted>
          <RequestLogsPanel
            accessToken={accessToken}
            token={token}
            userRole={userRole}
            userID={userId}
            isActive={activeTab === "request logs"}
          />
        </PageTabsContent>
        {canViewAuditLogs && (
          <PageTabsContent value="audit logs" keepMounted>
            <AuditLogsPanel
              accessToken={accessToken}
              token={token}
              userRole={userRole}
              userID={userId}
              premiumUser={premiumUser ?? false}
              isActive={activeTab === "audit logs"}
            />
          </PageTabsContent>
        )}
        {!customer && (
          <PageTabsContent value="deleted keys" keepMounted>
            <DeletedKeysPage />
          </PageTabsContent>
        )}
        {canViewDeletedTeams && (
          <PageTabsContent value="deleted teams" keepMounted>
            <DeletedTeamsPage />
          </PageTabsContent>
        )}
      </PageTabs>
    </Page>
  );
}
