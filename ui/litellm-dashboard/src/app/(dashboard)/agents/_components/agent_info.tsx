"use client";
import { LocalizedText, getIntlLocale, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";
import { AgentIdentityFields } from "./AgentIdentityFields";
import { AgentIdentityDetails } from "./AgentIdentityDetails";
import { withAgentIdentity } from "./agent_identity";
import React, { useState, useEffect, useMemo } from "react";
import { cx } from "@/lib/cva.config";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UiLoadingSpinner } from "@/components/ui/ui-loading-spinner";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { toast } from "@/lib/toast";
import { ArrowLeft } from "lucide-react";
import { getAgentInfo, patchAgentCall, getAgentCreateMetadata, AgentCreateInfo } from "@/components/networking";
import { Agent } from "@/components/agents/types";
import { KeyResponse } from "@/components/key_team_helpers/key_list";
import { useKeys } from "@/app/(dashboard)/hooks/keys/useKeys";
import { useMCPServers } from "@/app/(dashboard)/hooks/mcpServers/useMCPServers";
import { useAccessGroups } from "@/app/(dashboard)/hooks/accessGroups/useAccessGroups";
import AccessGroupSelector from "@/components/common_components/AccessGroupSelector";
import KeyInfoView from "@/components/templates/key_info_view";
import MCPServerSelector from "@/components/mcp_server_management/MCPServerSelector";
import MCPToolPermissions from "@/components/mcp_server_management/MCPToolPermissions";
import AgentVirtualKeys from "./agent_virtual_keys";
import AgentKillSwitchDangerZone from "./AgentKillSwitchDangerZone";
import AgentFormFields, { unmountedA2AFieldNames } from "./agent_form_fields";
import DynamicAgentFormFields, { buildDynamicAgentData, unmountedDynamicFieldNames } from "./dynamic_agent_form_fields";
import {
  AGENT_FORM_CONFIG,
  buildAgentDataFromForm,
  buildMcpObjectPermission,
  parseAccessGroupIdsForForm,
  parseAgentForForm,
  parseMcpPermissionsForForm,
} from "./agent_config";
import {
  AgentFormField,
  AgentFormValues,
  AgentNumberInput,
  AgentRequestPayload,
  McpServerSelection,
  labelWithHint,
  omitFieldValues,
  useCollapsiblePanels,
} from "./AgentFormKit";
import AgentCostView from "./agent_cost_view";
import { detectAgentType, parseDynamicAgentForForm } from "./agent_type_utils";
import AgentCardDiscovery, { DiscoveredAgentCardSelection } from "./agent_card_discovery";
import { buildDiscoveryRequest, overlayDiscoveredCardParams } from "./agent_discovery_utils";

interface AgentInfoViewProps {
  agentId: string;
  onClose: () => void;
  accessToken: string | null;
  isAdmin: boolean;
}

const DetailList: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  useUiLocale();
  return (
    <dl
      className={cx(
        "grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] overflow-hidden rounded-lg border border-border text-sm",
        className,
      )}
    >
      {children}
    </dl>
  );
};

const DetailItem: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = (cocaCopyProps0) => {
  const { label, children } = cocaCopyProps0;
  useUiLocale();
  return (
    <>
      <dt className="border-b border-border bg-muted px-4 py-3 font-medium text-foreground last-of-type:border-b-0">
        {localizedProperty(cocaCopyProps0, "label", label)}
      </dt>
      <dd className="border-b border-border px-4 py-3 break-words text-foreground last-of-type:border-b-0">
        {children}
      </dd>
    </>
  );
};

