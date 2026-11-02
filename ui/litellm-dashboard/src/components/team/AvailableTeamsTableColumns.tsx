"use client";
import { LocalizedText, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, UserPlus } from "lucide-react";

import { DataTableSortHeader } from "@/components/shared/DataTable";
import { IdentityCell, ModelsCell } from "@/components/shared/table_cells";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cva.config";

export interface AvailableTeam {
  team_id: string;
  team_alias: string;
  description?: string;
  models: string[];
  members_with_roles: { user_id?: string; user_email?: string; role: string }[];
}

function AvailableTeamRowActions({ team, onJoinTeam }: { team: AvailableTeam; onJoinTeam: (teamId: string) => void }) {
  useUiLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={translateMessage("Open team actions")}
        data-testid={`available-team-actions-${team.team_id}`}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem data-testid="available-team-action-join" onClick={() => onJoinTeam(team.team_id)}>
          <UserPlus />
          <LocalizedText text={"Join team"} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AvailableTeamsTableColumnsDeps {
  onJoinTeam: (teamId: string) => void;
}

export const getAvailableTeamsTableColumns = ({
  onJoinTeam,
}: AvailableTeamsTableColumnsDeps): ColumnDef<AvailableTeam>[] => [
  {
    id: "team_alias",
    accessorKey: "team_alias",
    meta: markUiCopy({ title: "Team Name" }, { title: "Team Name" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Team Name")} />,
    size: 220,
    enableSorting: true,
    cell: ({ row }) => (
      <IdentityCell title={row.original.team_alias} className="max-w-72" titleClassName="font-medium" />
    ),
  },
  markUiCopy(
    {
      id: "description",
      accessorKey: "description",
      meta: markUiCopy({ title: "Description" }, { title: "Description" }),
      header: "Description",
      size: 280,
      enableSorting: false,
      cell: ({ row }) => {
        const description = row.original.description;
        return (
          <span className="block max-w-72 truncate text-sm text-muted-foreground" title={description || undefined}>
            {description || translateMessage("No description available")}
          </span>
        );
      },
    },
    { header: "Description" },
  ),
  {
    id: "members",
    accessorFn: (team) => team.members_with_roles.length,
    meta: markUiCopy({ title: "Members" }, { title: "Members" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Members")} />,
    size: 120,
    enableSorting: true,
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.members_with_roles.length}
        <LocalizedText text={" members"} />
      </span>
    ),
  },
  markUiCopy(
    {
      id: "models",
      meta: markUiCopy({ title: "Models" }, { title: "Models" }),
      header: "Models",
      size: 260,
      enableSorting: false,
      cell: ({ row }) => <ModelsCell models={row.original.models} />,
    },
    { header: "Models" },
  ),
  {
    id: "actions",
    meta: { className: "text-right", headerClassName: "text-right" },
    header: () => (
      <span className="sr-only">
        <LocalizedText text={"Actions"} />
      </span>
    ),
    size: 64,
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <AvailableTeamRowActions team={row.original} onJoinTeam={onJoinTeam} />
      </div>
    ),
  },
];
