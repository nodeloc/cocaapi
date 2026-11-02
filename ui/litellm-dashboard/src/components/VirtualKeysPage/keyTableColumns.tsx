"use client";
import { LocalizedText, getIntlLocale, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { Info } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import { DataTableMultiSortHeader, DataTableSortHeader, type DataTableSortField } from "@/components/shared/DataTable";
import { inheritedBudgetGates, keyOwnerBudgetSource } from "@/components/shared/InheritedBudgetHint";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DateCell,
  ENTITY_CELL_TITLE_CLASSES,
  IdCell,
  IdentityCell,
  ModelsCell,
  MoneyCell,
  SpendBudgetCell,
  StatusBadge,
  UserPopoverCell,
  type StatusTone,
} from "@/components/shared/table_cells";
import { orgDetailHref, teamDetailHref } from "@/utils/entityLinks";

import { KeyResponse, Team } from "../key_team_helpers/key_list";
import { Organization } from "../networking";

interface KeyStatus {
  tone: StatusTone;
  label: string;
  tooltip?: string;
}

const SPEND_BUDGET_SORT_FIELDS: DataTableSortField[] = [
  markUiCopy({ id: "spend", label: "Spend" }, { label: "Spend" }),
  markUiCopy({ id: "max_budget", label: "Budget" }, { label: "Budget" }),
];

export const KEY_TABLE_SORT_FIELDS: readonly string[] = [
  "key_alias",
  "token",
  "created_at",
  "updated_at",
  ...SPEND_BUDGET_SORT_FIELDS.map((field) => field.id),
];

const getKeyStatus = (key: KeyResponse): KeyStatus => {
  if (key.deleted_at) {
    return markUiCopy(
      {
        tone: "neutral",
        label: "Deleted",
        tooltip: `Deleted ${new Date(key.deleted_at).toLocaleString(getIntlLocale())}${key.deleted_by ? ` by ${key.deleted_by}` : ""}. Kept for audit and spend history; requests using this key are rejected.`,
      },
      { label: "Deleted" },
    );
  }
  if (key.blocked === true) {
    const isScimBlocked = (key.metadata as Record<string, unknown> | null | undefined)?.scim_blocked === true;
    return markUiCopy(
      {
        tone: "error",
        label: "Blocked",
        tooltip: isScimBlocked
          ? "Blocked by SCIM (external identity provider deactivated or deleted the owning user)."
          : "Blocked. Requests using this key will be rejected with 401.",
      },
      {
        label: "Blocked",
        tooltip: [
          "Blocked by SCIM (external identity provider deactivated or deleted the owning user).",
          "Blocked. Requests using this key will be rejected with 401.",
        ],
      },
    );
  }
  const expiresAt = key.expires ? Date.parse(key.expires) : Number.NaN;
  if (!Number.isNaN(expiresAt) && expiresAt < Date.now()) {
    return markUiCopy(
      { tone: "warning", label: "Expired", tooltip: "This key has passed its expiry date." },
      { label: "Expired", tooltip: "This key has passed its expiry date." },
    );
  }
  return markUiCopy(
    {
      tone: "success",
      label: "Active",
      tooltip: "This key is not blocked and has not expired.",
    },
    { label: "Active", tooltip: "This key is not blocked and has not expired." },
  );
};

const InfoHeader = (cocaCopyProps0: { label: string; tooltip: string }) => {
  const { label, tooltip } = cocaCopyProps0;
  useUiLocale();
  return (
    <span className="flex items-center gap-1">
      {localizedProperty(cocaCopyProps0, "label", label)}
      <HoverCard>
        <HoverCardTrigger render={<Info className="size-3 text-muted-foreground cursor-help" />} />
        <HoverCardContent className="w-auto">{localizedProperty(cocaCopyProps0, "tooltip", tooltip)}</HoverCardContent>
      </HoverCard>
    </span>
  );
};

interface KeyTableColumnsDeps {
  allTeams: Team[];
  organizations: Organization[];
  onSelectKey: (key: KeyResponse) => void;
  applyUserBudgetToTeamKeys: boolean;
}

