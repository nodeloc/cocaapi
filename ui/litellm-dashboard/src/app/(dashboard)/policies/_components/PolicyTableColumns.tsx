"use client";
import { LocalizedText, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { DataTableSortHeader } from "@/components/shared/DataTable";
import { DateCell, IdentityCell, StatusBadge } from "@/components/shared/table_cells";
import { Policy } from "@/components/policies/types";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cva.config";

export interface PolicyRow {
  policy_name: string;
  primaryPolicy: Policy;
  versionCount: number;
}

const CONFIG_POLICY_HINT =
  "Config policies are defined in the config file and cannot be edited or deleted from the dashboard.";

function GuardrailChips({ guardrails, tone }: { guardrails: string[]; tone: "success" | "error" }) {
  useUiLocale();
  if (guardrails.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {guardrails.slice(0, 2).map((guardrail) => (
        <StatusBadge key={guardrail} tone={tone} label={guardrail} />
      ))}
      {guardrails.length > 2 && (
        <StatusBadge tone="neutral" label={`+${guardrails.length - 2}`} tooltip={guardrails.slice(2).join(", ")} />
      )}
    </div>
  );
}

interface PolicyRowActionsProps {
  policy: Policy;
  onEditClick: (policy: Policy) => void;
  onDeleteClick: (policyId: string, policyName: string) => void;
}

function PolicyRowActions({ policy, onEditClick, onDeleteClick }: PolicyRowActionsProps) {
  useUiLocale();
  const isConfigPolicy = policy.definition_location === "config";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={translateMessage("Open policy actions")}
        data-testid={`policy-actions-${policy.policy_id}`}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          data-testid="policy-action-edit"
          disabled={isConfigPolicy}
          title={isConfigPolicy ? CONFIG_POLICY_HINT : undefined}
          onClick={() => onEditClick(policy)}
        >
          <Pencil />
          <LocalizedText text={"Edit policy"} />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          data-testid="policy-action-delete"
          disabled={isConfigPolicy}
          title={isConfigPolicy ? CONFIG_POLICY_HINT : undefined}
          onClick={() => onDeleteClick(policy.policy_id, policy.policy_name || "Unnamed Policy")}
        >
          <Trash2 />
          <LocalizedText text={"Delete policy"} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface PolicyTableColumnsDeps {
  isAdmin: boolean;
  onViewClick: (policyId: string) => void;
  onEditClick: (policy: Policy) => void;
  onDeleteClick: (policyId: string, policyName: string) => void;
}

export const getPolicyTableColumns = ({
  isAdmin,
  onViewClick,
  onEditClick,
  onDeleteClick,
}: PolicyTableColumnsDeps): ColumnDef<PolicyRow>[] => [
  {
    id: "policy_name",
    accessorKey: "policy_name",
    meta: markUiCopy({ title: "Name", skeleton: "twoLine" as const }, { title: "Name" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Name")} />,
    size: 220,
    enableSorting: true,
    cell: ({ row }) => {
      const isConfigPolicy = row.original.primaryPolicy.definition_location === "config";
      const versionBadge =
        row.original.versionCount > 1 ? (
          <StatusBadge tone="neutral" label={translateMessage("%{0} versions", [row.original.versionCount])} />
        ) : undefined;
      return (
        <IdentityCell
          title={row.original.policy_name}
          titleClassName="max-w-60"
          badge={
            isConfigPolicy ? (
              <StatusBadge tone="neutral" label={translateMessage("Config")} tooltip={CONFIG_POLICY_HINT} />
            ) : (
              versionBadge
            )
          }
          onClick={isConfigPolicy ? undefined : () => onViewClick(row.original.primaryPolicy.policy_id)}
        />
      );
    },
  },
  markUiCopy(
    {
      id: "description",
      accessorFn: (row) => row.primaryPolicy.description ?? "",
      meta: markUiCopy({ title: "Description" }, { title: "Description" }),
      header: "Description",
      size: 220,
      enableSorting: false,
      cell: ({ row }) => {
        const description = row.original.primaryPolicy.description;
        if (!description) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <span className="block max-w-60 truncate text-muted-foreground" title={description}>
            {description}
          </span>
        );
      },
    },
    { header: "Description" },
  ),
  markUiCopy(
    {
      id: "inherit",
      accessorFn: (row) => row.primaryPolicy.inherit ?? "",
      meta: markUiCopy({ title: "Inherits From", skeleton: "badge" as const }, { title: "Inherits From" }),
      header: "Inherits From",
      size: 150,
      enableSorting: false,
      cell: ({ row }) => {
        const inherit = row.original.primaryPolicy.inherit;
        if (!inherit) {
          return <span className="text-muted-foreground">-</span>;
        }
        return <StatusBadge tone="info" label={inherit} />;
      },
    },
    { header: "Inherits From" },
  ),
  markUiCopy(
    {
      id: "guardrails_add",
      meta: markUiCopy({ title: "Guardrails (Add)", skeleton: "chips" as const }, { title: "Guardrails (Add)" }),
      header: "Guardrails (Add)",
      size: 180,
      enableSorting: false,
      cell: ({ row }) => <GuardrailChips guardrails={row.original.primaryPolicy.guardrails_add ?? []} tone="success" />,
    },
    { header: "Guardrails (Add)" },
  ),
  markUiCopy(
    {
      id: "guardrails_remove",
      meta: markUiCopy({ title: "Guardrails (Remove)", skeleton: "chips" as const }, { title: "Guardrails (Remove)" }),
      header: "Guardrails (Remove)",
      size: 180,
      enableSorting: false,
      cell: ({ row }) => (
        <GuardrailChips guardrails={row.original.primaryPolicy.guardrails_remove ?? []} tone="error" />
      ),
    },
    { header: "Guardrails (Remove)" },
  ),
  markUiCopy(
    {
      id: "model_condition",
      meta: markUiCopy({ title: "Model Condition" }, { title: "Model Condition" }),
      header: "Model Condition",
      size: 160,
      enableSorting: false,
      cell: ({ row }) => {
        const model = row.original.primaryPolicy.condition?.model;
        if (!model) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <code className="block max-w-40 truncate rounded-sm bg-muted px-1 py-0.5 font-mono text-xs" title={model}>
            {model}
          </code>
        );
      },
    },
    { header: "Model Condition" },
  ),
  {
    id: "created_at",
    accessorFn: (row) => row.primaryPolicy.created_at ?? "",
    meta: markUiCopy({ title: "Created At" }, { title: "Created At" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Created At")} />,
    size: 150,
    enableSorting: true,
    cell: ({ row }) => <DateCell value={row.original.primaryPolicy.created_at} />,
  },
  ...(isAdmin
    ? [
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
              <PolicyRowActions
                policy={row.original.primaryPolicy}
                onEditClick={onEditClick}
                onDeleteClick={onDeleteClick}
              />
            </div>
          ),
        } satisfies ColumnDef<PolicyRow>,
      ]
    : []),
];
