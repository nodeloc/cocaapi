"use client";
import { LocalizedText, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";

import { DataTableSortHeader } from "@/components/shared/DataTable";
import { DateCell, IdCell, StatusBadge } from "@/components/shared/table_cells";
import { PolicyAttachment } from "@/components/policies/types";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cva.config";
import { copyToClipboard } from "@/utils/dataUtils";

import ImpactPopover from "./impact_popover";

function ChipList({ values }: { values: string[] }) {
  useUiLocale();
  if (values.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {values.slice(0, 2).map((value) => (
        <StatusBadge key={value} tone="neutral" label={value} />
      ))}
      {values.length > 2 && (
        <StatusBadge tone="neutral" label={`+${values.length - 2}`} tooltip={values.slice(2).join(", ")} />
      )}
    </div>
  );
}

interface AttachmentRowActionsProps {
  attachment: PolicyAttachment;
  isAdmin: boolean;
  onDeleteClick: (attachmentId: string) => void;
}

const CONFIG_ATTACHMENT_HINT =
  "Config attachments are defined in the config file and cannot be deleted from the dashboard.";

function AttachmentRowActions({ attachment, isAdmin, onDeleteClick }: AttachmentRowActionsProps) {
  useUiLocale();
  const isConfigAttachment = attachment.definition_location === "config";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={translateMessage("Open attachment actions")}
        data-testid={`attachment-actions-${attachment.attachment_id}`}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          data-testid="attachment-action-copy-id"
          onClick={() => void copyToClipboard(attachment.attachment_id, "Attachment ID copied")}
        >
          <Copy />
          <LocalizedText text={"Copy attachment ID"} />
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              data-testid="attachment-action-delete"
              disabled={isConfigAttachment}
              title={isConfigAttachment ? CONFIG_ATTACHMENT_HINT : undefined}
              onClick={() => onDeleteClick(attachment.attachment_id)}
            >
              <Trash2 />
              <LocalizedText text={"Delete attachment"} />
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AttachmentTableColumnsDeps {
  isAdmin: boolean;
  accessToken: string | null;
  onDeleteClick: (attachmentId: string) => void;
}

export const getAttachmentTableColumns = ({
  isAdmin,
  accessToken,
  onDeleteClick,
}: AttachmentTableColumnsDeps): ColumnDef<PolicyAttachment>[] => [
  markUiCopy(
    {
      id: "attachment_id",
      accessorKey: "attachment_id",
      meta: markUiCopy({ title: "Attachment ID" }, { title: "Attachment ID" }),
      header: "Attachment ID",
      size: 160,
      enableSorting: false,
      cell: ({ row }) => <IdCell value={row.original.attachment_id} variant="plain" />,
    },
    { header: "Attachment ID" },
  ),
  {
    id: "policy_name",
    accessorKey: "policy_name",
    meta: markUiCopy({ title: "Policy", skeleton: "badge" as const }, { title: "Policy" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Policy")} />,
    size: 180,
    enableSorting: true,
    cell: ({ row }) => <StatusBadge tone="info" label={row.original.policy_name} />,
  },
  markUiCopy(
    {
      id: "scope",
      accessorFn: (row) => row.scope ?? "",
      meta: markUiCopy({ title: "Scope", skeleton: "badge" as const }, { title: "Scope" }),
      header: "Scope",
      size: 120,
      enableSorting: false,
      cell: ({ row }) => {
        const scope = row.original.scope;
        if (!scope) {
          return <span className="text-muted-foreground">-</span>;
        }
        if (scope === "*") {
          return <StatusBadge tone="warning" label={translateMessage("Global (*)")} />;
        }
        return (
          <span className="block max-w-40 truncate text-xs" title={scope}>
            {scope}
          </span>
        );
      },
    },
    { header: "Scope" },
  ),
  markUiCopy(
    {
      id: "teams",
      meta: markUiCopy({ title: "Teams", skeleton: "chips" as const }, { title: "Teams" }),
      header: "Teams",
      size: 160,
      enableSorting: false,
      cell: ({ row }) => <ChipList values={row.original.teams ?? []} />,
    },
    { header: "Teams" },
  ),
  markUiCopy(
    {
      id: "keys",
      meta: markUiCopy({ title: "Keys", skeleton: "chips" as const }, { title: "Keys" }),
      header: "Keys",
      size: 160,
      enableSorting: false,
      cell: ({ row }) => <ChipList values={row.original.keys ?? []} />,
    },
    { header: "Keys" },
  ),
  markUiCopy(
    {
      id: "models",
      meta: markUiCopy({ title: "Models", skeleton: "chips" as const }, { title: "Models" }),
      header: "Models",
      size: 160,
      enableSorting: false,
      cell: ({ row }) => <ChipList values={row.original.models ?? []} />,
    },
    { header: "Models" },
  ),
  markUiCopy(
    {
      id: "tags",
      meta: markUiCopy({ title: "Tags", skeleton: "chips" as const }, { title: "Tags" }),
      header: "Tags",
      size: 160,
      enableSorting: false,
      cell: ({ row }) => <ChipList values={row.original.tags ?? []} />,
    },
    { header: "Tags" },
  ),
  {
    id: "priority",
    accessorFn: (row) => row.priority ?? Number.POSITIVE_INFINITY,
    meta: markUiCopy({ title: "Priority" }, { title: "Priority" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Priority")} />,
    size: 100,
    enableSorting: true,
    cell: ({ row }) =>
      row.original.priority == null ? (
        <span className="text-muted-foreground">-</span>
      ) : (
        <span className="font-mono text-xs">{row.original.priority}</span>
      ),
  },
  {
    id: "default",
    accessorFn: (row) => (row.default ? 1 : 0),
    meta: markUiCopy({ title: "Default" }, { title: "Default" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Default")} />,
    size: 100,
    enableSorting: true,
    cell: ({ row }) =>
      row.original.default ? (
        <StatusBadge
          tone="info"
          label={translateMessage("Default")}
          tooltip={translateMessage("Applied only when no non-default attachment matches")}
        />
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    id: "created_at",
    accessorFn: (row) => row.created_at ?? "",
    meta: markUiCopy({ title: "Created At" }, { title: "Created At" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Created At")} />,
    size: 150,
    enableSorting: true,
    cell: ({ row }) => <DateCell value={row.original.created_at} />,
  },
  {
    id: "actions",
    meta: { className: "text-right", headerClassName: "text-right" },
    header: () => (
      <span className="sr-only">
        <LocalizedText text={"Actions"} />
      </span>
    ),
    size: 88,
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1">
        <ImpactPopover attachment={row.original} accessToken={accessToken} />
        <AttachmentRowActions attachment={row.original} isAdmin={isAdmin} onDeleteClick={onDeleteClick} />
      </div>
    ),
  },
];
