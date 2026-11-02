"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import { Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTION_ITEMS } from "./action_options";

interface Pattern {
  id: string;
  type: "prebuilt" | "custom";
  name: string;
  display_name?: string;
  pattern?: string;
  action: "BLOCK" | "MASK";
}

interface PatternTableProps {
  patterns: Pattern[];
  onActionChange: (id: string, action: "BLOCK" | "MASK") => void;
  onRemove: (id: string) => void;
}

const PatternTable: React.FC<PatternTableProps> = ({ patterns, onActionChange, onRemove }) => {
  useUiLocale();
  const columns: ColumnDef<Pattern>[] = [
    markUiCopy(
      {
        header: "Type",
        accessorKey: "type",
        size: 100,
        cell: ({ row }) => (
          <Badge variant="secondary">
            {row.original.type === "prebuilt" ? translateMessage("Prebuilt") : translateMessage("Custom")}
          </Badge>
        ),
      },
      { header: "Type" },
    ),
    markUiCopy(
      {
        header: "Pattern name",
        accessorKey: "name",
        cell: ({ row }) => row.original.display_name || row.original.name,
      },
      { header: "Pattern name" },
    ),
    markUiCopy(
      {
        header: "Regex pattern",
        accessorKey: "pattern",
        cell: ({ row }) =>
          row.original.pattern ? (
            <code className="rounded-sm bg-muted px-1 py-0.5 text-xs">{row.original.pattern.substring(0, 40)}...</code>
          ) : (
            "-"
          ),
      },
      { header: "Regex pattern" },
    ),
    markUiCopy(
      {
        header: "Action",
        accessorKey: "action",
        size: 150,
        cell: ({ row }) => (
          <Select
            items={ACTION_ITEMS}
            value={row.original.action}
            onValueChange={(value: string | null) =>
              value && onActionChange(row.original.id, value as "BLOCK" | "MASK")
            }
          >
            <SelectTrigger size="sm" className="w-[120px]" aria-label={translateMessage("Action")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {localizedProperty(item, "label", item.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      },
      { header: "Action" },
    ),
    {
      header: "",
      id: "actions",
      size: 100,
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => onRemove(row.original.id)}>
          <Trash2 />
          <LocalizedText text={"Delete"} />
        </Button>
      ),
    },
  ];

  if (patterns.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        <LocalizedText text={"No patterns added."} />
      </div>
    );
  }

  return <DataTable data={patterns} columns={columns} getRowId={(row) => row.id} size="compact" />;
};

export default PatternTable;
