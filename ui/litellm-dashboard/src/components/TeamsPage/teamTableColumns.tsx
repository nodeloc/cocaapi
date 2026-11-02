"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";
import { Copy, KeyRound, Layers, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";

import { DataTableSortHeader } from "@/components/shared/DataTable";
import { DateCell, IdentityCell, SpendBudgetCell } from "@/components/shared/table_cells";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cva.config";
import { orgDetailHref } from "@/utils/entityLinks";
import { copyToClipboard, formatNumberWithCommas } from "@/utils/dataUtils";

import { Team } from "../key_team_helpers/key_list";
import { Organization } from "../networking";

interface ResourceTone {
  icon: typeof Users;
  className: string;
}

const RESOURCE_TONES: Record<"members" | "models" | "keys", ResourceTone> = {
  members: {
    icon: Users,
    className:
      "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-400/30",
  },
  models: { icon: Layers, className: "bg-info/10 text-info ring-sky-600/20" },
  keys: { icon: KeyRound, className: "bg-success/10 text-success ring-emerald-600/20" },
};

const teamMemberCount = (team: Team): number => team.members_count ?? team.members_with_roles?.length ?? 0;
const teamModelCount = (team: Team): number => team.models?.length ?? 0;
const teamKeyCount = (team: Team): number => team.keys_count ?? team.keys?.length ?? 0;

function ResourcesCell({ team }: { team: Team }) {
  useUiLocale();
  const items = [
    markUiCopy({ key: "members" as const, label: "members", count: teamMemberCount(team) }, { label: "members" }),
    markUiCopy({ key: "models" as const, label: "models", count: teamModelCount(team) }, { label: "models" }),
    markUiCopy({ key: "keys" as const, label: "keys", count: teamKeyCount(team) }, { label: "keys" }),
  ];

  return (
    <div className="flex items-center gap-1.5">
      {items.map((item) => {
        const tone = RESOURCE_TONES[item.key];
        const Icon = tone.icon;
        return (
          <span
            key={item.key}
            title={`${item.count} ${localizedProperty(item, "label", item.label)}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset [&_svg]:size-3.5",
              tone.className,
            )}
          >
            <Icon />
            <span className="tabular-nums">{item.count}</span>
          </span>
        );
      })}
    </div>
  );
}

function RateLimitLine(cocaCopyProps0: { label: string; value: number | null }) {
  const { label, value } = cocaCopyProps0;
  useUiLocale();
  return (
    <div>
      <span className="text-[10px] font-semibold text-muted-foreground">
        {localizedProperty(cocaCopyProps0, "label", label)}{" "}
      </span>
      <span className="tabular-nums">
        {value != null ? formatNumberWithCommas(value) : translateMessage("Unlimited")}
      </span>
    </div>
  );
}

interface TeamRowActionsProps {
  team: Team;
  canManage: boolean;
  onEditTeam: (team: Team) => void;
  onDeleteTeam: (team: Team) => void;
}

function TeamRowActions({ team, canManage, onEditTeam, onDeleteTeam }: TeamRowActionsProps) {
  useUiLocale();
  const handleCopy = () => {
    void copyToClipboard(team.team_id, "Team ID copied");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={translateMessage("Open team actions")}
        data-testid={`team-actions-${team.team_id}`}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {canManage && (
          <DropdownMenuItem onClick={() => onEditTeam(team)} data-testid="team-action-edit">
            <Pencil />
            <LocalizedText text={"Edit team"} />
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleCopy} data-testid="team-action-copy">
          <Copy />
          <LocalizedText text={"Copy team ID"} />
        </DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDeleteTeam(team)} data-testid="team-action-delete">
              <Trash2 />
              <LocalizedText text={"Delete team"} />
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TeamTableColumnsDeps {
  organizations: Organization[];
  userRole: string | null;
  onSelectTeam: (team: Team) => void;
  onEditTeam: (team: Team) => void;
  onDeleteTeam: (team: Team) => void;
}

export const getTeamTableColumns = ({
  organizations,
  userRole,
  onSelectTeam,
  onEditTeam,
  onDeleteTeam,
}: TeamTableColumnsDeps): ColumnDef<Team>[] => {
  const canManage = userRole === "Admin";

  return [
    {
      id: "team_alias",
      accessorKey: "team_alias",
      meta: markUiCopy(
        {
          title: "Team",
          renderSkeleton: () => (
            <div className="flex flex-col gap-2 py-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3.5 w-24 opacity-65" />
            </div>
          ),
        },
        { title: "Team" },
      ),
      header: ({ column }) => (
        <DataTableSortHeader column={column} title={translateMessage("Team")} variant="header-cycle" />
      ),
      size: 260,
      enableSorting: true,
      cell: ({ row }) => {
        const team = row.original;
        const hasAlias = Boolean(team.team_alias);
        return (
          <IdentityCell
            title={team.team_alias || team.team_id}
            subtitle={hasAlias ? team.team_id : undefined}
            onClick={() => onSelectTeam(team)}
          />
        );
      },
    },
    markUiCopy(
      {
        id: "organization_alias",
        accessorKey: "organization_id",
        meta: markUiCopy({ title: "Organization" }, { title: "Organization" }),
        header: "Organization",
        size: 160,
        enableSorting: false,
        cell: (info) => {
          const orgId = info.getValue() as string | null;
          if (!orgId) return <span className="text-muted-foreground">—</span>;
          const org = organizations.find((o) => o.organization_id === orgId);
          const displayValue = org?.organization_alias || orgId;
          const width = info.cell.column.getSize();
          return (
            <span className="block" style={{ maxWidth: width }} title={displayValue}>
              <IdentityCell title={displayValue} titleClassName="text-sm font-normal" href={orgDetailHref(orgId)} />
            </span>
          );
        },
      },
      { header: "Organization" },
    ),
    markUiCopy(
      {
        id: "resources",
        meta: markUiCopy(
          {
            title: "Resources",
            renderSkeleton: () => (
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-6 w-12 rounded-md" />
                <Skeleton className="h-6 w-12 rounded-md" />
                <Skeleton className="h-6 w-12 rounded-md opacity-65" />
              </div>
            ),
          },
          { title: "Resources" },
        ),
        header: "Resources",
        size: 210,
        enableSorting: false,
        cell: ({ row }) => <ResourcesCell team={row.original} />,
      },
      { header: "Resources" },
    ),
    markUiCopy(
      {
        id: "spend",
        accessorKey: "spend",
        meta: markUiCopy(
          { title: "Spend / Budget", skeleton: "meter" as const, numeric: true },
          { title: "Spend / Budget" },
        ),
        header: "Spend / Budget",
        size: 200,
        enableSorting: false,
        cell: ({ row }) => (
          <SpendBudgetCell
            spend={row.original.spend}
            maxBudget={row.original.max_budget}
            spendDecimals={2}
            budgetDecimals={2}
          />
        ),
      },
      { header: "Spend / Budget" },
    ),
    {
      id: "created_at",
      accessorKey: "created_at",
      meta: markUiCopy({ title: "Created" }, { title: "Created" }),
      header: ({ column }) => (
        <DataTableSortHeader column={column} title={translateMessage("Created")} variant="header-cycle" />
      ),
      size: 130,
      enableSorting: true,
      cell: (info) => <DateCell value={info.getValue() as string | null} precision="date" />,
    },
    markUiCopy(
      {
        id: "members",
        meta: markUiCopy({ title: "Members", numeric: true }, { title: "Members" }),
        header: "Members",
        size: 110,
        enableSorting: false,
        cell: ({ row }) => <span className="text-sm tabular-nums">{teamMemberCount(row.original)}</span>,
      },
      { header: "Members" },
    ),
    markUiCopy(
      {
        id: "models",
        meta: markUiCopy({ title: "Models", numeric: true }, { title: "Models" }),
        header: "Models",
        size: 100,
        enableSorting: false,
        cell: ({ row }) => <span className="text-sm tabular-nums">{teamModelCount(row.original)}</span>,
      },
      { header: "Models" },
    ),
    markUiCopy(
      {
        id: "rate_limits",
        meta: markUiCopy({ title: "Rate Limits", skeleton: "twoLine" as const }, { title: "Rate Limits" }),
        header: "Rate Limits",
        size: 140,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-xs leading-tight">
            <RateLimitLine label={translateMessage("TPM")} value={row.original.tpm_limit} />
            <RateLimitLine label={translateMessage("RPM")} value={row.original.rpm_limit} />
          </div>
        ),
      },
      { header: "Rate Limits" },
    ),
    markUiCopy(
      {
        id: "updated_at",
        accessorKey: "updated_at",
        meta: markUiCopy({ title: "Updated" }, { title: "Updated" }),
        header: "Updated",
        size: 130,
        enableSorting: false,
        cell: (info) => <DateCell value={info.getValue() as string | null} precision="date" fallback="Never" />,
      },
      { header: "Updated" },
    ),
    {
      id: "actions",
      meta: { className: "text-right", headerClassName: "text-right" },
      header: () => (
        <span className="sr-only">
          <LocalizedText text={"Actions"} />
        </span>
      ),
      size: 60,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <TeamRowActions
            team={row.original}
            canManage={canManage}
            onEditTeam={onEditTeam}
            onDeleteTeam={onDeleteTeam}
          />
        </div>
      ),
    },
  ];
};

export const TEAM_TABLE_HIDDEN_COLUMNS: Record<string, boolean> = {
  members: false,
  models: false,
  rate_limits: false,
  updated_at: false,
};
