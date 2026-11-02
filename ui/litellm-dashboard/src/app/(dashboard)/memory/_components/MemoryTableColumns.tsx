"use client";
import { LocalizedText, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";
import { Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { MemoryRow } from "@/components/networking";
import { DateCell, IdCell, IdentityCell } from "@/components/shared/table_cells";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cva.config";
import { teamDetailHref, userDetailHref } from "@/utils/entityLinks";

interface MemoryRowActionsProps {
  row: MemoryRow;
  onViewClick: (row: MemoryRow) => void;
  onEditClick: (row: MemoryRow) => void;
  onDeleteClick: (row: MemoryRow) => void;
}

function MemoryRowActions({ row, onViewClick, onEditClick, onDeleteClick }: MemoryRowActionsProps) {
  useUiLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={translateMessage("Open memory actions")}
        data-testid={`memory-actions-${row.memory_id}`}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem data-testid="memory-action-view" onClick={() => onViewClick(row)}>
          <Eye />
          <LocalizedText text={"View"} />
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="memory-action-edit" onClick={() => onEditClick(row)}>
          <Pencil />
          <LocalizedText text={"Edit"} />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" data-testid="memory-action-delete" onClick={() => onDeleteClick(row)}>
          <Trash2 />
          <LocalizedText text={"Delete"} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface MemoryTableColumnsDeps {
  onViewClick: (row: MemoryRow) => void;
  onEditClick: (row: MemoryRow) => void;
  onDeleteClick: (row: MemoryRow) => void;
}

export const getMemoryTableColumns = ({
  onViewClick,
  onEditClick,
  onDeleteClick,
}: MemoryTableColumnsDeps): ColumnDef<MemoryRow>[] => [
  markUiCopy(
    {
      id: "memory_id",
      accessorKey: "memory_id",
      meta: markUiCopy({ title: "ID" }, { title: "ID" }),
      header: "ID",
      size: 180,
      enableSorting: false,
      cell: ({ row }) => (
        <IdentityCell
          title={row.original.memory_id}
          titleClassName="font-mono text-xs font-normal"
          onClick={() => onViewClick(row.original)}
        />
      ),
    },
    { header: "ID" },
  ),
  markUiCopy(
    {
      id: "key",
      accessorKey: "key",
      meta: markUiCopy({ title: "Name" }, { title: "Name" }),
      header: "Name",
      size: 200,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-52 truncate font-mono text-xs" title={row.original.key}>
          {row.original.key}
        </span>
      ),
    },
    { header: "Name" },
  ),
  markUiCopy(
    {
      id: "value",
      accessorKey: "value",
      meta: markUiCopy({ title: "Preview" }, { title: "Preview" }),
      header: "Preview",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-72 truncate text-sm text-muted-foreground" title={row.original.value}>
          {row.original.value || "-"}
        </span>
      ),
    },
    { header: "Preview" },
  ),
  markUiCopy(
    {
      id: "user_id",
      accessorKey: "user_id",
      meta: markUiCopy({ title: "User ID" }, { title: "User ID" }),
      header: "User ID",
      size: 160,
      enableSorting: false,
      cell: ({ row }) => {
        const userId = row.original.user_id;
        return <IdCell value={userId} href={userId ? userDetailHref(userId) : undefined} />;
      },
    },
    { header: "User ID" },
  ),
  markUiCopy(
    {
      id: "team_id",
      accessorKey: "team_id",
      meta: markUiCopy({ title: "Team ID" }, { title: "Team ID" }),
      header: "Team ID",
      size: 160,
      enableSorting: false,
      cell: ({ row }) => {
        const teamId = row.original.team_id;
        return <IdCell value={teamId} href={teamId ? teamDetailHref(teamId) : undefined} />;
      },
    },
    { header: "Team ID" },
  ),
  markUiCopy(
    {
      id: "updated_at",
      accessorKey: "updated_at",
      meta: markUiCopy({ title: "Updated" }, { title: "Updated" }),
      header: "Updated",
      size: 170,
      enableSorting: false,
      cell: ({ row }) => <DateCell value={row.original.updated_at} />,
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
    size: 64,
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <MemoryRowActions
          row={row.original}
          onViewClick={onViewClick}
          onEditClick={onEditClick}
          onDeleteClick={onDeleteClick}
        />
      </div>
    ),
  },
];
