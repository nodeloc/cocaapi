"use client";
import { LocalizedText, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Trash2 } from "lucide-react";

import { DataTableSortHeader } from "@/components/shared/DataTable";
import { DateCell, IdentityCell, StatusBadge } from "@/components/shared/table_cells";
import { Guardrail, GuardrailDefinitionLocation } from "@/components/guardrails/types";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cva.config";

import { formatGuardrailMode, getGuardrailLogoAndName } from "./guardrail_info_helpers";
import { Logo } from "@/components/molecules/logo/Logo";

const CONFIG_DELETE_HINT = "Config guardrails are defined in the config file and cannot be deleted from the dashboard.";

function GuardrailProviderCell({ provider }: { provider: string }) {
  useUiLocale();
  const { logo, displayName } = getGuardrailLogoAndName(provider);
  return (
    <div className="flex items-center gap-2">
      <Logo src={logo} label={displayName} className="size-4 shrink-0" />
      <span className="truncate text-sm">{displayName}</span>
    </div>
  );
}

interface GuardrailRowActionsProps {
  guardrail: Guardrail;
  onDeleteClick: (guardrailId: string, guardrailName: string) => void;
}

function GuardrailRowActions({ guardrail, onDeleteClick }: GuardrailRowActionsProps) {
  useUiLocale();
  const isConfigGuardrail = guardrail.guardrail_definition_location === GuardrailDefinitionLocation.CONFIG;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={translateMessage("Open guardrail actions")}
        data-testid={`guardrail-actions-${guardrail.guardrail_id}`}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          variant="destructive"
          disabled={isConfigGuardrail}
          data-testid="guardrail-action-delete"
          title={isConfigGuardrail ? CONFIG_DELETE_HINT : undefined}
          onClick={() => onDeleteClick(guardrail.guardrail_id, guardrail.guardrail_name || "Unnamed Guardrail")}
        >
          <Trash2 />
          <LocalizedText text={"Delete"} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface GuardrailTableColumnsDeps {
  onGuardrailClick: (guardrailId: string) => void;
  onDeleteClick: (guardrailId: string, guardrailName: string) => void;
}

export const getGuardrailTableColumns = ({
  onGuardrailClick,
  onDeleteClick,
}: GuardrailTableColumnsDeps): ColumnDef<Guardrail>[] => [
  {
    id: "guardrail_id",
    accessorKey: "guardrail_id",
    meta: markUiCopy({ title: "Guardrail ID" }, { title: "Guardrail ID" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Guardrail ID")} />,
    size: 200,
    enableSorting: true,
    cell: ({ row }) => (
      <IdentityCell
        title={row.original.guardrail_id}
        titleClassName="font-mono text-xs font-normal"
        onClick={() => onGuardrailClick(row.original.guardrail_id)}
      />
    ),
  },
  {
    id: "guardrail_name",
    accessorKey: "guardrail_name",
    meta: markUiCopy({ title: "Name" }, { title: "Name" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Name")} />,
    size: 200,
    enableSorting: true,
    cell: ({ row }) => {
      const name = row.original.guardrail_name;
      return (
        <span className="block truncate text-sm font-medium" title={name ?? undefined}>
          {name || "-"}
        </span>
      );
    },
  },
  markUiCopy(
    {
      id: "provider",
      meta: markUiCopy({ title: "Provider" }, { title: "Provider" }),
      header: "Provider",
      size: 180,
      enableSorting: false,
      cell: ({ row }) => <GuardrailProviderCell provider={row.original.litellm_params.guardrail} />,
    },
    { header: "Provider" },
  ),
  markUiCopy(
    {
      id: "mode",
      meta: markUiCopy({ title: "Mode" }, { title: "Mode" }),
      header: "Mode",
      size: 130,
      enableSorting: false,
      cell: ({ row }) => {
        const mode = formatGuardrailMode(row.original.litellm_params.mode);
        return (
          <span className="font-mono text-xs text-muted-foreground" title={mode || undefined}>
            {mode || "-"}
          </span>
        );
      },
    },
    { header: "Mode" },
  ),
  markUiCopy(
    {
      id: "default_on",
      meta: markUiCopy({ title: "Default On" }, { title: "Default On" }),
      header: "Default On",
      size: 120,
      enableSorting: false,
      cell: ({ row }) => {
        const isDefaultOn = !!row.original.litellm_params?.default_on;
        return (
          <StatusBadge
            tone={isDefaultOn ? "success" : "neutral"}
            label={isDefaultOn ? translateMessage("Default On") : translateMessage("Default Off")}
          />
        );
      },
    },
    { header: "Default On" },
  ),
  {
    id: "created_at",
    accessorKey: "created_at",
    meta: markUiCopy({ title: "Created At" }, { title: "Created At" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Created At")} />,
    size: 150,
    enableSorting: true,
    cell: ({ row }) => <DateCell value={row.original.created_at} />,
  },
  {
    id: "updated_at",
    accessorKey: "updated_at",
    meta: markUiCopy({ title: "Updated At" }, { title: "Updated At" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Updated At")} />,
    size: 150,
    enableSorting: true,
    cell: ({ row }) => <DateCell value={row.original.updated_at} />,
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
        <GuardrailRowActions guardrail={row.original} onDeleteClick={onDeleteClick} />
      </div>
    ),
  },
];
