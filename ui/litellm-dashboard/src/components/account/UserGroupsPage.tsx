"use client";

import { parseAsString, useQueryState } from "nuqs";
import { Users } from "lucide-react";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { AccessGroupsPage } from "@/app/(dashboard)/access-groups/_components/AccessGroupsPage";
import { AccessGroupDetail } from "@/app/(dashboard)/access-groups/_components/AccessGroupsDetailsPage";
import { LocalizedText, useUiLocale } from "@/lib/i18n";
import { isProxyAdminRole } from "@/utils/roles";
import { Page } from "@/components/shared/Page";
import { PageHeader, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/PageHeader";
import BillingGroupsAdmin from "./BillingGroupsAdmin";

export default function UserGroupsPage() {
  useUiLocale();
  const { userRole, isViewOnly, isAuthorized } = useAuthorized();
  const canManage = isAuthorized && !isViewOnly && isProxyAdminRole(userRole ?? "");
  const [groupId, setGroupId] = useQueryState("group", parseAsString.withOptions({ history: "push" }));
  if (groupId) return <AccessGroupDetail accessGroupId={groupId} onBack={() => void setGroupId(null)} />;
  if (!canManage) return <AccessGroupsPage />;
  return (
    <Page>
      <PageHeader>
        <PageHeaderTitle><Users /><LocalizedText text="User Groups" /></PageHeaderTitle>
        <PageHeaderDescription>
          <LocalizedText text="同一用户组统一管理成员、模型权限和计费倍率" />
        </PageHeaderDescription>
      </PageHeader>
      <BillingGroupsAdmin embedded onOpenGroup={(id) => void setGroupId(id)} />
    </Page>
  );
}