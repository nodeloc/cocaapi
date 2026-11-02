"use client";
import { LocalizedText, getIntlLocale, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";
import { useTeams } from "@/app/(dashboard)/hooks/teams/useTeams";
import { organizationKeys, useOrganization } from "@/app/(dashboard)/hooks/organizations/useOrganizations";
import { useQueryClient } from "@tanstack/react-query";
import { useUrlTab } from "@/hooks/useUrlTab";
import { useVisitedTabs } from "@/hooks/useVisitedTabs";
import { MoneyCell } from "@/components/shared/table_cells";
import CopyButton from "@/components/shared/CopyButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumberWithCommas } from "@/utils/dataUtils";
import { teamDetailHref } from "@/utils/entityLinks";
import { createTeamAliasMap } from "@/utils/teamUtils";
import { BadgeLink } from "@/components/shared/BadgeLink";
import { ArrowLeft } from "lucide-react";
import React, { useMemo, useState } from "react";
import MemberTable, { type MemberTableColumn } from "../common_components/MemberTable";
import UserSearchModal from "../common_components/user_search_modal";
import { toast } from "@/lib/toast";
import {
  Member,
  organizationMemberAddCall,
  organizationMemberDeleteCall,
  organizationMemberUpdateCall,
} from "../networking";
import ObjectPermissionsView from "../object_permissions_view";
import MemberModal from "../team/EditMembership";
import { OrgSettingsForm } from "./org-settings/OrgSettingsForm";
import { ORGANIZATION_TAB_URL_KEY, ORGANIZATION_TABS, type OrganizationTab } from "./organizationTabs";

interface OrganizationInfoProps {
  organizationId: string;
  onClose: () => void;
  accessToken: string | null;
  is_org_admin: boolean;
  is_proxy_admin: boolean;
  userModels: string[];
}

const OrganizationInfoView: React.FC<OrganizationInfoProps> = ({
  organizationId,
  onClose,
  accessToken,
  is_org_admin,
  is_proxy_admin,
  userModels,
}) => {
  useUiLocale();
  const queryClient = useQueryClient();
  const { data: orgData, isLoading: loading } = useOrganization(organizationId);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddMemberModalVisible, setIsAddMemberModalVisible] = useState(false);
  const [isEditMemberModalVisible, setIsEditMemberModalVisible] = useState(false);
  const [selectedEditMember, setSelectedEditMember] = useState<Member | null>(null);
  const canEditOrg = is_org_admin || is_proxy_admin;
  const { data: teams } = useTeams();
  const [tab, setTab] = useUrlTab(ORGANIZATION_TABS, "overview", ORGANIZATION_TAB_URL_KEY);
  const { onTabChange, hasVisited } = useVisitedTabs(tab);

  const teamAliasMap = useMemo(() => createTeamAliasMap(teams), [teams]);

  const handleTabChange = (value: OrganizationTab) => {
    setTab(value);
    onTabChange(value);
  };

  const handleMemberAdd = async (values: any) => {
    try {
      if (accessToken == null) {
        return;
      }

      const member: Member = {
        user_email: values.user_email,
        user_id: values.user_id,
        role: values.role,
      };
      await organizationMemberAddCall(accessToken, organizationId, member);

      toast.success(translateMessage("Organization member added successfully"));
      setIsAddMemberModalVisible(false);
      queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    } catch (error) {
      toast.fromError("Failed to add organization member");
      console.error("Error adding organization member:", error);
    }
  };

  const handleMemberUpdate = async (values: any) => {
    try {
      if (!accessToken) return;

      const member: Member = {
        user_email: values.user_email,
        user_id: values.user_id,
        role: values.role,
      };

      await organizationMemberUpdateCall(accessToken, organizationId, member);
      toast.success(translateMessage("Organization member updated successfully"));
      setIsEditMemberModalVisible(false);
      queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    } catch (error) {
      toast.fromError("Failed to update organization member");
      console.error("Error updating organization member:", error);
    }
  };

  const handleMemberDelete = async (values: any) => {
    try {
      if (!accessToken) return;

      await organizationMemberDeleteCall(accessToken, organizationId, values.user_id);
      toast.success(translateMessage("Organization member deleted successfully"));
      setIsEditMemberModalVisible(false);
      queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    } catch (error) {
      toast.fromError("Failed to delete organization member");
      console.error("Error deleting organization member:", error);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <LocalizedText text={"Loading..."} />
      </div>
    );
  }

  if (!orgData) {
    return (
      <div className="p-4">
        <LocalizedText text={"Organization not found"} />
      </div>
    );
  }

  const orgMemberById = new Map((orgData.members || []).map((m) => [m.user_id, m]));
  const orgMemberFor = (record: Member) => (record.user_id != null ? orgMemberById.get(record.user_id) : undefined);

  const orgExtraColumns: MemberTableColumn[] = [
    markUiCopy(
      {
        title: "Spend (USD)",
        key: "spend",
        numeric: true,
        sortValue: (record: Member) => orgMemberFor(record)?.spend ?? null,
        render: (record: Member) => <MoneyCell value={orgMemberFor(record)?.spend} decimals={4} />,
      },
      { title: "Spend (USD)" },
    ),
    markUiCopy(
      {
        title: "Created At",
        key: "created_at",
        sortValue: (record: Member) => orgMemberFor(record)?.created_at ?? null,
        render: (record: Member) => {
          const createdAt = orgMemberFor(record)?.created_at;
          return <span>{createdAt ? new Date(createdAt).toLocaleString(getIntlLocale()) : "-"}</span>;
        },
      },
      { title: "Created At" },
    ),
  ];

  return (
    <div className="h-screen w-full bg-background p-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Button variant="ghost" onClick={onClose} className="mb-4">
            <ArrowLeft className="size-4" />
            <LocalizedText text={"Back to Organizations"} />
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{orgData.organization_alias}</h1>
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm text-muted-foreground">{orgData.organization_id}</span>
            <CopyButton
              value={orgData.organization_id}
              label={translateMessage("Copy organization ID")}
              iconClassName="size-3"
            />
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="mb-4">
        <TabsList variant="line" className="h-auto w-full justify-start rounded-none border-b p-0">
          <TabsTrigger value="overview" className="flex-none rounded-none px-4 py-2">
            <LocalizedText text={"Overview"} />
          </TabsTrigger>
          <TabsTrigger value="members" className="flex-none rounded-none px-4 py-2">
            <LocalizedText text={"Members"} />
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex-none rounded-none px-4 py-2">
            <LocalizedText text={"Settings"} />
          </TabsTrigger>
        </TabsList>

        <TabsContent keepMounted={hasVisited("overview")} value="overview" className="pt-4">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  <LocalizedText text={"Organization Details"} />
                </p>
                <div className="mt-2 text-sm text-foreground">
                  <p>
                    <LocalizedText text={"Created: "} />
                    {new Date(orgData.created_at).toLocaleDateString(getIntlLocale())}
                  </p>
                  <p>
                    <LocalizedText text={"Updated: "} />
                    {new Date(orgData.updated_at).toLocaleDateString(getIntlLocale())}
                  </p>
                  <p>
                    <LocalizedText text={"Created By: "} />
                    {orgData.created_by}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  <LocalizedText text={"Budget Status"} />
                </p>
                <div className="mt-2 text-sm text-foreground">
                  <p className="text-xl font-semibold">${formatNumberWithCommas(orgData.spend, 4)}</p>
                  <p>
                    <LocalizedText text={"of"} />{" "}
                    {orgData.litellm_budget_table.max_budget === null
                      ? translateMessage("Unlimited")
                      : `$${formatNumberWithCommas(orgData.litellm_budget_table.max_budget, 4)}`}
                  </p>
                  {orgData.litellm_budget_table.budget_duration && (
                    <p className="text-muted-foreground">
                      <LocalizedText text={"Reset: "} />
                      {orgData.litellm_budget_table.budget_duration}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  <LocalizedText text={"Rate Limits"} />
                </p>
                <div className="mt-2 text-sm text-foreground">
                  <p>
                    <LocalizedText text={"TPM: "} />
                    {orgData.litellm_budget_table.tpm_limit ?? translateMessage("Unlimited")}
                  </p>
                  <p>
                    <LocalizedText text={"RPM: "} />
                    {orgData.litellm_budget_table.rpm_limit ?? translateMessage("Unlimited")}
                  </p>
                  {orgData.litellm_budget_table.max_parallel_requests && (
                    <p>
                      <LocalizedText text={"Max Parallel Requests: "} />
                      {orgData.litellm_budget_table.max_parallel_requests}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  <LocalizedText text={"Models"} />
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {orgData.models.length === 0 ? (
                    <BadgeLink>
                      <LocalizedText text={"All proxy models"} />
                    </BadgeLink>
                  ) : (
                    orgData.models.map((model, index) => <BadgeLink key={index}>{model}</BadgeLink>)
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  <LocalizedText text={"Teams"} />
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {orgData.teams?.map((team, index) => (
                    <BadgeLink key={index} href={teamDetailHref(team.team_id)}>
                      {teamAliasMap[team.team_id] || team.team_id}
                    </BadgeLink>
                  ))}
                </div>
              </CardContent>
            </Card>

            <ObjectPermissionsView
              objectPermission={orgData.object_permission}
              variant="card"
              accessToken={accessToken}
            />
          </div>
        </TabsContent>

        <TabsContent keepMounted={hasVisited("members")} value="members" className="pt-4">
          <div className="space-y-4">
            <MemberTable
              key={orgData.organization_id}
              members={(orgData.members || []).map((m) => ({
                role: m.user_role || "",
                user_id: m.user_id,
                user_email: m.user_email,
                user_alias: m.user?.user_alias ?? null,
              }))}
              canEdit={canEditOrg}
              onEdit={(member) => {
                setSelectedEditMember(member);
                setIsEditMemberModalVisible(true);
              }}
              onDelete={(member) => handleMemberDelete(member)}
              onAddMember={() => setIsAddMemberModalVisible(true)}
              roleColumnTitle="Organization Role"
              extraColumns={orgExtraColumns}
              emptyText={translateMessage("No members found")}
            />
          </div>
        </TabsContent>

        <TabsContent keepMounted={hasVisited("settings")} value="settings" className="pt-4">
          <Card className="max-h-[65vh] overflow-y-auto">
            <CardContent>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                  <LocalizedText text={"Organization Settings"} />
                </h2>
                {canEditOrg && !isEditing && (
                  <Button onClick={() => setIsEditing(true)}>
                    <LocalizedText text={"Edit Settings"} />
                  </Button>
                )}
              </div>

              {isEditing ? (
                <OrgSettingsForm
                  organizationId={organizationId}
                  org={orgData}
                  accessToken={accessToken || ""}
                  onCancel={() => setIsEditing(false)}
                  onSaved={() => setIsEditing(false)}
                />
              ) : (
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="font-medium text-foreground">
                      <LocalizedText text={"Organization Name"} />
                    </p>
                    <div>{orgData.organization_alias}</div>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      <LocalizedText text={"Organization ID"} />
                    </p>
                    <div className="font-mono">{orgData.organization_id}</div>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      <LocalizedText text={"Created At"} />
                    </p>
                    <div>{new Date(orgData.created_at).toLocaleString(getIntlLocale())}</div>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      <LocalizedText text={"Models"} />
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {orgData.models.map((model, index) => (
                        <BadgeLink key={index}>{model}</BadgeLink>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      <LocalizedText text={"Rate Limits"} />
                    </p>
                    <div>
                      <LocalizedText text={"TPM: "} />
                      {orgData.litellm_budget_table.tpm_limit ?? translateMessage("Unlimited")}
                    </div>
                    <div>
                      <LocalizedText text={"RPM: "} />
                      {orgData.litellm_budget_table.rpm_limit ?? translateMessage("Unlimited")}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      <LocalizedText text={"Budget"} />
                    </p>
                    <div>
                      <LocalizedText text={"Max:"} />{" "}
                      {orgData.litellm_budget_table.max_budget !== null
                        ? `$${formatNumberWithCommas(orgData.litellm_budget_table.max_budget, 4)}`
                        : translateMessage("No Limit")}
                    </div>
                    <div>
                      <LocalizedText text={"Reset: "} />
                      {orgData.litellm_budget_table.budget_duration || translateMessage("Never")}
                    </div>
                  </div>

                  <ObjectPermissionsView
                    objectPermission={orgData.object_permission}
                    variant="inline"
                    className="border-t pt-4"
                    accessToken={accessToken}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <UserSearchModal
        isVisible={isAddMemberModalVisible}
        onCancel={() => setIsAddMemberModalVisible(false)}
        onSubmit={handleMemberAdd}
        accessToken={accessToken}
        title={translateMessage("Add Organization Member")}
        roles={[
          markUiCopy(
            {
              label: "org_admin",
              value: "org_admin",
              description: "Can add and remove members, and change their roles.",
            },
            { description: "Can add and remove members, and change their roles." },
          ),
          markUiCopy(
            {
              label: "internal_user",
              value: "internal_user",
              description: "Can view/create keys for themselves within organization.",
            },
            { description: "Can view/create keys for themselves within organization." },
          ),
          markUiCopy(
            {
              label: "internal_user_viewer",
              value: "internal_user_viewer",
              description: "Can only view their keys within organization.",
            },
            { description: "Can only view their keys within organization." },
          ),
        ]}
        defaultRole="internal_user"
      />
      <MemberModal
        visible={isEditMemberModalVisible}
        onCancel={() => setIsEditMemberModalVisible(false)}
        onSubmit={handleMemberUpdate}
        initialData={selectedEditMember}
        mode="edit"
        config={markUiCopy(
          {
            title: "Edit Member",
            showEmail: true,
            showUserId: true,
            roleOptions: [
              markUiCopy({ label: "Org Admin", value: "org_admin" }, { label: "Org Admin" }),
              markUiCopy({ label: "Internal User", value: "internal_user" }, { label: "Internal User" }),
              markUiCopy(
                { label: "Internal User Viewer", value: "internal_user_viewer" },
                { label: "Internal User Viewer" },
              ),
            ],
          },
          { title: "Edit Member" },
        )}
      />
    </div>
  );
};

export default OrganizationInfoView;
