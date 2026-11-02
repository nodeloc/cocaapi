"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";

import { StatusBadge, type StatusTone } from "@/components/shared/table_cells";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentUpload } from "@/components/vector_store_management/types";
import { cn } from "@/lib/cva.config";
import { copyToClipboard } from "@/utils/dataUtils";

const STATUS_CONFIG: Record<DocumentUpload["status"], { tone: StatusTone; label: string }> = {
  uploading: markUiCopy({ tone: "info", label: "Uploading" }, { label: "Uploading" }),
  done: markUiCopy({ tone: "success", label: "Ready" }, { label: "Ready" }),
  error: markUiCopy({ tone: "error", label: "Error" }, { label: "Error" }),
  removed: markUiCopy({ tone: "neutral", label: "Removed" }, { label: "Removed" }),
};

function formatFileSize(bytes?: number): string {
  if (!bytes) return "-";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function DocumentRowActions({ document, onRemove }: { document: DocumentUpload; onRemove: (uid: string) => void }) {
  useUiLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={translateMessage("Open document actions")}
        data-testid={`document-actions-${document.uid}`}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          data-testid="document-action-copy"
          onClick={() => void copyToClipboard(document.uid, "Document ID copied to clipboard")}
        >
          <Copy />
          <LocalizedText text={"Copy document ID"} />
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          data-testid="document-action-remove"
          onClick={() => onRemove(document.uid)}
        >
          <Trash2 />
          <LocalizedText text={"Remove"} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface DocumentsTableColumnsDeps {
  onRemove: (uid: string) => void;
}

export const getDocumentsTableColumns = ({ onRemove }: DocumentsTableColumnsDeps): ColumnDef<DocumentUpload>[] => [
  markUiCopy(
    {
      id: "name",
      accessorKey: "name",
      meta: markUiCopy({ title: "Name" }, { title: "Name" }),
      header: "Name",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="block max-w-72 truncate text-sm" title={row.original.name}>
            {row.original.name}
          </span>
          {row.original.size ? (
            <span className="text-xs text-muted-foreground">({formatFileSize(row.original.size)})</span>
          ) : null}
        </div>
      ),
    },
    { header: "Name" },
  ),
  markUiCopy(
    {
      id: "status",
      accessorKey: "status",
      meta: markUiCopy({ title: "Status", skeleton: "badge" as const }, { title: "Status" }),
      header: "Status",
      size: 150,
      enableSorting: false,
      cell: ({ row }) => {
        const config = STATUS_CONFIG[row.original.status] ?? { tone: "neutral", label: row.original.status };
        return <StatusBadge tone={config.tone} label={localizedProperty(config, "label", config.label)} />;
      },
    },
    { header: "Status" },
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
        <DocumentRowActions document={row.original} onRemove={onRemove} />
      </div>
    ),
  },
];
