"use client";
import { LocalizedText, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  userGetInfoV2,
  UserInfoV2Response,
  userDeleteCall,
  userUpdateUserCall,
  modelAvailableCall,
  invitationCreateCall,
  getProxyBaseUrl,
  teamInfoCall,
  teamListCall,
  teamMemberAddCall,
  teamMemberDeleteCall,
  Member,
} from "@/components/networking";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hasProxyWideSpendView, isProxyAdminTierRole, rolesWithWriteAccess } from "@/utils/roles";
import { teamDetailHref } from "@/utils/entityLinks";
import { BadgeLink } from "@/components/shared/BadgeLink";
import { UserEditView } from "../user_edit_view";
import OnboardingModal, { InvitationLink } from "@/components/onboarding_link";
import { copyToClipboard as utilCopyToClipboard } from "@/utils/dataUtils";
import { ArrowLeft, CheckIcon, CopyIcon, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import DeleteResourceModal from "@/components/common_components/DeleteResourceModal";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { useMCPServers } from "@/app/(dashboard)/hooks/mcpServers/useMCPServers";
import { useMCPToolsets } from "@/app/(dashboard)/hooks/mcpServers/useMCPToolsets";
import { extractMcpEntitlement } from "@/components/mcp_server_management/mcpEntitlement";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ScopedSavingsTab from "@/components/shared/ScopedSavingsTab";
import { AutoRouterUsageView } from "@/app/(dashboard)/cost-optimization/_components/AutoRouterBenchmarksTab";
import { useActivityDateRange } from "@/app/(dashboard)/cost-optimization/_components/useDailyActivityRange";

import UserInformationFields, { UserSpendCard, userEditSeed } from "./UserInformationFields";
import { useQueryClient } from "@tanstack/react-query";
import { useUserGroupMemberships } from "@/components/account/useUserGroupMemberships";
import UserAccountAccess, { useUserAccountAccess } from "@/components/account/UserAccountAccess";
import UserWalletPanel, { type WalletAdjustmentRequests } from "@/components/account/UserWalletPanel";

interface UserInfoViewProps {
  userId: string;
  onClose: () => void;
  accessToken: string | null;
  userRole: string | null;
  onDelete?: () => void;
  possibleUIRoles: Record<string, Record<string, string>> | null;
  initialTab?: number;
  startInEditMode?: boolean;
  walletRequests?: WalletAdjustmentRequests;
}

/** Team info used for display in user detail view */
interface TeamDisplayInfo {
  team_id: string;
  team_alias: string | null;
}

const ADD_TEAM_FIELD_ID = "add-team-team";
const ADD_TEAM_ROLE_FIELD_ID = "add-team-role";

interface TeamOption {
  team_id: string;
  team_alias: string;
}

const MEMBER_ROLE_OPTIONS = [
  { value: "user", hint: "Can view team info, but not manage it" },
  { value: "admin", hint: "Can create team keys, add members, and manage settings" },
] as const;

export default function UserInfoView({
  userId,
  onClose,
  accessToken,
  userRole,
  onDelete,
  possibleUIRoles,
  startInEditMode = false,
  walletRequests,
}: UserInfoViewProps) {
  useUiLocale();
  const { premiumUser, userId: signedInUserId, isViewOnly } = useAuthorized();
  const canWriteUser = !isViewOnly && Boolean(userRole && rolesWithWriteAccess.includes(userRole));
  const canReadAccount = isProxyAdminTierRole(userRole ?? "");
  const queryClient = useQueryClient();
  const membership = useUserGroupMemberships([userId], accessToken, canReadAccount);
  const member = membership.members.get(userId);
  const accountAccess = useUserAccountAccess(accessToken, userId, Boolean(member) && membership.status === "ready");
  const [localWalletRequests] = useState<WalletAdjustmentRequests>(() => new Map());
  const [walletBusy, setWalletBusy] = useState(false);
  const canViewAutoRouterUsage = hasProxyWideSpendView(userRole);
  const canViewSavings = canViewAutoRouterUsage || (Boolean(userId.trim()) && userId === signedInUserId);
  const activityDateRange = useActivityDateRange();
  const [userData, setUserData] = useState<UserInfoV2Response | null>(null);
  const [teamDetails, setTeamDetails] = useState<TeamDisplayInfo[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(startInEditMode && canWriteUser);
  const [userModels, setUserModels] = useState<string[]>([]);
  const [isInvitationLinkModalVisible, setIsInvitationLinkModalVisible] = useState(false);
  const [invitationLinkData, setInvitationLinkData] = useState<InvitationLink | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("account");
  const hiddenSavingsTab = activeTab === "savings" && !canViewSavings;
  const hiddenRouterTab = activeTab === "auto-router-usage" && !canViewAutoRouterUsage;
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [isTeamsExpanded, setIsTeamsExpanded] = useState(false);
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false);
  const [isRemoveTeamModalOpen, setIsRemoveTeamModalOpen] = useState(false);
  const [teamToRemove, setTeamToRemove] = useState<TeamDisplayInfo | null>(null);
  const [isAddingTeam, setIsAddingTeam] = useState(false);
  const [isRemovingTeam, setIsRemovingTeam] = useState(false);
  const [allTeams, setAllTeams] = useState<Array<{ team_id: string; team_alias: string }>>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("user");
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const { data: allMcpServers = [] } = useMCPServers();
  const { data: allMcpToolsets = [] } = useMCPToolsets();

  React.useEffect(() => {
    setBaseUrl(getProxyBaseUrl());
  }, []);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        if (!accessToken) return;
        const data = await userGetInfoV2(accessToken, userId);
        setUserData(data);

        // Fetch team details for display (team aliases)
        if (data.teams && data.teams.length > 0) {
          try {
            const teamPromises = data.teams.map(async (teamId: string) => {
              try {
                const teamData = await teamInfoCall(accessToken, teamId);
                return {
                  team_id: teamId,
                  team_alias: teamData?.team_info?.team_alias || null,
                };
              } catch {
                return { team_id: teamId, team_alias: null };
              }
            });
            const teams = await Promise.all(teamPromises);
            setTeamDetails(teams);
          } catch {
            // Fall back to just team IDs
            setTeamDetails(data.teams.map((id: string) => ({ team_id: id, team_alias: null })));
          }
        }

        // Fetch available models
        const modelDataResponse = await modelAvailableCall(accessToken, userId, userRole || "");
        const availableModels = modelDataResponse.data.map((model: any) => model.id);
        setUserModels(availableModels);
      } catch (error) {
        console.error("Error fetching user data:", error);
        toast.fromError("Failed to fetch user data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [accessToken, userId, userRole]);

  const isProxyAdmin = !isViewOnly && (userRole === "proxy_admin" || userRole === "Admin");

  const fetchAllTeams = async () => {
    if (!accessToken) return;
    setIsLoadingTeams(true);
    try {
      const teams = await teamListCall(accessToken, null);
      setAllTeams(
        (teams || []).map((t: any) => ({
          team_id: t.team_id,
          team_alias: t.team_alias || t.team_id,
        })),
      );
    } catch (error) {
      console.error("Error fetching teams:", error);
    } finally {
      setIsLoadingTeams(false);
    }
  };

  const handleOpenAddTeamModal = () => {
    setSelectedTeamId("");
    setSelectedRole("user");
    setIsAddTeamModalOpen(true);
    fetchAllTeams();
  };

  const handleAddTeamSubmit = async () => {
    if (!accessToken || !selectedTeamId) return;
    setIsAddingTeam(true);
    try {
      const member: Member = {
        role: selectedRole,
        user_id: userId,
      };
      await teamMemberAddCall(accessToken, selectedTeamId, member);
      toast.success(translateMessage("User added to team successfully"));
      setIsAddTeamModalOpen(false);
      // Re-fetch user data to refresh teams
      const data = await userGetInfoV2(accessToken, userId);
      setUserData(data);
      if (data.teams && data.teams.length > 0) {
        const teamPromises = data.teams.map(async (teamId: string) => {
          try {
            const teamData = await teamInfoCall(accessToken, teamId);
            return { team_id: teamId, team_alias: teamData?.team_info?.team_alias || null };
          } catch {
            return { team_id: teamId, team_alias: null };
          }
        });
        setTeamDetails(await Promise.all(teamPromises));
      } else {
        setTeamDetails([]);
      }
    } catch (error: any) {
      console.error("Error adding user to team:", error);
      toast.fromError(error?.message || "Failed to add user to team");
    } finally {
      setIsAddingTeam(false);
    }
  };

  const handleOpenRemoveTeamModal = (team: TeamDisplayInfo) => {
    setTeamToRemove(team);
    setIsRemoveTeamModalOpen(true);
  };

  const handleRemoveTeamConfirm = async () => {
    if (!accessToken || !teamToRemove) return;
    setIsRemovingTeam(true);
    try {
      const member: Member = {
        role: "user",
        user_id: userId,
      };
      await teamMemberDeleteCall(accessToken, teamToRemove.team_id, member);
      toast.success(translateMessage("User removed from team successfully"));
      setIsRemoveTeamModalOpen(false);
      setTeamToRemove(null);
      // Re-fetch user data to refresh teams
      const data = await userGetInfoV2(accessToken, userId);
      setUserData(data);
      if (data.teams && data.teams.length > 0) {
        const teamPromises = data.teams.map(async (teamId: string) => {
          try {
            const teamData = await teamInfoCall(accessToken, teamId);
            return { team_id: teamId, team_alias: teamData?.team_info?.team_alias || null };
          } catch {
            return { team_id: teamId, team_alias: null };
          }
        });
        setTeamDetails(await Promise.all(teamPromises));
      } else {
        setTeamDetails([]);
      }
    } catch (error: any) {
      console.error("Error removing user from team:", error);
      toast.fromError(error?.message || "Failed to remove user from team");
    } finally {
      setIsRemovingTeam(false);
    }
  };

  const handleRemoveTeamCancel = () => {
    setIsRemoveTeamModalOpen(false);
    setTeamToRemove(null);
  };

  const availableTeamsForAdd = allTeams.filter((t) => !teamDetails.some((td) => td.team_id === t.team_id));

  const selectedTeamOption = availableTeamsForAdd.find((team) => team.team_id === selectedTeamId) ?? null;

  const handleResetPassword = async () => {
    if (!accessToken) {
      toast.fromError("Access token not found");
      return;
    }
    try {
      toast.success(translateMessage("Generating password reset link..."));
      const data = await invitationCreateCall(accessToken, userId);
      setInvitationLinkData(data);
      setIsInvitationLinkModalVisible(true);
    } catch (error) {
      toast.fromError("Failed to generate password reset link");
    }
  };

  const handleDelete = async () => {
    try {
      if (!accessToken) return;
      setIsDeletingUser(true);
      await userDeleteCall(accessToken, [userId]);
      toast.success(translateMessage("User deleted successfully"));
      if (onDelete) {
        onDelete();
      }
      onClose();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.fromError("Failed to delete user");
    } finally {
      setIsDeleteModalOpen(false);
      setIsDeletingUser(false);
    }
  };

  const cancelDelete = () => {
    setIsDeleteModalOpen(false);
  };

  const handleUserUpdate = async (formValues: Record<string, any>) => {
    try {
      if (!accessToken || !userData || !canWriteUser) return;

      const mcpEntitlement = extractMcpEntitlement(formValues, allMcpServers, allMcpToolsets);
      const userFields = Object.fromEntries(
        Object.entries(formValues).filter(
          ([field]) => field !== "mcp_servers_and_groups" && field !== "mcp_tool_permissions",
        ),
      );

      await userUpdateUserCall(
        accessToken,
        mcpEntitlement ? { ...userFields, object_permission: mcpEntitlement } : userFields,
        null,
      );

      // Update local state with new values
      setUserData({
        ...userData,
        user_email: formValues.user_email ?? userData.user_email,
        user_alias: formValues.user_alias ?? userData.user_alias,
        user_role: formValues.user_role ?? userData.user_role,
        models: formValues.models ?? userData.models,
        max_budget: formValues.max_budget === undefined ? userData.max_budget : formValues.max_budget,
        tpm_limit: formValues.tpm_limit === undefined ? userData.tpm_limit : formValues.tpm_limit,
        rpm_limit: formValues.rpm_limit === undefined ? userData.rpm_limit : formValues.rpm_limit,
        budget_duration:
          formValues.budget_duration === undefined ? userData.budget_duration : formValues.budget_duration,
        metadata: formValues.metadata ?? userData.metadata,
        model_max_budget: formValues.model_max_budget ?? userData.model_max_budget,
        object_permission: mcpEntitlement
          ? { ...userData.object_permission, ...mcpEntitlement }
          : userData.object_permission,
      });

      toast.success(translateMessage("User updated successfully"));
      setIsEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["userList"] });
      await queryClient.invalidateQueries({ queryKey: ["adminUserAccess", userId] });
    } catch (error) {
      console.error("Error updating user:", error);
      toast.fromError("Failed to update user");
    }
  };

  const userDataForEdit = React.useMemo(() => (userData ? userEditSeed(userData) : null), [userData]);

  if (isLoading) {
    return (
      <div className="p-4">
        <Button variant="ghost" onClick={onClose} disabled={walletBusy} className="mb-4">
          <ArrowLeft />
          <LocalizedText text={"Back to Users"} />
        </Button>
        <p className="text-sm">
          <LocalizedText text={"Loading user data..."} />
        </p>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="p-4">
        <Button variant="ghost" onClick={onClose} disabled={walletBusy} className="mb-4">
          <ArrowLeft />
          <LocalizedText text={"Back to Users"} />
        </Button>
        <p className="text-sm">
          <LocalizedText text={"User not found"} />
        </p>
      </div>
    );
  }

  const copyToClipboard = async (text: string, key: string) => {
    const success = await utilCopyToClipboard(text);
    if (success) {
      setCopiedStates((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedStates((prev) => ({ ...prev, [key]: false }));
      }, 2000);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-full">
          <Button variant="ghost" onClick={onClose} disabled={walletBusy} className="mb-4">
            <ArrowLeft />
            <LocalizedText text={"Back to Users"} />
          </Button>
          <h2 className="break-all text-xl font-semibold">{userData.user_email || translateMessage("User")}</h2>
          <div className="flex items-center cursor-pointer">
            <span className="break-all text-sm text-muted-foreground font-mono">{userData.user_id}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => copyToClipboard(userData.user_id, "user-id")}
              className={`left-2 z-raised transition-all duration-200 ${
                copiedStates["user-id"]
                  ? "text-success bg-success/10 border-success/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {copiedStates["user-id"] ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
            </Button>
          </div>
        </div>
        {canWriteUser && (
          <div className="flex items-center space-x-2">
            <Button
              variant="secondary"
              onClick={handleResetPassword}
              disabled={walletBusy}
              className="flex items-center"
            >
              <RefreshCw />
              <LocalizedText text={"Reset Password"} />
            </Button>
            <Button
              variant="secondary"
              disabled={walletBusy}
              onClick={() => setIsDeleteModalOpen(true)}
              className="flex items-center text-destructive border-destructive hover:bg-destructive/10"
            >
              <Trash2 />
              <LocalizedText text={"Delete User"} />
            </Button>
          </div>
        )}
      </div>

      <DeleteResourceModal
        isOpen={isDeleteModalOpen}
        title={translateMessage("Delete User?")}
        message={translateMessage("Are you sure you want to delete this user? This action cannot be undone.")}
        resourceInformationTitle="User Information"
        resourceInformation={[
          markUiCopy({ label: "Email", value: userData.user_email }, { label: "Email" }),
          markUiCopy({ label: "User ID", value: userData.user_id, code: true }, { label: "User ID" }),
          markUiCopy(
            {
              label: "Global Proxy Role",
              value:
                (userData.user_role && possibleUIRoles?.[userData.user_role]?.ui_label) || userData.user_role || "-",
            },
            { label: "Global Proxy Role" },
          ),
          markUiCopy(
            {
              label: "Total Spend (USD)",
              value: userData.spend !== null && userData.spend !== undefined ? userData.spend.toFixed(2) : undefined,
            },
            { label: "Total Spend (USD)" },
          ),
        ]}
        onCancel={cancelDelete}
        onOk={handleDelete}
        confirmLoading={isDeletingUser}
      />

      <Tabs
        value={hiddenSavingsTab || hiddenRouterTab ? "account" : activeTab}
        onValueChange={(v: unknown) => {
          if (!walletBusy) setActiveTab(String(v));
        }}
        className="gap-0"
      >
        <TabsList variant="line" className="mb-4">
          <TabsTrigger value="account" className="flex-none data-active:text-primary after:bg-primary">
            <LocalizedText text="账户管理" />
          </TabsTrigger>
          {canViewSavings && (
            <TabsTrigger value="savings" className="flex-none data-active:text-primary after:bg-primary">
              <LocalizedText text={"Savings"} />
            </TabsTrigger>
          )}
          {canViewAutoRouterUsage && (
            <TabsTrigger value="auto-router-usage" className="flex-none data-active:text-primary after:bg-primary">
              <LocalizedText text={"Auto-router usage"} />
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="account" keepMounted>
          <div className="space-y-6">
            <div className="grid items-start gap-6 xl:grid-cols-2">
              <Card className="block p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">
                    <LocalizedText text="基本信息" />
                  </h3>
                  {!isEditing && canWriteUser && (
                    <Button onClick={() => setIsEditing(true)}>
                      <LocalizedText text={"Edit Settings"} />
                    </Button>
                  )}
                </div>

                {isEditing && userData ? (
                  <UserEditView
                    userData={userDataForEdit}
                    onCancel={() => setIsEditing(false)}
                    onSubmit={handleUserUpdate}
                    teams={teamDetails}
                    accessToken={accessToken}
                    userID={userId}
                    userRole={userRole}
                    userModels={userModels}
                    possibleUIRoles={possibleUIRoles}
                    objectPermission={userData.object_permission}
                    premiumUser={premiumUser === true}
                    modelAccessManagedByGroup={
                      canReadAccount &&
                      (membership.status !== "ready" ||
                        (Boolean(member) && accountAccess.data?.model_access_source !== "personal"))
                    }
                  />
                ) : (
                  <UserInformationFields
                    userData={userData}
                    accessToken={accessToken}
                    canReadAccount={canReadAccount}
                    userIdCopied={Boolean(copiedStates["user-id"])}
                    onCopyUserId={() => void copyToClipboard(userData.user_id, "user-id")}
                  />
                )}
              </Card>
              <div className="min-w-0 space-y-6">
                {canReadAccount && accessToken && (
                  <UserAccountAccess
                    token={accessToken}
                    userId={userId}
                    member={member}
                    status={membership.status}
                    canManage={isProxyAdmin}
                    nativeModels={userData.models}
                    onChanged={() => {
                      void queryClient.invalidateQueries({ queryKey: ["userList"] });
                    }}
                  />
                )}
                <UserSpendCard spend={userData.spend} maxBudget={userData.max_budget} />
              </div>
            </div>
            {canReadAccount && (
              <Card className="min-w-0 p-6">
                <h3 className="mb-5 text-lg font-medium">
                  <LocalizedText text="余额与流水" />
                </h3>
                {isProxyAdmin && membership.status === "ready" && member && accessToken && (
                  <UserWalletPanel
                    key={userId}
                    token={accessToken}
                    userId={userId}
                    requests={walletRequests ?? localWalletRequests}
                    onBusyChange={setWalletBusy}
                  />
                )}
                {isProxyAdmin && membership.status === "loading" && (
                  <p role="status">
                    <LocalizedText text="加载中" />
                  </p>
                )}
                {isProxyAdmin && membership.status === "error" && (
                  <p role="alert">
                    <LocalizedText text="用户组暂不可用，请刷新后重试。" />
                  </p>
                )}
                {isProxyAdmin && membership.status === "ready" && !member && (
                  <p className="text-sm text-muted-foreground">
                    <LocalizedText text="系统账户不使用余额钱包" />
                  </p>
                )}
                {!isProxyAdmin && (
                  <p className="text-sm text-muted-foreground">
                    <LocalizedText text="仅完整代理管理员可以管理余额、充值和兑换码。" />
                  </p>
                )}
              </Card>
            )}
            <Card className="block p-6">
              <div className="flex justify-between items-center mb-2">
                <p>
                  <LocalizedText text={"Teams"} />
                </p>
                {isProxyAdmin && (
                  <Button variant="ghost" size="sm" onClick={handleOpenAddTeamModal}>
                    <Plus />
                    <LocalizedText text={"Add Team"} />
                  </Button>
                )}
              </div>
              <div className="mt-2">
                {teamDetails.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <LocalizedText text={"Team Name"} />
                          </TableHead>
                          {isProxyAdmin && (
                            <TableHead className="text-right">
                              <LocalizedText text={"Actions"} />
                            </TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamDetails.slice(0, isTeamsExpanded ? teamDetails.length : 20).map((team) => (
                          <TableRow key={team.team_id}>
                            <TableCell>
                              <BadgeLink href={teamDetailHref(team.team_id)}>
                                {team.team_alias || team.team_id}
                              </BadgeLink>
                            </TableCell>
                            {isProxyAdmin && (
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={translateMessage("Remove from %{0}", [team.team_alias || team.team_id])}
                                  onClick={() => handleOpenRemoveTeamModal(team)}
                                  className="text-destructive"
                                >
                                  <Trash2 />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p>
                    <LocalizedText text={"No teams"} />
                  </p>
                )}
                {!isTeamsExpanded && teamDetails.length > 20 && (
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setIsTeamsExpanded(true)}>
                    +{teamDetails.length - 20}
                    <LocalizedText text={" more"} />
                  </Button>
                )}
                {isTeamsExpanded && teamDetails.length > 20 && (
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setIsTeamsExpanded(false)}>
                    <LocalizedText text={"Show Less"} />
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>
        {canViewSavings && (
          <TabsContent value="savings">
            {activeTab === "savings" &&
              (userId.trim() ? (
                <ScopedSavingsTab
                  key={userId}
                  accessToken={accessToken}
                  scope={{ userId }}
                  activity={activityDateRange}
                  entityType="user"
                  scopeNote="Savings for this user across API keys and JWT-authenticated requests."
                />
              ) : (
                <p role="alert">
                  <LocalizedText text={"Savings are unavailable because this user has no ID."} />
                </p>
              ))}
          </TabsContent>
        )}
        {canViewAutoRouterUsage && (
          <TabsContent value="auto-router-usage">
            {activeTab === "auto-router-usage" &&
              (userId.trim() ? (
                <AutoRouterUsageView
                  key={userId}
                  accessToken={accessToken}
                  userId={userId}
                  activity={activityDateRange}
                />
              ) : (
                <p role="alert">
                  <LocalizedText text={"Auto-router usage is unavailable because this user has no ID."} />
                </p>
              ))}
          </TabsContent>
        )}
      </Tabs>
      <OnboardingModal
        isInvitationLinkModalVisible={isInvitationLinkModalVisible}
        setIsInvitationLinkModalVisible={setIsInvitationLinkModalVisible}
        baseUrl={baseUrl || ""}
        invitationLinkData={invitationLinkData}
        modalType="resetPassword"
      />

      {/* Delete Team Member Modal */}
      <DeleteResourceModal
        isOpen={isRemoveTeamModalOpen}
        title={translateMessage("Remove from Team")}
        alertMessage="Removing this user from the team will also delete any keys the user created for this team."
        message={translateMessage(
          "Are you sure you want to remove this user from the team? This action cannot be undone.",
        )}
        resourceInformationTitle="Team Membership"
        resourceInformation={[
          markUiCopy({ label: "Team", value: teamToRemove?.team_alias || teamToRemove?.team_id }, { label: "Team" }),
          markUiCopy({ label: "User ID", value: userData?.user_id, code: true }, { label: "User ID" }),
          markUiCopy({ label: "Email", value: userData?.user_email }, { label: "Email" }),
        ]}
        onCancel={handleRemoveTeamCancel}
        onOk={handleRemoveTeamConfirm}
        confirmLoading={isRemovingTeam}
      />

      {/* Add to Team Modal */}
      <Dialog
        open={isAddTeamModalOpen}
        onOpenChange={(open) => !open && setIsAddTeamModalOpen(false)}
        disablePointerDismissal={isAddingTeam}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              <LocalizedText text={"Add User to Team"} />
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleAddTeamSubmit();
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={ADD_TEAM_FIELD_ID}>
                  <LocalizedText text={"Team"} />
                </FieldLabel>
                <Combobox
                  items={availableTeamsForAdd}
                  value={selectedTeamOption}
                  onValueChange={(team: TeamOption | null) => setSelectedTeamId(team?.team_id ?? "")}
                  itemToStringLabel={(team: TeamOption) => team.team_alias}
                  isItemEqualToValue={(team: TeamOption, value: TeamOption) => team.team_id === value.team_id}
                >
                  <ComboboxInput
                    id={ADD_TEAM_FIELD_ID}
                    placeholder={translateMessage("Select a team")}
                    className="w-full"
                  />
                  <ComboboxContent>
                    <ComboboxEmpty>
                      <LocalizedText text={"No teams found"} />
                    </ComboboxEmpty>
                    <ComboboxList>
                      {(team: TeamOption) => (
                        <ComboboxItem key={team.team_id} value={team} title={team.team_alias}>
                          {team.team_alias}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </Field>

              <Field>
                <FieldLabel htmlFor={ADD_TEAM_ROLE_FIELD_ID}>
                  <LocalizedText text={"Member Role"} />
                </FieldLabel>
                <Select value={selectedRole} onValueChange={(value) => value !== null && setSelectedRole(value)}>
                  <SelectTrigger id={ADD_TEAM_ROLE_FIELD_ID} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_ROLE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} title={option.value}>
                        <SimpleTooltip content={option.hint}>
                          <span className="font-medium">{option.value}</span>
                          <span className="ml-2 text-muted-foreground text-sm">- {option.hint}</span>
                        </SimpleTooltip>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <div className="text-right mt-4">
              <Button type="submit" disabled={isAddingTeam || !selectedTeamId} aria-busy={isAddingTeam}>
                {isAddingTeam ? translateMessage("Adding...") : translateMessage("Add to Team")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
