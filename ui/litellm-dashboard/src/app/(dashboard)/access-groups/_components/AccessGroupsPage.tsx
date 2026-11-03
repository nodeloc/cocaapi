"use client";
import { LocalizedText, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";
import { Page, PageContent } from "@/components/shared/Page";
import { AccessGroupResponse, useAccessGroups } from "@/app/(dashboard)/hooks/accessGroups/useAccessGroups";
import { useDeleteAccessGroup } from "@/app/(dashboard)/hooks/accessGroups/useDeleteAccessGroup";
import { Boxes, Plus, SearchIcon, X } from "lucide-react";
import { useMemo, useState } from "react";
import DeleteResourceModal from "@/components/common_components/DeleteResourceModal";
import { PageHeader, PageHeaderControls, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { AccessGroupDetail } from "./AccessGroupsDetailsPage";
import { AccessGroupCreateDialog } from "./access-group-create/AccessGroupCreateDialog";
import { AccessGroupsTable } from "./AccessGroupsTable";
import { AccessGroup } from "./types";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { isProxyAdminRole } from "@/utils/roles";

function mapResponseToAccessGroup(r: AccessGroupResponse): AccessGroup {
  return {
    id: r.access_group_id,
    name: r.access_group_name,
    description: r.description ?? "",
    modelIds: r.access_model_names,
    mcpServerIds: r.access_mcp_server_ids,
    agentIds: r.access_agent_ids,
    keyIds: r.assigned_key_ids,
    teamIds: r.assigned_team_ids,
    createdAt: r.created_at,
    createdBy: r.created_by ?? "",
    updatedAt: r.updated_at,
    updatedBy: r.updated_by ?? "",
  };
}

export function AccessGroupsPage({ embedded = false }: { embedded?: boolean }) {
  useUiLocale();
  const { userRole } = useAuthorized();
  // Admin Viewer follows the read-parity rule: see access groups, no writes.
  const canModify = isProxyAdminRole(userRole ?? "");
  const { data: groupsData, isLoading } = useAccessGroups();
  const groups = useMemo(() => (groupsData ?? []).map(mapResponseToAccessGroup), [groupsData]);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [groupToDelete, setGroupToDelete] = useState<AccessGroup | null>(null);
  const deleteMutation = useDeleteAccessGroup();

  const filteredGroups = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter(
      (group) =>
        group.name.toLowerCase().includes(query) ||
        group.id.toLowerCase().includes(query) ||
        group.description.toLowerCase().includes(query),
    );
  }, [groups, searchText]);

  if (selectedGroupId) {
    return <AccessGroupDetail accessGroupId={selectedGroupId} onBack={() => setSelectedGroupId(null)} />;
  }

  return (
    <Page className={embedded ? "p-0 sm:p-0" : undefined}>
      <PageHeader>
        <PageHeaderTitle>
          <Boxes />
          <LocalizedText text={embedded ? "Resource Permissions" : "Access Groups"} />
        </PageHeaderTitle>
        <PageHeaderDescription>
          <LocalizedText text={embedded ? "管理 Key 和团队的资源权限，不修改账户分组与计费倍率" : "Manage resource permissions for your organization"} />
        </PageHeaderDescription>
        {canModify && (
          <PageHeaderControls>
            <Button onClick={() => setIsCreateModalVisible(true)}>
              <Plus className="size-4" />
              <LocalizedText text={"Create Access Group"} />
            </Button>
          </PageHeaderControls>
        )}
      </PageHeader>

      <PageContent className="gap-3">
        <div className="flex items-center">
          <InputGroup className="max-w-[400px]">
            <InputGroupAddon>
              <SearchIcon className="size-4 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder={translateMessage("Search groups by name, ID, or description...")}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            {searchText && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label={translateMessage("Clear search")}
                  onClick={() => setSearchText("")}
                >
                  <X />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </div>

        <AccessGroupsTable
          groups={filteredGroups}
          isLoading={isLoading}
          isFiltered={searchText.trim().length > 0}
          canModify={canModify}
          onGroupClick={setSelectedGroupId}
          onDeleteClick={setGroupToDelete}
        />
      </PageContent>

      <AccessGroupCreateDialog open={isCreateModalVisible} onOpenChange={setIsCreateModalVisible} />

      <DeleteResourceModal
        isOpen={!!groupToDelete}
        title={translateMessage("Delete Access Group")}
        message={translateMessage("Are you sure you want to delete this access group? This action cannot be undone.")}
        resourceInformationTitle="Access Group Information"
        resourceInformation={[
          markUiCopy({ label: "ID", value: groupToDelete?.id, code: true }, { label: "ID" }),
          markUiCopy({ label: "Name", value: groupToDelete?.name }, { label: "Name" }),
          markUiCopy({ label: "Description", value: groupToDelete?.description || "—" }, { label: "Description" }),
        ]}
        onCancel={() => setGroupToDelete(null)}
        onOk={() => {
          if (!groupToDelete) return;
          deleteMutation.mutate(groupToDelete.id, {
            onSuccess: () => {
              setGroupToDelete(null);
            },
          });
        }}
        confirmLoading={deleteMutation.isPending}
      />
    </Page>
  );
}
