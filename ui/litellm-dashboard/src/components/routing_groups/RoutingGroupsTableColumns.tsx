"use client";
import { LocalizedText, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import type { ColumnDef } from "@tanstack/react-table";
import { GitBranch, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

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

import { formatStrategyLabel } from "./strategy";
import type { RoutingGroup } from "./types";

interface RoutingGroupRowActionsProps {
  group: RoutingGroup;
  onEdit: (group: RoutingGroup) => void;
  onDelete: (group: RoutingGroup) => void;
}

function RoutingGroupRowActions({ group, onEdit, onDelete }: RoutingGroupRowActionsProps) {
  useUiLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={translateMessage("Open actions for %{0}", [group.group_name])}
        data-testid={`routing-group-actions-${group.group_name}`}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem data-testid="routing-group-action-edit" onClick={() => onEdit(group)}>
          <Pencil />
          <LocalizedText text={"Edit"} />
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          data-testid="routing-group-action-delete"
          onClick={() => onDelete(group)}
        >
          <Trash2 />
          <LocalizedText text={"Delete"} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RoutingGroupsTableColumnsDeps {
  onEdit: (group: RoutingGroup) => void;
  onDelete: (group: RoutingGroup) => void;
  onToggleUsage: (group: RoutingGroup) => void;
}

export const getRoutingGroupsTableColumns = ({
  onEdit,
  onDelete,
  onToggleUsage,
}: RoutingGroupsTableColumnsDeps): ColumnDef<RoutingGroup>[] => [
  {
    id: "group_name",
    accessorKey: "group_name",
    meta: markUiCopy({ title: "Group Name", skeleton: "text" as const }, { title: "Group Name" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Group Name")} />,
    size: 240,
    enableSorting: true,
    cell: ({ row }) => (
      <IdentityCell title={row.original.group_name} className="max-w-60" onClick={() => onToggleUsage(row.original)} />
    ),
  },
  markUiCopy(
    {
      id: "models",
      meta: markUiCopy({ title: "Models", skeleton: "chips" as const }, { title: "Models" }),
      header: "Models",
      size: 320,
      enableSorting: false,
      cell: ({ row }) => <ModelsCell models={row.original.models} />,
    },
    { header: "Models" },
  ),
  {
    id: "routing_strategy",
    accessorKey: "routing_strategy",
    meta: markUiCopy({ title: "Strategy", skeleton: "text" as const }, { title: "Strategy" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Strategy")} />,
    size: 180,
    enableSorting: true,
    cell: ({ row }) => (
      <span className="flex items-center gap-1.5 text-sm">
        <GitBranch className="size-4 shrink-0 text-muted-foreground" />
        {formatStrategyLabel(row.original.routing_strategy)}
      </span>
    ),
  },
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
        <RoutingGroupRowActions group={row.original} onEdit={onEdit} onDelete={onDelete} />
      </div>
    ),
  },
];
