"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnFiltersState, OnChangeFn, PaginationState } from "@tanstack/react-table";
import { ScrollText } from "lucide-react";
import { useMemo, useState } from "react";

import {
  DataTable,
  DataTableFilterDrawer,
  DataTableFilterField,
  DataTableToolbar,
} from "@/components/shared/DataTable";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { AUDIT_TABLE_NAME_DISPLAY, AuditLogEntry, getAuditLogsTableColumns } from "./AuditLogsTableColumns";

interface AuditLogsTableProps {
  data: AuditLogEntry[];
  rowCount: number;
  isLoading: boolean;
  isRefreshing: boolean;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onRefresh: () => void;
  onViewLog: (log: AuditLogEntry) => void;
}

const ALL_VALUE = "all";

const ACTION_OPTIONS = [
  markUiCopy({ label: "Created", value: "created" }, { label: "Created" }),
  markUiCopy({ label: "Updated", value: "updated" }, { label: "Updated" }),
  markUiCopy({ label: "Deleted", value: "deleted" }, { label: "Deleted" }),
  markUiCopy({ label: "Rotated", value: "rotated" }, { label: "Rotated" }),
  markUiCopy({ label: "Kill switch fired", value: "kill_switch_fired" }, { label: "Kill switch fired" }),
] as const;

const TABLE_OPTIONS = [
  markUiCopy({ label: "Keys", value: "LiteLLM_VerificationToken" }, { label: "Keys" }),
  markUiCopy({ label: "Teams", value: "LiteLLM_TeamTable" }, { label: "Teams" }),
  markUiCopy({ label: "Users", value: "LiteLLM_UserTable" }, { label: "Users" }),
  markUiCopy({ label: "Organizations", value: "LiteLLM_OrganizationTable" }, { label: "Organizations" }),
  markUiCopy({ label: "Models", value: "LiteLLM_ProxyModelTable" }, { label: "Models" }),
  markUiCopy({ label: "Agents", value: "LiteLLM_AgentsTable" }, { label: "Agents" }),
] as const;

const ACTION_FILTER_ITEMS = [
  markUiCopy({ value: ALL_VALUE, label: "All Actions" }, { label: "All Actions" }),
  ...ACTION_OPTIONS.map((option) =>
    markUiCopy({ value: option.value, label: option.label }, { label: { owner: option, field: "label" } }),
  ),
];

const TABLE_FILTER_ITEMS = [
  markUiCopy({ value: ALL_VALUE, label: "All Tables" }, { label: "All Tables" }),
  ...TABLE_OPTIONS.map((option) =>
    markUiCopy({ value: option.value, label: option.label }, { label: { owner: option, field: "label" } }),
  ),
];

const FILTER_LABELS: Record<string, string> = markUiCopy(
  {
    object_id: "Object ID",
    changed_by: "Changed By",
    team_id: "Team ID",
    key_hash: "Key Hash",
    action: "Action",
    table_name: "Table",
  },
  {
    object_id: "Object ID",
    changed_by: "Changed By",
    team_id: "Team ID",
    key_hash: "Key Hash",
    action: "Action",
    table_name: "Table",
  },
);

const formatFilterValue = (columnId: string, value: unknown): string => {
  const raw = String(value);
  if (columnId === "action") {
    return ACTION_OPTIONS.find((option) => option.value === raw)?.label ?? raw;
  }
  if (columnId === "table_name") {
    return AUDIT_TABLE_NAME_DISPLAY[raw] ?? raw;
  }
  return raw;
};

function AuditLogsEmptyState({ filtered }: { filtered: boolean }) {
  useUiLocale();
  return (
    <div className="flex flex-col items-center gap-1 py-6">
      <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-muted">
        <ScrollText className="size-5 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium text-foreground">
        {filtered ? translateMessage("No matching audit logs") : translateMessage("No audit logs yet")}
      </div>
      <div className="max-w-xs text-center text-sm text-muted-foreground">
        {filtered
          ? translateMessage("No audit log entries match your filters.")
          : translateMessage("Administrative changes to keys, teams, users, and models will appear here.")}
      </div>
    </div>
  );
}

