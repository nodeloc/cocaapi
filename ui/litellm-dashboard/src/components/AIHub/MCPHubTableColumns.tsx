"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";
import { Copy, Info, MoreHorizontal } from "lucide-react";

import { DataTableSortHeader } from "@/components/shared/DataTable";
import { MCP_REACHABLE_DESCRIPTION } from "@/components/mcp_tools/types";
import { IdentityCell, StatusBadge, type StatusTone } from "@/components/shared/table_cells";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cva.config";
import { copyToClipboard } from "@/utils/dataUtils";

export interface MCPServerData {
  server_id: string;
  server_name: string;
  alias?: string | null;
  description?: string | null;
  url: string;
  transport: string;
  auth_type: string;
  credentials?: any;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  teams: string[];
  mcp_access_groups: string[];
  allowed_tools: string[];
  extra_headers: any[];
  mcp_info: Record<string, any>;
  static_headers: Record<string, any>;
  status: string;
  last_health_check?: string | null;
  health_check_error?: string | null;
  command?: string | null;
  args: string[];
  env: Record<string, any>;
  [key: string]: any;
}

const STATUS_TONES: Record<string, StatusTone> = {
  active: "success",
  inactive: "error",
  unknown: "neutral",
  healthy: "success",
  reachable: "info",
  unhealthy: "error",
};

interface MCPHubRowActionsProps {
  server: MCPServerData;
  onServerClick: (server: MCPServerData) => void;
}

function MCPHubRowActions({ server, onServerClick }: MCPHubRowActionsProps) {
  useUiLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={translateMessage("Open MCP server actions")}
        data-testid={`mcp-hub-actions-${server.server_id}`}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem data-testid="mcp-hub-action-details" onClick={() => onServerClick(server)}>
          <Info />
          <LocalizedText text={"View details"} />
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="mcp-hub-action-copy"
          onClick={() => void copyToClipboard(server.server_name, "Server name copied")}
        >
          <Copy />
          <LocalizedText text={"Copy server name"} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface MCPHubTableColumnsDeps {
  onServerClick: (server: MCPServerData) => void;
}

export const getMCPHubTableColumns = ({ onServerClick }: MCPHubTableColumnsDeps): ColumnDef<MCPServerData>[] => [
  {
    id: "server_name",
    accessorKey: "server_name",
    meta: markUiCopy({ title: "Server Name" }, { title: "Server Name" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Server Name")} />,
    size: 200,
    enableSorting: true,
    sortingFn: "alphanumeric",
    cell: ({ row }) => (
      <IdentityCell title={row.original.server_name} className="max-w-72" onClick={() => onServerClick(row.original)} />
    ),
  },
  {
    id: "description",
    accessorKey: "description",
    meta: markUiCopy({ title: "Description", className: "hidden md:table-cell" }, { title: "Description" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Description")} />,
    size: 240,
    enableSorting: true,
    sortingFn: "alphanumeric",
    cell: ({ row }) => (
      <span
        className="block max-w-72 truncate text-xs"
        title={localizedProperty(row.original, "description") || undefined}
      >
        {localizedProperty(row.original, "description") || "-"}
      </span>
    ),
  },
  {
    id: "transport",
    accessorKey: "transport",
    meta: markUiCopy(
      { title: "Transport", skeleton: "badge" as const, className: "hidden md:table-cell" },
      { title: "Transport" },
    ),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Transport")} />,
    size: 110,
    enableSorting: true,
    sortingFn: "alphanumeric",
    cell: ({ row }) => (
      <Badge variant="secondary" className="font-mono font-normal">
        {row.original.transport}
      </Badge>
    ),
  },
  {
    id: "auth_type",
    accessorKey: "auth_type",
    meta: markUiCopy(
      { title: "Auth Type", skeleton: "badge" as const, className: "hidden md:table-cell" },
      { title: "Auth Type" },
    ),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Auth Type")} />,
    size: 110,
    enableSorting: true,
    sortingFn: "alphanumeric",
    cell: ({ row }) => (
      <StatusBadge tone={row.original.auth_type === "none" ? "neutral" : "success"} label={row.original.auth_type} />
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    meta: markUiCopy({ title: "Status", skeleton: "badge" as const }, { title: "Status" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Status")} />,
    size: 110,
    enableSorting: true,
    sortingFn: "alphanumeric",
    cell: ({ row }) => (
      <StatusBadge
        tone={STATUS_TONES[row.original.status] || "neutral"}
        label={row.original.status || translateMessage("unknown")}
        tooltip={row.original.status === "reachable" ? MCP_REACHABLE_DESCRIPTION : undefined}
      />
    ),
  },
  markUiCopy(
    {
      id: "allowed_tools",
      meta: markUiCopy(
        { title: "Tools", skeleton: "chips" as const, className: "hidden lg:table-cell" },
        { title: "Tools" },
      ),
      header: "Tools",
      size: 180,
      enableSorting: false,
      cell: ({ row }) => {
        const tools = row.original.allowed_tools || [];
        return (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium">
              {tools.length > 0
                ? translateMessage("%{0} tool%{1}", [tools.length, tools.length !== 1 ? "s" : ""])
                : translateMessage("All tools")}
            </span>
            {tools.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tools.slice(0, 2).map((tool) => (
                  <Badge key={tool} variant="secondary">
                    {tool}
                  </Badge>
                ))}
                {tools.length > 2 && <span className="text-xs text-muted-foreground">+{tools.length - 2}</span>}
              </div>
            )}
          </div>
        );
      },
    },
    { header: "Tools" },
  ),
  {
    id: "created_by",
    accessorKey: "created_by",
    meta: markUiCopy({ title: "Created By", className: "hidden xl:table-cell" }, { title: "Created By" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Created By")} />,
    size: 140,
    enableSorting: true,
    sortingFn: "alphanumeric",
    cell: ({ row }) => (
      <span className="block max-w-60 truncate text-xs" title={row.original.created_by || undefined}>
        {row.original.created_by || "-"}
      </span>
    ),
  },
  {
    id: "is_public",
    accessorFn: (row) => row.mcp_info?.is_public === true,
    meta: markUiCopy(
      { title: "Hub listing", skeleton: "badge" as const, className: "hidden md:table-cell" },
      { title: "Hub listing" },
    ),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Hub listing")} />,
    size: 100,
    enableSorting: true,
    sortingFn: (rowA, rowB) => {
      const publicA = rowA.original.mcp_info?.is_public === true ? 1 : 0;
      const publicB = rowB.original.mcp_info?.is_public === true ? 1 : 0;
      return publicA - publicB;
    },
    cell: ({ row }) => {
      const isPublic = row.original.mcp_info?.is_public === true;
      return (
        <StatusBadge
          tone={isPublic ? "success" : "neutral"}
          label={isPublic ? translateMessage("Listed") : translateMessage("Unlisted")}
        />
      );
    },
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
        <MCPHubRowActions server={row.original} onServerClick={onServerClick} />
      </div>
    ),
  },
];