export const getKeyTableColumns = ({
  allTeams,
  organizations,
  onSelectKey,
  applyUserBudgetToTeamKeys,
}: KeyTableColumnsDeps): ColumnDef<KeyResponse>[] => [
  {
    id: "key_alias",
    accessorKey: "key_alias",
    meta: markUiCopy(
      {
        title: "Key",
        renderSkeleton: () => (
          <div className="flex flex-col gap-1 py-1">
            <Skeleton className="h-4 w-32" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ),
      },
      { title: "Key" },
    ),
    header: ({ column }) => (
      <DataTableSortHeader column={column} title={translateMessage("Key")} variant="header-cycle" />
    ),
    size: 260,
    enableSorting: true,
    cell: ({ row }) => {
      const status = getKeyStatus(row.original);
      return (
        <IdentityCell
          title={row.original.key_alias || "-"}
          subtitle={row.original.key_name}
          badge={
            <StatusBadge
              tone={status.tone}
              label={localizedProperty(status, "label", status.label)}
              tooltip={localizedProperty(status, "tooltip", status.tooltip)}
              dataTestId={`key-status-${row.original.token_id}`}
            />
          }
          onClick={() => onSelectKey(row.original)}
        />
      );
    },
  },
  {
    id: "token",
    accessorKey: "token",
    meta: markUiCopy({ title: "Key ID" }, { title: "Key ID" }),
    header: ({ column }) => (
      <DataTableSortHeader column={column} title={translateMessage("Key ID")} variant="header-cycle" />
    ),
    size: 120,
    enableSorting: true,
    cell: (info) => <IdCell value={info.getValue() as string | null} onClick={() => onSelectKey(info.row.original)} />,
  },
  markUiCopy(
    {
      id: "team_alias",
      accessorKey: "team_id",
      meta: markUiCopy({ title: "Team" }, { title: "Team" }),
      header: "Team",
      size: 120,
      enableSorting: false,
      cell: (info) => {
        const teamId = info.getValue() as string | null;
        if (!teamId) return "-";
        const team = allTeams.find((t) => t.team_id === teamId);
        return (
          <IdentityCell
            title={team?.team_alias || teamId}
            titleClassName={ENTITY_CELL_TITLE_CLASSES}
            href={teamDetailHref(teamId)}
          />
        );
      },
    },
    { header: "Team" },
  ),
  markUiCopy(
    {
      id: "organization_alias",
      accessorKey: "org_id",
      meta: markUiCopy({ title: "Organization" }, { title: "Organization" }),
      header: "Organization",
      size: 140,
      enableSorting: false,
      cell: (info) => {
        const orgId = info.getValue() as string | null;
        if (!orgId) return "-";
        const org = organizations.find((o) => o.organization_id === orgId);
        return (
          <IdentityCell
            title={org?.organization_alias || orgId}
            titleClassName={ENTITY_CELL_TITLE_CLASSES}
            href={orgDetailHref(orgId)}
          />
        );
      },
    },
    { header: "Organization" },
  ),
  {
    id: "user",
    accessorKey: "user",
    meta: markUiCopy({ title: "User" }, { title: "User" }),
    header: () => (
      <InfoHeader
        label={translateMessage("User")}
        tooltip={translateMessage("Displays the first available value: User Alias, User Email, or User ID.")}
      />
    ),
    size: 160,
    enableSorting: false,
    cell: ({ row }) => {
      const key = row.original;
      return (
        <UserPopoverCell
          userAlias={key.user?.user_alias ?? null}
          userEmail={key.user?.user_email ?? key.user_email ?? null}
          userId={key.user_id ?? null}
          width={160}
        />
      );
    },
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    meta: markUiCopy({ title: "Created At" }, { title: "Created At" }),
    header: ({ column }) => (
      <DataTableSortHeader column={column} title={translateMessage("Created At")} variant="header-cycle" />
    ),
    size: 120,
    enableSorting: true,
    cell: (info) => <DateCell value={info.getValue() as string | null} precision="date" />,
  },
  markUiCopy(
    {
      id: "created_by",
      accessorKey: "created_by",
      meta: markUiCopy({ title: "Created By" }, { title: "Created By" }),
      header: "Created By",
      size: 160,
      enableSorting: false,
      cell: (info) => {
        const userId = info.getValue() as string | null;
        if (!userId) return "-";
        const createdByUser = info.row.original.created_by_user;
        return (
          <UserPopoverCell
            userAlias={createdByUser?.user_alias ?? null}
            userEmail={createdByUser?.user_email ?? null}
            userId={userId}
            width={160}
          />
        );
      },
    },
    { header: "Created By" },
  ),
  {
    id: "updated_at",
    accessorKey: "updated_at",
    meta: markUiCopy({ title: "Updated At" }, { title: "Updated At" }),
    header: ({ column }) => (
      <DataTableSortHeader column={column} title={translateMessage("Updated At")} variant="header-cycle" />
    ),
    size: 120,
    enableSorting: true,
    cell: (info) => <DateCell value={info.getValue() as string | null} precision="date" fallback="Never" />,
  },
  {
    id: "last_active",
    accessorKey: "last_active",
    meta: markUiCopy({ title: "Last Active" }, { title: "Last Active" }),
    header: () => (
      <InfoHeader
        label={translateMessage("Last Active")}
        tooltip={translateMessage(
          "This is a new field and is not backfilled. Only new key usage will update this value.",
        )}
      />
    ),
    size: 130,
    enableSorting: false,
    cell: (info) => <DateCell value={info.getValue() as string | null} precision="date" fallback="Unknown" />,
  },
  markUiCopy(
    {
      id: "expires",
      accessorKey: "expires",
      meta: markUiCopy({ title: "Expires" }, { title: "Expires" }),
      header: "Expires",
      size: 120,
      enableSorting: false,
      cell: (info) => <DateCell value={info.getValue() as string | null} precision="date" fallback="Never" />,
    },
    { header: "Expires" },
  ),
  {
    id: "spend",
    accessorKey: "spend",
    meta: markUiCopy(
      { title: "Spend / Budget", skeleton: "meter" as const, numeric: true },
      { title: "Spend / Budget" },
    ),
    header: ({ table }) => <DataTableMultiSortHeader table={table} fields={SPEND_BUDGET_SORT_FIELDS} />,
    size: 180,
    enableSorting: true,
    cell: ({ row }) => {
      const team = allTeams.find((t) => t.team_id === row.original.team_id);
      const orgId = row.original.organization_id || row.original.org_id || team?.organization_id;
      const organization = organizations.find((o) => o.organization_id === orgId);
      return (
        <SpendBudgetCell
          spend={row.original.spend}
          maxBudget={row.original.max_budget}
          inheritedGates={
            row.original.max_budget == null
              ? inheritedBudgetGates(team, organization, keyOwnerBudgetSource(row.original, applyUserBudgetToTeamKeys))
              : []
          }
        />
      );
    },
  },
  {
    id: "total_spend",
    accessorKey: "total_spend",
    meta: markUiCopy({ title: "Lifetime Spend" }, { title: "Lifetime Spend" }),
    header: () => (
      <InfoHeader
        label={translateMessage("Lifetime Spend")}
        tooltip={translateMessage(
          "Cumulative spend across every budget period. Budget resets do not touch this value. Lifetime tracking started with LiteLLM v1.103.0 on September 19, 2026, so keys created earlier only count spend since that upgrade.",
        )}
      />
    ),
    size: 130,
    enableSorting: false,
    cell: (info) => <MoneyCell value={info.getValue() as number | null | undefined} showZero />,
  },
  markUiCopy(
    {
      id: "budget_reset_at",
      accessorKey: "budget_reset_at",
      meta: markUiCopy({ title: "Budget Reset" }, { title: "Budget Reset" }),
      header: "Budget Reset",
      size: 130,
      enableSorting: false,
      cell: (info) => <DateCell value={info.getValue() as string | null} fallback="Never" />,
    },
    { header: "Budget Reset" },
  ),
  markUiCopy(
    {
      id: "models",
      accessorKey: "models",
      meta: markUiCopy({ title: "Models", skeleton: "chips" as const }, { title: "Models" }),
      header: "Models",
      size: 220,
      enableSorting: false,
      cell: (info) => (
        <ModelsCell
          models={info.getValue() as string[] | null | undefined}
          allowedRoutes={info.row.original.allowed_routes}
          keyType={info.row.original.key_type}
        />
      ),
    },
    { header: "Models" },
  ),
  markUiCopy(
    {
      id: "rate_limits",
      meta: markUiCopy({ title: "Rate Limits" }, { title: "Rate Limits" }),
      header: "Rate Limits",
      size: 140,
      enableSorting: false,
      cell: ({ row }) => {
        const key = row.original;
        return (
          <div className="text-xs">
            <div>
              <LocalizedText text={"TPM: "} />
              {key.tpm_limit !== null ? key.tpm_limit : translateMessage("Unlimited")}
            </div>
            <div>
              <LocalizedText text={"RPM: "} />
              {key.rpm_limit !== null ? key.rpm_limit : translateMessage("Unlimited")}
            </div>
          </div>
        );
      },
    },
    { header: "Rate Limits" },
  ),
];

export const KEY_TABLE_HIDDEN_COLUMNS: Record<string, boolean> = {
  token: false,
  organization_alias: false,
  created_by: false,
  updated_at: false,
  expires: false,
  rate_limits: false,
};