const AgentInfoView: React.FC<AgentInfoViewProps> = ({ agentId, onClose, accessToken, isAdmin }) => {
  useUiLocale();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [selectedKey, setSelectedKey] = useState<KeyResponse | null>(null);
  const { data: keysData, isLoading: keysLoading, refetch: refetchAgentKeys } = useKeys(1, 100, { agentID: agentId });
  const agentKeys = keysData?.keys ?? [];
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [isSaving, setIsSaving] = useState(false);
  const form = useForm<AgentFormValues>({ defaultValues: {} });
  const panels = useCollapsiblePanels([AGENT_FORM_CONFIG.basic.key]);
  const [agentTypeMetadata, setAgentTypeMetadata] = useState<AgentCreateInfo[]>([]);
  const [detectedAgentType, setDetectedAgentType] = useState<string>("a2a");
  const [appliedDiscoveredSelection, setAppliedDiscoveredSelection] = useState<DiscoveredAgentCardSelection | null>(
    null,
  );

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const metadata = await getAgentCreateMetadata();
        setAgentTypeMetadata(metadata);
      } catch (error) {
        console.error("Error fetching agent metadata:", error);
      }
    };
    fetchMetadata();
  }, []);

  useEffect(() => {
    fetchAgentInfo();
  }, [agentId, accessToken]);

  const fetchAgentInfo = async () => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      const data = await getAgentInfo(accessToken, agentId);
      setAgent(data);

      // Detect agent type
      const agentType = detectAgentType(data);
      setDetectedAgentType(agentType);

      // Parse form values based on agent type
      if (agentType === "a2a") {
        form.reset(parseAgentForForm(data));
      } else {
        const typeInfo = agentTypeMetadata.find((t) => t.agent_type === agentType);
        if (typeInfo) {
          form.reset({
            ...parseDynamicAgentForForm(data, typeInfo),
            ...parseMcpPermissionsForForm(data),
            ...parseAccessGroupIdsForForm(data),
          });
        } else {
          form.reset(parseAgentForForm(data));
        }
      }
    } catch (error) {
      console.error("Error fetching agent info:", error);
      toast.error(translateMessage("Failed to load agent information"));
    } finally {
      setIsLoading(false);
    }
  };

  // Re-parse form when metadata is loaded
  useEffect(() => {
    if (agent && agentTypeMetadata.length > 0) {
      const agentType = detectAgentType(agent);
      if (agentType !== "a2a") {
        const typeInfo = agentTypeMetadata.find((t) => t.agent_type === agentType);
        if (typeInfo) {
          form.reset({
            ...parseDynamicAgentForForm(agent, typeInfo),
            ...parseMcpPermissionsForForm(agent),
            ...parseAccessGroupIdsForForm(agent),
          });
        }
      }
    }
  }, [agentTypeMetadata, agent]);

  const selectedAgentTypeInfo = agentTypeMetadata.find((t) => t.agent_type === detectedAgentType);
  const watchedFormValues = useWatch({ control: form.control });
  const mcpSelection = useWatch({ control: form.control, name: "allowed_mcp_servers_and_groups" });
  const mcpToolPermissions = useWatch({ control: form.control, name: "mcp_tool_permissions" });
  const { data: mcpServers = [] } = useMCPServers();
  const { data: accessGroups = [] } = useAccessGroups();

  const mcpServerLabel = (serverId: string) => {
    const server = mcpServers.find((s) => s.server_id === serverId);
    return server?.server_name ? `${server.server_name} (${serverId})` : serverId;
  };

  const accessGroupLabel = (accessGroupId: string) => {
    const group = accessGroups.find((g) => g.access_group_id === accessGroupId);
    return group ? `${group.access_group_name} (${accessGroupId})` : accessGroupId;
  };

  const discoveryRequest = useMemo(
    () => buildDiscoveryRequest(detectedAgentType, watchedFormValues || {}, selectedAgentTypeInfo),
    [watchedFormValues, selectedAgentTypeInfo, detectedAgentType],
  );

  const handleApplyDiscoveredCard = (selection: DiscoveredAgentCardSelection | null) => {
    setAppliedDiscoveredSelection(selection);
    if (!selection) return;
    const { selected_card } = selection;
    const skills = (selected_card.skills ?? []).map((s) => ({
      id: s.id ?? "",
      name: s.name ?? "",
      description: s.description ?? "",
      tags: s.tags ?? [],
      examples: s.examples ?? [],
    }));

    const urlCredentialKeys = (selectedAgentTypeInfo?.credential_fields ?? [])
      .map((f) => f.key)
      .filter((key) => /(^|_)(url|api_base|endpoint)$/i.test(key));

    const fieldsToSet: AgentFormValues = {
      name: selected_card.name ?? undefined,
      description: selected_card.description ?? undefined,
      url: selection.upstream_url,
      streaming: Boolean(selected_card.capabilities?.streaming),
      skills,
      iconUrl: selected_card.iconUrl ?? undefined,
      documentationUrl: selected_card.documentationUrl ?? undefined,
      ...Object.fromEntries(urlCredentialKeys.map((key) => [key, selection.upstream_url])),
    };

    for (const [key, value] of Object.entries(fieldsToSet)) {
      form.setValue(key, value);
    }
  };

  const usesDynamicFields = detectedAgentType !== "a2a" && selectedAgentTypeInfo !== undefined;

  const handleUpdate = async (submitted: AgentFormValues) => {
    if (!accessToken || !agent) return;

    setIsSaving(true);
    try {
      const values = omitFieldValues(
        submitted,
        usesDynamicFields
          ? unmountedDynamicFieldNames(panels.mountedPanels)
          : unmountedA2AFieldNames(panels.mountedPanels),
      );

      const built: AgentRequestPayload = usesDynamicFields
        ? { ...buildDynamicAgentData(values, selectedAgentTypeInfo, agent), agent_name: values.agent_name }
        : buildAgentDataFromForm(values, agent);

      const updateData = appliedDiscoveredSelection
        ? overlayDiscoveredCardParams(built, appliedDiscoveredSelection.selected_card)
        : built;
      const cardEdited =
        Boolean(appliedDiscoveredSelection) ||
        [AGENT_FORM_CONFIG.basic, AGENT_FORM_CONFIG.skills, AGENT_FORM_CONFIG.capabilities, AGENT_FORM_CONFIG.optional]
          .flatMap((section) => section.fields)
          .some((field) => form.getFieldState(field.name).isDirty);

      await patchAgentCall(accessToken, agentId, {
        ...withAgentIdentity(updateData, values, agent, cardEdited),
        object_permission: buildMcpObjectPermission(values),
        access_group_ids: values.access_group_ids ?? [],
      });
      toast.success(translateMessage("Agent updated successfully"));
      setIsEditing(false);
      fetchAgentInfo();
    } catch (error) {
      console.error("Error updating agent:", error);
      toast.error(translateMessage("Failed to update agent"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="flex justify-center items-center h-64">
          <UiLoadingSpinner className="size-8 text-primary" />
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-4">
        <div className="text-center">
          <LocalizedText text={"Agent not found"} />
        </div>
        <Button onClick={onClose} className="mt-4">
          <LocalizedText text={"Back to Agents List"} />
        </Button>
      </div>
    );
  }

  // Format date helper function
  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleString(getIntlLocale());
  };

  const rateLimitField = (name: keyof AgentFormValues & string, label: string) => (
    <AgentFormField name={name} label={label}>
      {({ value, onChange, ref, ...control }) => (
        <AgentNumberInput
          {...control}
          value={value}
          onChange={onChange}
          inputRef={ref}
          min={0}
          placeholder={translateMessage("Unlimited")}
        />
      )}
    </AgentFormField>
  );

  if (selectedKey) {
    return (
      <KeyInfoView
        keyId={selectedKey.token}
        keyData={selectedKey}
        onClose={() => setSelectedKey(null)}
        onDelete={() => {
          setSelectedKey(null);
          refetchAgentKeys();
        }}
        teams={null}
        backButtonText="Back to Agent"
      />
    );
  }

  return (
    <div className="p-4">
      <div>
        <Button variant="ghost" onClick={onClose} className="mb-4">
          <ArrowLeft className="size-4" />
          <LocalizedText text={"Back to Agents"} />
        </Button>
        <h1 className="text-2xl font-semibold">{agent.agent_name || translateMessage("Unnamed Agent")}</h1>
        <p className="text-sm text-muted-foreground font-mono">{agent.agent_id}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line" className="mb-4 h-auto w-full justify-start rounded-none border-b p-0">
          <TabsTrigger value="overview" className="flex-none rounded-none px-4 py-2">
            <LocalizedText text={"Overview"} />
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="settings" className="flex-none rounded-none px-4 py-2">
              <LocalizedText text={"Settings"} />
            </TabsTrigger>
          )}
        </TabsList>

        <div>
          {/* Overview Panel */}
          <TabsContent value="overview" keepMounted>
            <AgentIdentityDetails
              agentId={agentId}
              identity={agent.identity}
              accessToken={accessToken}
              isAdmin={isAdmin}
            />
            <DetailList>
              <DetailItem label={translateMessage("Agent ID")}>{agent.agent_id}</DetailItem>
              <DetailItem label={translateMessage("Agent Name")}>{agent.agent_name}</DetailItem>
              <DetailItem label={translateMessage("Display Name")}>{agent.agent_card_params?.name || "-"}</DetailItem>
              <DetailItem label={translateMessage("Description")}>
                {localizedProperty(agent.agent_card_params, "description") || "-"}
              </DetailItem>
              <DetailItem label={translateMessage("URL")}>{agent.agent_card_params?.url || "-"}</DetailItem>
              <DetailItem label={translateMessage("Version")}>{agent.agent_card_params?.version || "-"}</DetailItem>
              <DetailItem label={translateMessage("Protocol Version")}>
                {agent.agent_card_params?.protocolVersion || "-"}
              </DetailItem>
              <DetailItem label={translateMessage("Streaming")}>
                {agent.agent_card_params?.capabilities?.streaming ? translateMessage("Yes") : translateMessage("No")}
              </DetailItem>
              {agent.agent_card_params?.capabilities?.pushNotifications && (
                <DetailItem label={translateMessage("Push Notifications")}>
                  <LocalizedText text={"Yes"} />
                </DetailItem>
              )}
              {agent.agent_card_params?.capabilities?.stateTransitionHistory && (
                <DetailItem label={translateMessage("State Transition History")}>
                  <LocalizedText text={"Yes"} />
                </DetailItem>
              )}
              <DetailItem label={translateMessage("Skills")}>
                {agent.agent_card_params?.skills?.length || 0}
                <LocalizedText text={" configured"} />
              </DetailItem>
              {agent.litellm_params?.model && (
                <DetailItem label={translateMessage("Model")}>{agent.litellm_params.model}</DetailItem>
              )}
              {agent.litellm_params?.make_public !== undefined && (
                <DetailItem label={translateMessage("Make Public")}>
                  {agent.litellm_params.make_public ? translateMessage("Yes") : translateMessage("No")}
                </DetailItem>
              )}
              {agent.agent_card_params?.iconUrl && (
                <DetailItem label={translateMessage("Icon URL")}>{agent.agent_card_params.iconUrl}</DetailItem>
              )}
              {agent.agent_card_params?.documentationUrl && (
                <DetailItem label={translateMessage("Documentation URL")}>
                  {agent.agent_card_params.documentationUrl}
                </DetailItem>
              )}
              <DetailItem label={translateMessage("TPM Limit")}>
                {agent.tpm_limit ?? translateMessage("Unlimited")}
              </DetailItem>
              <DetailItem label={translateMessage("RPM Limit")}>
                {agent.rpm_limit ?? translateMessage("Unlimited")}
              </DetailItem>
              <DetailItem label={translateMessage("Session TPM Limit")}>
                {agent.session_tpm_limit ?? translateMessage("Unlimited")}
              </DetailItem>
              <DetailItem label={translateMessage("Session RPM Limit")}>
                {agent.session_rpm_limit ?? translateMessage("Unlimited")}
              </DetailItem>
              <DetailItem label={translateMessage("Access Groups")}>
                {agent.access_group_ids?.length ? (
                  <div className="space-y-1">
                    {agent.access_group_ids.map((accessGroupId) => (
                      <div key={accessGroupId}>{accessGroupLabel(accessGroupId)}</div>
                    ))}
                  </div>
                ) : (
                  translateMessage("None")
                )}
              </DetailItem>
              <DetailItem label={translateMessage("Created At")}>{formatDate(agent.created_at)}</DetailItem>
              <DetailItem label={translateMessage("Updated At")}>{formatDate(agent.updated_at)}</DetailItem>
            </DetailList>

            <AgentVirtualKeys keys={agentKeys} isLoading={keysLoading} onKeyClick={setSelectedKey} />

            {agent.object_permission &&
              (agent.object_permission.mcp_servers?.length ||
                agent.object_permission.mcp_access_groups?.length ||
                agent.object_permission.mcp_toolsets?.length ||
                (agent.object_permission.mcp_tool_permissions &&
                  Object.keys(agent.object_permission.mcp_tool_permissions).length > 0)) && (
                <div style={{ marginTop: 24 }}>
                  <h3 className="text-lg font-medium">
                    <LocalizedText text={"MCP Tool Permissions"} />
                  </h3>
                  <DetailList className="mt-4">
                    {agent.object_permission.mcp_servers && agent.object_permission.mcp_servers.length > 0 && (
                      <DetailItem label={translateMessage("MCP Servers")}>
                        <div className="space-y-1">
                          {agent.object_permission.mcp_servers.map((serverId) => (
                            <div key={serverId}>{mcpServerLabel(serverId)}</div>
                          ))}
                        </div>
                      </DetailItem>
                    )}
                    {agent.object_permission.mcp_access_groups &&
                      agent.object_permission.mcp_access_groups.length > 0 && (
                        <DetailItem label={translateMessage("MCP Access Groups")}>
                          {agent.object_permission.mcp_access_groups.join(", ")}
                        </DetailItem>
                      )}
                    {agent.object_permission.mcp_toolsets && agent.object_permission.mcp_toolsets.length > 0 && (
                      <DetailItem label={translateMessage("MCP Toolsets")}>
                        {agent.object_permission.mcp_toolsets.join(", ")}
                      </DetailItem>
                    )}
                    {agent.object_permission.mcp_tool_permissions &&
                      Object.keys(agent.object_permission.mcp_tool_permissions).length > 0 && (
                        <DetailItem label={translateMessage("Tool permissions per server")}>
                          <div className="space-y-1">
                            {Object.entries(agent.object_permission.mcp_tool_permissions).map(([serverId, tools]) => (
                              <div key={serverId}>
                                <span className="font-medium">{mcpServerLabel(serverId)}:</span>{" "}
                                {Array.isArray(tools) ? tools.join(", ") : String(tools)}
                              </div>
                            ))}
                          </div>
                        </DetailItem>
                      )}
                  </DetailList>
                </div>
              )}

            <AgentCostView agent={agent} />

            {agent.agent_card_params?.skills && agent.agent_card_params.skills.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 className="text-lg font-medium">
                  <LocalizedText text={"Skills"} />
                </h3>
                <DetailList className="mt-4">
                  {agent.agent_card_params.skills.map((skill, index) => (
                    <DetailItem label={skill.name || translateMessage("Skill %{0}", [index + 1])} key={index}>
                      <div>
                        <div>
                          <strong>
                            <LocalizedText text={"ID:"} />
                          </strong>{" "}
                          {skill.id}
                        </div>
                        <div>
                          <strong>
                            <LocalizedText text={"Description:"} />
                          </strong>{" "}
                          {localizedProperty(skill, "description", skill.description)}
                        </div>
                        <div>
                          <strong>
                            <LocalizedText text={"Tags:"} />
                          </strong>{" "}
                          {Array.isArray(skill.tags) ? skill.tags.join(", ") : skill.tags}
                        </div>
                        {skill.examples && skill.examples.length > 0 && (
                          <div>
                            <strong>
                              <LocalizedText text={"Examples:"} />
                            </strong>{" "}
                            {Array.isArray(skill.examples) ? skill.examples.join(", ") : skill.examples}
                          </div>
                        )}
                      </div>
                    </DetailItem>
                  ))}
                </DetailList>
              </div>
            )}

            <AgentKillSwitchDangerZone
              agentId={agent.agent_id}
              agentName={agent.agent_name}
              killSwitch={agent.kill_switch}
              accessToken={accessToken}
              isAdmin={isAdmin}
            />
          </TabsContent>

          {/* Settings Panel (only for admins) */}
          {isAdmin && (
            <TabsContent value="settings" keepMounted>
              <Card className="block p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">
                    <LocalizedText text={"Agent Settings"} />
                  </h3>
                  {!isEditing && (
                    <Button
                      onClick={() => {
                        setAppliedDiscoveredSelection(null);
                        setIsEditing(true);
                      }}
                    >
                      <LocalizedText text={"Edit Settings"} />
                    </Button>
                  )}
                </div>

                {isEditing ? (
                  <TooltipProvider>
                    <FormProvider {...form}>
                      <form onSubmit={form.handleSubmit(handleUpdate)}>
                        <FieldGroup className="mb-4">
                          <Field>
                            <FieldLabel htmlFor="agent-id">
                              <LocalizedText text={"Agent ID"} />
                            </FieldLabel>
                            <Input id="agent-id" value={agent.agent_id} disabled readOnly />
                          </Field>
                        </FieldGroup>

                        {usesDynamicFields && selectedAgentTypeInfo ? (
                          <DynamicAgentFormFields agentTypeInfo={selectedAgentTypeInfo} panels={panels} />
                        ) : (
                          <AgentFormFields showAgentName={true} panels={panels} />
                        )}

                        <AgentIdentityFields accessToken={accessToken} />

                        {discoveryRequest && (
                          <div className="mt-4">
                            <AgentCardDiscovery
                              accessToken={accessToken}
                              onApply={handleApplyDiscoveredCard}
                              discoveryRequest={discoveryRequest}
                              savedAgentCard={agent.agent_card_params ?? null}
                            />
                          </div>
                        )}

                        <Separator className="my-6" />
                        <h3 className="text-lg font-medium mb-4">
                          <LocalizedText text={"Rate Limits"} />
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          {rateLimitField("tpm_limit", "TPM Limit")}
                          {rateLimitField("rpm_limit", "RPM Limit")}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                          {rateLimitField("session_tpm_limit", "Session TPM Limit")}
                          {rateLimitField("session_rpm_limit", "Session RPM Limit")}
                        </div>

                        <Separator className="my-6" />
                        <h3 className="text-lg font-medium mb-4">
                          <LocalizedText text={"Access Groups"} />
                        </h3>
                        <FieldGroup>
                          <AgentFormField
                            name="access_group_ids"
                            label={labelWithHint(
                              "Access Groups",
                              "Attached groups cap which models, MCP servers, and agents this agent can reach, on top of its key and team permissions. Leave empty to apply no extra cap.",
                            )}
                          >
                            {({ value, onChange }) => (
                              <AccessGroupSelector
                                value={Array.isArray(value) ? (value as string[]) : []}
                                onChange={onChange}
                                placeholder={translateMessage("Select access groups (optional)")}
                              />
                            )}
                          </AgentFormField>
                        </FieldGroup>

                        <Separator className="my-6" />
                        <h3 className="text-lg font-medium mb-4">
                          <LocalizedText text={"MCP Servers"} />
                        </h3>
                        <FieldGroup>
                          <AgentFormField
                            name="allowed_mcp_servers_and_groups"
                            label={labelWithHint(
                              "Allowed MCP Servers",
                              "Select which MCP servers or access groups this agent can access. Keys bound to this agent can only reach servers granted here.",
                            )}
                          >
                            {({ value, onChange }) => (
                              <MCPServerSelector
                                onChange={onChange}
                                value={{
                                  servers: (value as McpServerSelection | undefined)?.servers ?? [],
                                  accessGroups: (value as McpServerSelection | undefined)?.accessGroups ?? [],
                                  toolsets: (value as McpServerSelection | undefined)?.toolsets ?? [],
                                }}
                                accessToken={accessToken ?? ""}
                                placeholder={translateMessage("Select MCP servers or access groups (optional)")}
                              />
                            )}
                          </AgentFormField>
                        </FieldGroup>
                        <div className="mt-4">
                          <MCPToolPermissions
                            accessToken={accessToken ?? ""}
                            selectedServers={mcpSelection?.servers ?? []}
                            toolPermissions={mcpToolPermissions ?? {}}
                            onChange={(toolPerms: Record<string, string[]>) =>
                              form.setValue("mcp_tool_permissions", toolPerms)
                            }
                          />
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setAppliedDiscoveredSelection(null);
                              setIsEditing(false);
                              fetchAgentInfo();
                            }}
                          >
                            <LocalizedText text={"Cancel"} />
                          </Button>
                          <Button type="submit" disabled={isSaving} aria-busy={isSaving}>
                            {isSaving && <UiLoadingSpinner className="size-4" />}
                            <LocalizedText text={"Save Changes"} />
                          </Button>
                        </div>
                      </form>
                    </FormProvider>
                  </TooltipProvider>
                ) : (
                  <p>
                    <LocalizedText text={'Click "Edit Settings" to modify agent configuration.'} />
                  </p>
                )}
              </Card>
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
};

export default AgentInfoView;
