"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Users } from "lucide-react";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { AccessGroupsPage } from "@/app/(dashboard)/access-groups/_components/AccessGroupsPage";
import { LocalizedText, useUiLocale } from "@/lib/i18n";
import { isProxyAdminRole } from "@/utils/roles";
import { Page, PageTabs, PageTabsContent, PageTabsList, PageTabsTrigger } from "@/components/shared/Page";
import { PageHeader, PageHeaderControls, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/PageHeader";
import BillingGroupsAdmin from "./BillingGroupsAdmin";

export default function UserGroupsPage() {
  useUiLocale();
  const { userRole, isViewOnly, isAuthorized } = useAuthorized();
  const canManageBilling = isAuthorized && !isViewOnly && isProxyAdminRole(userRole ?? "");
  const [tab, setTab] = useQueryState(
    "groupTab",
    parseAsStringLiteral(["billing", "permissions"] as const).withDefault("billing").withOptions({ history: "push" }),
  );
  const activeTab = canManageBilling ? tab : "permissions";
  return (
    <Page>
      <PageTabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === "billing" || value === "permissions") void setTab(value);
        }}
      >
        <PageHeader>
          <PageHeaderTitle><Users /><LocalizedText text="User Groups" /></PageHeaderTitle>
          <PageHeaderDescription>
            <LocalizedText text="统一管理用户分组、模型组倍率与资源权限，保留现有账户和 Key 授权" />
          </PageHeaderDescription>
          <PageHeaderControls>
            <PageTabsList>
              {canManageBilling && <PageTabsTrigger value="billing"><LocalizedText text="分组与倍率" /></PageTabsTrigger>}
              <PageTabsTrigger value="permissions"><LocalizedText text="资源权限" /></PageTabsTrigger>
            </PageTabsList>
          </PageHeaderControls>
        </PageHeader>
        {canManageBilling && (
          <PageTabsContent value="billing" keepMounted><BillingGroupsAdmin embedded /></PageTabsContent>
        )}
        <PageTabsContent value="permissions" keepMounted><AccessGroupsPage embedded /></PageTabsContent>
      </PageTabs>
    </Page>
  );
}
