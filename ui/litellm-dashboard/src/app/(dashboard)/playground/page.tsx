"use client";
import { LocalizedText, useUiLocale } from "@/lib/i18n";

import { useCustomerNative } from "@/components/account/native/CustomerNativeContext";
import { useState, useEffect } from "react";
import AgentBuilderView from "@/app/(dashboard)/playground/components/chat_ui/AgentBuilderView";
import ChatUI from "@/app/(dashboard)/playground/components/chat_ui/ChatUI";
import CompareUI from "@/app/(dashboard)/playground/components/compareUI/CompareUI";
import ComplianceUI from "@/app/(dashboard)/playground/components/complianceUI/ComplianceUI";
import SystemOneUI from "@/app/(dashboard)/playground/components/systemOneUI/SystemOneUI";
import BetaBadge from "@/components/BetaBadge";
import { DeprecationBanner } from "@/components/DeprecationBanner";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { fetchProxySettings } from "@/utils/proxyUtils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/useUrlTab";

const PLAYGROUND_TABS = ["chat", "compare", "compliance", "system-one", "agent-builder"] as const;

interface ProxySettings {
  PROXY_BASE_URL?: string;
  LITELLM_UI_API_DOC_BASE_URL?: string | null;
}

export default function PlaygroundPage() {
  useUiLocale();
  const { accessToken, userRole, userId, disabledPersonalKeyCreation, token, isViewOnly } = useAuthorized();
  const customer = useCustomerNative();
  const [proxySettings, setProxySettings] = useState<ProxySettings | undefined>(undefined);
  const [activeTab, setActiveTab] = useUrlTab(PLAYGROUND_TABS, "chat");

  useEffect(() => {
    const initializeProxySettings = async () => {
      if (accessToken) {
        const settings = await fetchProxySettings(accessToken);
        if (settings) {
          setProxySettings({
            PROXY_BASE_URL: settings.PROXY_BASE_URL,
            LITELLM_UI_API_DOC_BASE_URL: settings.LITELLM_UI_API_DOC_BASE_URL,
          });
        }
      }
    };

    initializeProxySettings();
  }, [accessToken]);

  if (isViewOnly) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-2xl font-semibold">
          <LocalizedText text={"Access Denied"} />
        </h1>
        <p className="text-muted-foreground">
          <LocalizedText
            text={"Your role does not have access to the Playground. Ask your proxy admin for access to test models."}
          />
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <Tabs
        value={customer ? "chat" : activeTab}
        onValueChange={setActiveTab}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden"
      >
        <TabsList variant="line" className="w-full shrink-0 justify-start overflow-x-auto pb-1">
          <TabsTrigger value="chat" className="flex-none">
            <LocalizedText text={"Chat"} />
          </TabsTrigger>
          {!customer && (
            <>
              <TabsTrigger value="compare" className="flex-none">
                <LocalizedText text={"Compare"} />
              </TabsTrigger>
              <TabsTrigger value="compliance" className="flex-none">
                <LocalizedText text={"Compliance"} />
              </TabsTrigger>
              <TabsTrigger value="system-one" className="flex-none">
                <BetaBadge>
                  <LocalizedText text={"Decisions"} />
                </BetaBadge>
              </TabsTrigger>
              <TabsTrigger value="agent-builder" className="flex-none">
                <LocalizedText text={"Agent Builder (Experimental)"} />
              </TabsTrigger>
            </>
          )}
        </TabsList>
        <TabsContent
          value="chat"
          className="mt-0 h-full min-h-0 min-w-0 overflow-hidden data-hidden:hidden"
          keepMounted
        >
          <ChatUI
            accessToken={accessToken}
            token={token}
            userRole={userRole}
            userID={userId}
            disabledPersonalKeyCreation={customer ? true : disabledPersonalKeyCreation}
            proxySettings={proxySettings}
          />
        </TabsContent>
        {!customer && (
          <>
            <TabsContent value="compare" className="mt-0 h-full data-hidden:hidden" keepMounted>
              <CompareUI accessToken={accessToken} disabledPersonalKeyCreation={disabledPersonalKeyCreation} />
            </TabsContent>
            <TabsContent value="compliance" className="mt-0 h-full data-hidden:hidden" keepMounted>
              <ComplianceUI accessToken={accessToken} disabledPersonalKeyCreation={disabledPersonalKeyCreation} />
            </TabsContent>
            <TabsContent value="system-one" className="mt-0 min-h-0 data-hidden:hidden" keepMounted>
              <SystemOneUI accessToken={accessToken} disabledPersonalKeyCreation={disabledPersonalKeyCreation} />
            </TabsContent>
            <TabsContent value="agent-builder" className="mt-0 h-full data-hidden:hidden" keepMounted>
              <DeprecationBanner featureName="The Playground's Agent Builder" />
              <AgentBuilderView
                accessToken={accessToken}
                token={token}
                userID={userId}
                userRole={userRole}
                disabledPersonalKeyCreation={disabledPersonalKeyCreation}
                proxySettings={proxySettings}
                customProxyBaseUrl={proxySettings?.LITELLM_UI_API_DOC_BASE_URL ?? proxySettings?.PROXY_BASE_URL}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
