"use client";
import { LocalizedText, getIntlLocale, translateMessage, useUiLocale } from "@/lib/i18n";
import type { UserInfoV2Response } from "@/components/networking";
import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { formatNumberWithCommas } from "@/utils/dataUtils";
import { getBudgetDurationLabel } from "@/components/common_components/budget_duration_dropdown";
import MCPServerPermissions from "@/components/permissions/MCPServerPermissions";
import { Card } from "@/components/ui/card";

export function UserSpendCard({ spend, maxBudget }: { spend: number; maxBudget: number | null }) {
  useUiLocale();
  return (
    <Card className="block p-6">
      <p>
        <LocalizedText text="Spend" />
      </p>
      <div className="mt-2">
        <h3 className="text-lg font-medium">${formatNumberWithCommas(spend || 0, 2)}</h3>
        <p>
          <LocalizedText text="of " />
          {maxBudget !== null ? `$${formatNumberWithCommas(maxBudget, 2)}` : translateMessage("Unlimited")}
        </p>
      </div>
    </Card>
  );
}
export default function UserInformationFields({
  userData,
  accessToken,
  canReadAccount,
  userIdCopied,
  onCopyUserId,
}: {
  userData: UserInfoV2Response;
  accessToken: string | null;
  canReadAccount: boolean;
  userIdCopied: boolean;
  onCopyUserId: () => void;
}) {
  useUiLocale();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="font-medium">
          <LocalizedText text={"User ID"} />
        </p>
        <div className="flex items-center cursor-pointer">
          <span className="break-all font-mono text-xs">{userData.user_id}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onCopyUserId}
            className={`left-2 z-raised transition-all duration-200 ${
              userIdCopied
                ? "text-success bg-success/10 border-success/20"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {userIdCopied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          </Button>
        </div>
      </div>

      <div>
        <p className="font-medium">
          <LocalizedText text={"Email"} />
        </p>
        <p>{userData.user_email || translateMessage("Not Set")}</p>
      </div>

      <div>
        <p className="font-medium">
          <LocalizedText text={"User Alias"} />
        </p>
        <p>{userData.user_alias || translateMessage("Not Set")}</p>
      </div>

      <div>
        <p className="font-medium">
          <LocalizedText text={"Global Proxy Role"} />
        </p>
        <p>{userData.user_role || translateMessage("Not Set")}</p>
      </div>

      <div>
        <p className="font-medium">
          <LocalizedText text={"Created"} />
        </p>
        <p>
          {userData.created_at
            ? new Date(userData.created_at).toLocaleString(getIntlLocale())
            : translateMessage("Unknown")}
        </p>
      </div>

      <div>
        <p className="font-medium">
          <LocalizedText text={"Last Updated"} />
        </p>
        <p>
          {userData.updated_at
            ? new Date(userData.updated_at).toLocaleString(getIntlLocale())
            : translateMessage("Unknown")}
        </p>
      </div>

      {!canReadAccount && (
        <>
          <div>
            <p className="font-medium">
              <LocalizedText text={"Personal Models"} />
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              {userData.models?.length && userData.models?.length > 0 ? (
                userData.models?.map((model, index) => (
                  <span key={index} className="px-2 py-1 bg-info/15 rounded-sm text-xs">
                    {model}
                  </span>
                ))
              ) : (
                <p>
                  <LocalizedText text={"All proxy models"} />
                </p>
              )}
            </div>
          </div>
        </>
      )}
      <div>
        <p className="font-medium">
          <LocalizedText text={"Max Budget"} />
        </p>
        <p>
          {userData.max_budget !== null && userData.max_budget !== undefined
            ? `$${formatNumberWithCommas(userData.max_budget, 4)}`
            : translateMessage("Unlimited")}
        </p>
      </div>

      <div>
        <p className="font-medium">
          <LocalizedText text={"Budget Reset"} />
        </p>
        <p>{getBudgetDurationLabel(userData.budget_duration ?? null)}</p>
      </div>

      <div className="min-w-0 sm:col-span-2">
        <p className="font-medium">
          <LocalizedText text={"Metadata"} />
        </p>
        <pre className="bg-muted p-2 rounded-sm text-xs overflow-auto mt-1">
          {JSON.stringify(userData.metadata || {}, null, 2)}
        </pre>
      </div>

      <div className="min-w-0 sm:col-span-2">
        <p className="font-medium mb-2">
          <LocalizedText text={"MCP Permissions"} />
        </p>
        <MCPServerPermissions
          mcpServers={userData.object_permission?.mcp_servers || []}
          mcpAccessGroups={userData.object_permission?.mcp_access_groups || []}
          mcpToolPermissions={userData.object_permission?.mcp_tool_permissions || {}}
          mcpToolsets={userData.object_permission?.mcp_toolsets || []}
          accessToken={accessToken}
        />
      </div>
    </div>
  );
}

export function userEditSeed(userData: UserInfoV2Response) {
  return {
    user_id: userData.user_id,
    user_info: {
      user_email: userData.user_email,
      user_alias: userData.user_alias,
      user_role: userData.user_role,
      models: userData.models,
      max_budget: userData.max_budget,
      tpm_limit: userData.tpm_limit,
      rpm_limit: userData.rpm_limit,
      budget_duration: userData.budget_duration,
      metadata: userData.metadata,
      // Without these the per-model budget editor mounts empty and a save
      // replaces the user's existing budgets with whatever was typed.
      model_max_budget: userData.model_max_budget,
      model_max_budget_usage: userData.model_max_budget_usage,
    },
  };
}
