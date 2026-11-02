"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";
import { Copy, Info, MoreHorizontal } from "lucide-react";

import { DataTableSortHeader } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/table_cells";
import { IdentityCell } from "@/components/shared/table_cells";
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

export interface AgentHubData {
  agent_id?: string;
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities?: {
    streaming?: boolean;
    [key: string]: any;
  };
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills?: Array<{
    id: string;
    name: string;
    description: string;
    tags?: string[];
    examples?: string[];
  }>;
  supportsAuthenticatedExtendedCard?: boolean;
  is_public?: boolean;
  [key: string]: any;
}

interface AgentHubRowActionsProps {
  agent: AgentHubData;
  onAgentClick: (agent: AgentHubData) => void;
}

function AgentHubRowActions({ agent, onAgentClick }: AgentHubRowActionsProps) {
  useUiLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={translateMessage("Open agent actions")}
        data-testid={`agent-hub-actions-${agent.agent_id || agent.name}`}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem data-testid="agent-hub-action-details" onClick={() => onAgentClick(agent)}>
          <Info />
          <LocalizedText text={"View details"} />
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="agent-hub-action-copy"
          onClick={() => void copyToClipboard(agent.name, "Agent name copied")}
        >
          <Copy />
          <LocalizedText text={"Copy agent name"} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AgentHubTableColumnsDeps {
  onAgentClick: (agent: AgentHubData) => void;
}

export const getAgentHubTableColumns = ({ onAgentClick }: AgentHubTableColumnsDeps): ColumnDef<AgentHubData>[] => [
  {
    id: "name",
    accessorKey: "name",
    meta: markUiCopy({ title: "Agent Name" }, { title: "Agent Name" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Agent Name")} />,
    size: 200,
    enableSorting: true,
    sortingFn: "alphanumeric",
    cell: ({ row }) => (
      <IdentityCell title={row.original.name} className="max-w-72" onClick={() => onAgentClick(row.original)} />
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
    id: "version",
    accessorKey: "version",
    meta: markUiCopy(
      { title: "Version", skeleton: "badge" as const, className: "hidden lg:table-cell" },
      { title: "Version" },
    ),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Version")} />,
    size: 100,
    enableSorting: true,
    sortingFn: "alphanumeric",
    cell: ({ row }) => (
      <Badge variant="outline" className="font-mono font-normal">
        v{row.original.version}
      </Badge>
    ),
  },
  {
    id: "protocolVersion",
    accessorKey: "protocolVersion",
    meta: markUiCopy({ title: "Protocol", className: "hidden lg:table-cell" }, { title: "Protocol" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Protocol")} />,
    size: 100,
    enableSorting: true,
    sortingFn: "alphanumeric",
    cell: ({ row }) => <span className="text-xs">{row.original.protocolVersion || "-"}</span>,
  },
  markUiCopy(
    {
      id: "skills",
      meta: markUiCopy({ title: "Skills", skeleton: "chips" as const }, { title: "Skills" }),
      header: "Skills",
      size: 180,
      enableSorting: false,
      cell: ({ row }) => {
        const skills = row.original.skills || [];
        return (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium">
              {skills.length}
              <LocalizedText text={" skill"} />
              {skills.length !== 1 ? translateMessage("s") : ""}
            </span>
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {skills.slice(0, 2).map((skill) => (
                  <Badge key={skill.id} variant="secondary">
                    {skill.name}
                  </Badge>
                ))}
                {skills.length > 2 && <span className="text-xs text-muted-foreground">+{skills.length - 2}</span>}
              </div>
            )}
          </div>
        );
      },
    },
    { header: "Skills" },
  ),
  markUiCopy(
    {
      id: "capabilities",
      meta: markUiCopy({ title: "Capabilities", skeleton: "chips" as const }, { title: "Capabilities" }),
      header: "Capabilities",
      size: 160,
      enableSorting: false,
      cell: ({ row }) => {
        const capabilityList = Object.entries(row.original.capabilities || {})
          .filter(([, value]) => value === true)
          .map(([key]) => key);
        if (capabilityList.length === 0) {
          return <span className="text-xs text-muted-foreground">-</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {capabilityList.map((capability) => (
              <Badge key={capability} variant="outline">
                {capability}
              </Badge>
            ))}
          </div>
        );
      },
    },
    { header: "Capabilities" },
  ),
  markUiCopy(
    {
      id: "io_modes",
      meta: markUiCopy(
        { title: "I/O Modes", skeleton: "twoLine" as const, className: "hidden xl:table-cell" },
        { title: "I/O Modes" },
      ),
      header: "I/O Modes",
      size: 150,
      enableSorting: false,
      cell: ({ row }) => {
        const inputModes = row.original.defaultInputModes || [];
        const outputModes = row.original.defaultOutputModes || [];
        return (
          <div className="flex flex-col gap-0.5 text-xs">
            <span>
              <span className="font-medium">
                <LocalizedText text={"In:"} />
              </span>{" "}
              {inputModes.join(", ") || "-"}
            </span>
            <span>
              <span className="font-medium">
                <LocalizedText text={"Out:"} />
              </span>{" "}
              {outputModes.join(", ") || "-"}
            </span>
          </div>
        );
      },
    },
    { header: "I/O Modes" },
  ),
  {
    id: "is_public",
    accessorKey: "is_public",
    meta: markUiCopy(
      { title: "Public", skeleton: "badge" as const, className: "hidden md:table-cell" },
      { title: "Public" },
    ),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Public")} />,
    size: 100,
    enableSorting: true,
    sortingFn: (rowA, rowB) => {
      const publicA = rowA.original.is_public === true ? 1 : 0;
      const publicB = rowB.original.is_public === true ? 1 : 0;
      return publicA - publicB;
    },
    cell: ({ row }) => {
      const isPublic = row.original.is_public === true;
      return (
        <StatusBadge
          tone={isPublic ? "success" : "neutral"}
          label={isPublic ? translateMessage("Yes") : translateMessage("No")}
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
        <AgentHubRowActions agent={row.original} onAgentClick={onAgentClick} />
      </div>
    ),
  },
];
