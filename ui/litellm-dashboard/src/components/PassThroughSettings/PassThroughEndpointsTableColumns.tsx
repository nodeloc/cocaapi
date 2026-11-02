"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";
import { Eye, EyeOff, Info, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import React, { useState } from "react";

import { CellTooltip, IdentityCell, StatusBadge } from "@/components/shared/table_cells";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cva.config";

import type { passThroughItem } from "./PassThroughSettings";

const CONFIG_ENDPOINT_HINT =
  "This endpoint is defined in the config file and cannot be edited or deleted on the dashboard.";

function HeaderWithTooltip(cocaCopyProps0: { title: string; tooltip: string }) {
  const { title, tooltip } = cocaCopyProps0;
  useUiLocale();
  return (
    <div className="flex items-center gap-1">
      <span>{localizedProperty(cocaCopyProps0, "title", title)}</span>
      <CellTooltip content={tooltip} trigger={<Info className="size-3.5 cursor-help text-muted-foreground" />} />
    </div>
  );
}

function HeadersCell({ value }: { value: object }) {
  useUiLocale();
  const [showHeaders, setShowHeaders] = useState(false);
  const headerString = JSON.stringify(value);

  return (
    <div className="flex items-center gap-2">
      <span className="block max-w-60 truncate font-mono text-xs">{showHeaders ? headerString : "••••••••"}</span>
      <button
        type="button"
        onClick={() => setShowHeaders(!showHeaders)}
        aria-label={showHeaders ? translateMessage("Hide headers") : translateMessage("Show headers")}
        className="rounded-sm p-1 hover:bg-muted"
      >
        {showHeaders ? (
          <EyeOff className="size-4 text-muted-foreground" />
        ) : (
          <Eye className="size-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

function MethodsCell({ methods }: { methods: string[] | undefined }) {
  useUiLocale();
  if (!methods || methods.length === 0) {
    return (
      <Badge variant="secondary">
        <LocalizedText text={"ALL"} />
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {methods.map((method) => (
        <Badge key={method} variant="outline" className="font-mono text-xs font-normal">
          {method}
        </Badge>
      ))}
    </div>
  );
}

interface EndpointRowActionsProps {
  endpoint: passThroughItem;
  onEndpointClick: (endpointId: string) => void;
  onDeleteClick: (endpointId: string) => void;
}

function EndpointRowActions({ endpoint, onEndpointClick, onDeleteClick }: EndpointRowActionsProps) {
  useUiLocale();
  const endpointId = endpoint.id;
  const isFromConfig = endpoint.is_from_config ?? false;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={translateMessage("Open endpoint actions")}
        data-testid={`endpoint-actions-${endpointId || endpoint.path}`}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          data-testid="endpoint-action-edit"
          disabled={isFromConfig || !endpointId}
          onClick={() => !isFromConfig && endpointId && onEndpointClick(endpointId)}
        >
          <Pencil />
          <LocalizedText text={"Edit"} />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          data-testid="endpoint-action-delete"
          disabled={isFromConfig || !endpointId}
          onClick={() => !isFromConfig && endpointId && onDeleteClick(endpointId)}
        >
          <Trash2 />
          <LocalizedText text={"Delete"} />
        </DropdownMenuItem>
        {isFromConfig && (
          <div data-testid="endpoint-config-hint" className="px-2 py-1.5 text-xs text-muted-foreground">
            {CONFIG_ENDPOINT_HINT}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface PassThroughEndpointsTableColumnsDeps {
  onEndpointClick: (endpointId: string) => void;
  onDeleteClick: (endpointId: string) => void;
}

export const getPassThroughEndpointsTableColumns = ({
  onEndpointClick,
  onDeleteClick,
}: PassThroughEndpointsTableColumnsDeps): ColumnDef<passThroughItem>[] => [
  markUiCopy(
    {
      id: "id",
      accessorKey: "id",
      meta: markUiCopy({ title: "ID" }, { title: "ID" }),
      header: "ID",
      size: 190,
      enableSorting: false,
      cell: ({ row }) => {
        const endpointId = row.original.id;
        if (!endpointId || row.original.is_from_config) {
          return <span className="font-mono text-xs text-muted-foreground">—</span>;
        }
        return (
          <IdentityCell
            title={endpointId}
            titleClassName="font-mono text-xs font-normal"
            onClick={() => onEndpointClick(endpointId)}
          />
        );
      },
    },
    { header: "ID" },
  ),
  markUiCopy(
    {
      id: "source",
      meta: markUiCopy({ title: "Source", skeleton: "badge" as const }, { title: "Source" }),
      header: "Source",
      size: 100,
      enableSorting: false,
      cell: ({ row }) => {
        const isFromConfig = row.original.is_from_config ?? false;
        return (
          <StatusBadge
            tone={isFromConfig ? "neutral" : "info"}
            label={isFromConfig ? translateMessage("Config") : translateMessage("DB")}
          />
        );
      },
    },
    { header: "Source" },
  ),
  markUiCopy(
    {
      id: "path",
      accessorKey: "path",
      meta: markUiCopy({ title: "Path" }, { title: "Path" }),
      header: "Path",
      size: 200,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-60 truncate text-sm font-medium" title={row.original.path}>
          {row.original.path}
        </span>
      ),
    },
    { header: "Path" },
  ),
  markUiCopy(
    {
      id: "target",
      accessorKey: "target",
      meta: markUiCopy({ title: "Target" }, { title: "Target" }),
      header: "Target",
      size: 240,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-72 truncate text-sm" title={row.original.target}>
          {row.original.target}
        </span>
      ),
    },
    { header: "Target" },
  ),
  {
    id: "methods",
    meta: markUiCopy({ title: "Methods", skeleton: "chips" as const }, { title: "Methods" }),
    header: () => (
      <HeaderWithTooltip
        title={translateMessage("Methods")}
        tooltip={translateMessage("HTTP methods supported by this endpoint")}
      />
    ),
    size: 150,
    enableSorting: false,
    cell: ({ row }) => <MethodsCell methods={row.original.methods} />,
  },
  {
    id: "auth",
    accessorKey: "auth",
    meta: markUiCopy({ title: "Authentication", skeleton: "badge" as const }, { title: "Authentication" }),
    header: () => (
      <HeaderWithTooltip
        title={translateMessage("Authentication")}
        tooltip={translateMessage("LiteLLM Virtual Key required to call endpoint")}
      />
    ),
    size: 140,
    enableSorting: false,
    cell: ({ row }) => (
      <StatusBadge
        tone={row.original.auth ? "success" : "neutral"}
        label={row.original.auth ? translateMessage("Yes") : translateMessage("No")}
      />
    ),
  },
  markUiCopy(
    {
      id: "headers",
      meta: markUiCopy({ title: "Headers" }, { title: "Headers" }),
      header: "Headers",
      size: 180,
      enableSorting: false,
      cell: ({ row }) => <HeadersCell value={row.original.headers || {}} />,
    },
    { header: "Headers" },
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
        <EndpointRowActions endpoint={row.original} onEndpointClick={onEndpointClick} onDeleteClick={onDeleteClick} />
      </div>
    ),
  },
];