export function AuditLogsTable({
  data,
  rowCount,
  isLoading,
  isRefreshing,
  pagination,
  onPaginationChange,
  columnFilters,
  onColumnFiltersChange,
  searchValue,
  onSearchChange,
  onRefresh,
  onViewLog,
}: AuditLogsTableProps) {
  useUiLocale();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const columns = useMemo(() => getAuditLogsTableColumns({ onViewLog }), [onViewLog]);
  const hasActiveSearch = Boolean(searchValue?.trim());

  return (
    <DataTable
      fillHeight
      data={data}
      columns={columns}
      getRowId={(row) => row.id}
      paginationMode="server"
      pagination={pagination}
      onPaginationChange={onPaginationChange}
      rowCount={rowCount}
      filterMode="server"
      columnFilters={columnFilters}
      onColumnFiltersChange={onColumnFiltersChange}
      isLoading={isLoading}
      loadingMessage={translateMessage("Loading audit logs…")}
      noDataMessage={<AuditLogsEmptyState filtered={columnFilters.length > 0 || hasActiveSearch} />}
      size="compact"
      toolbar={(table) => (
        <>
          <DataTableToolbar
            table={table}
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            searchPlaceholder={translateMessage("Search audit logs by ID…")}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            onOpenFilters={() => setFiltersOpen(true)}
            filterLabels={FILTER_LABELS}
            formatFilterValue={formatFilterValue}
            showViewOptions={false}
          />
          <DataTableFilterDrawer
            table={table}
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            title={translateMessage("Filters")}
            description={translateMessage("Narrow down audit log entries")}
          >
            {({ get, set }) => (
              <>
                <DataTableFilterField label={translateMessage("Object ID")}>
                  <Input
                    value={(get("object_id") as string) ?? ""}
                    onChange={(event) => set("object_id", event.target.value)}
                    placeholder={translateMessage("Enter object ID…")}
                  />
                </DataTableFilterField>
                <DataTableFilterField label={translateMessage("Changed By")}>
                  <Input
                    value={(get("changed_by") as string) ?? ""}
                    onChange={(event) => set("changed_by", event.target.value)}
                    placeholder={translateMessage("Enter user ID…")}
                  />
                </DataTableFilterField>
                <DataTableFilterField label={translateMessage("Team ID")}>
                  <Input
                    value={(get("team_id") as string) ?? ""}
                    onChange={(event) => set("team_id", event.target.value)}
                    placeholder={translateMessage("Enter team ID…")}
                  />
                </DataTableFilterField>
                <DataTableFilterField label={translateMessage("Key Hash")}>
                  <Input
                    value={(get("key_hash") as string) ?? ""}
                    onChange={(event) => set("key_hash", event.target.value)}
                    placeholder={translateMessage("Enter key hash…")}
                  />
                </DataTableFilterField>
                <DataTableFilterField label={translateMessage("Action")}>
                  <Select
                    items={ACTION_FILTER_ITEMS}
                    value={(get("action") as string) ?? ALL_VALUE}
                    onValueChange={(value) => set("action", value === ALL_VALUE ? undefined : value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={translateMessage("All Actions")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_VALUE}>
                        <LocalizedText text={"All Actions"} />
                      </SelectItem>
                      {ACTION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {localizedProperty(option, "label", option.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DataTableFilterField>
                <DataTableFilterField label={translateMessage("Table")}>
                  <Select
                    items={TABLE_FILTER_ITEMS}
                    value={(get("table_name") as string) ?? ALL_VALUE}
                    onValueChange={(value) => set("table_name", value === ALL_VALUE ? undefined : value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={translateMessage("All Tables")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_VALUE}>
                        <LocalizedText text={"All Tables"} />
                      </SelectItem>
                      {TABLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {localizedProperty(option, "label", option.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DataTableFilterField>
              </>
            )}
          </DataTableFilterDrawer>
        </>
      )}
    />
  );
}
