"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnFiltersState, OnChangeFn, PaginationState, SortingState } from "@tanstack/react-table";
import { Search, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import { useCustomerNative } from "@/components/account/native/CustomerNativeContext";

import { ModelData } from "@/components/model_dashboard/types";
import {
  DataTable,
  DataTableFilterDrawer,
  DataTableFilterField,
  DataTableToolbar,
} from "@/components/shared/DataTable";
import { SearchSelect } from "@/components/shared/SearchSelect";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { ToolbarSeparator } from "@/components/shared/ToolbarSeparator";
import { cn } from "@/lib/cva.config";

import {
  ACCESS_GROUPS_COLUMN_ID,
  getModelsTableColumns,
  MODEL_NAME_COLUMN_ID,
  STATUS_COLUMN_ID,
} from "./ModelsTableColumns";

export type ModelViewMode = "all" | "current_team";

export const PERSONAL_TEAM_VALUE = "personal";
export const ALL_MODEL_GROUPS_VALUE = "all";
export const WILDCARD_MODEL_GROUP_VALUE = "wildcard";

const MODEL_TABLE_BODY_HEIGHT = 600;
const ALL_PROXY_MODELS_LABEL = "All Proxy Models";

const FILTER_LABELS: Record<string, string> = markUiCopy(
  {
    [MODEL_NAME_COLUMN_ID]: "Public Model Name",
    [ACCESS_GROUPS_COLUMN_ID]: "Model Access Group",
  },
  { [MODEL_NAME_COLUMN_ID]: "Public Model Name", [ACCESS_GROUPS_COLUMN_ID]: "Model Access Group" },
);

const VIEW_MODE_LABELS: Record<ModelViewMode, string> = markUiCopy(
  {
    current_team: "Current Team Models",
    all: ALL_PROXY_MODELS_LABEL,
  },
  { current_team: "Current Team Models" },
);

export interface ModelsTableTeamOption {
  value: string;
  label: string;
}

interface AllModelsTableProps {
  data: ModelData[];
  rowCount: number;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
  onResetFilters: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  teamOptions: ModelsTableTeamOption[];
  selectedTeamValue: string;
  onTeamChange: (value: string) => void;
  isLoadingTeams: boolean;
  viewMode: ModelViewMode;
  onViewModeChange: (viewMode: ModelViewMode) => void;
  onOpenModelSettings: () => void;
  availableModelGroups: string[];
  availableModelAccessGroups: string[];
  userRole: string;
  userID: string;
  isViewOnly: boolean;
  onModelIdClick: (modelId: string) => void;
  onTeamIdClick: (teamId: string) => void;
  onDeleteClick: (modelId: string) => void;
  onTogglePauseClick: (modelId: string, blocked: boolean) => void | Promise<void>;
  pausingModelId: string | null;
  credentialLabels?: ReadonlyMap<string, string>;
}

function EmptyState() {
  useUiLocale();
  return (
    <div className="flex flex-col items-center gap-1 py-6">
      <div className="mb-1 flex size-11 items-center justify-center rounded-xl bg-muted">
        <Search className="size-5 text-muted-foreground" />
      </div>
      <div className="text-base font-semibold text-foreground">
        <LocalizedText text={"No models found"} />
      </div>
      <div className="max-w-80 text-sm text-muted-foreground">
        <LocalizedText text={"No models match your search or filters. Try resetting them."} />
      </div>
    </div>
  );
}

export function AllModelsTable({
  data,
  rowCount,
  isLoading,
  isRefreshing,
  onRefresh,
  sorting,
  onSortingChange,
  pagination,
  onPaginationChange,
  columnFilters,
  onColumnFiltersChange,
  onResetFilters,
  searchValue,
  onSearchChange,
  teamOptions,
  selectedTeamValue,
  onTeamChange,
  isLoadingTeams,
  viewMode,
  onViewModeChange,
  onOpenModelSettings,
  availableModelGroups,
  availableModelAccessGroups,
  userRole,
  userID,
  isViewOnly,
  onModelIdClick,
  onTeamIdClick,
  onDeleteClick,
  onTogglePauseClick,
  pausingModelId,
  credentialLabels,
}: AllModelsTableProps) {
  useUiLocale();
  const customer = useCustomerNative();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const columns = useMemo(() => {
    const columnDeps = {
      userRole,
      userID,
      isViewOnly,
      onModelIdClick,
      onTeamIdClick,
      onDeleteClick,
      onTogglePauseClick,
      pausingModelId,
      credentialLabels,
    };
    return getModelsTableColumns(columnDeps).filter(
      (column) =>
        !customer ||
        ![
          "litellm_credential_name",
          "model_info_created_by",
          "model_info_updated_at",
          "model_info_team_id",
          "model_info_access_groups",
          "model_info_db_model",
          "actions",
        ].includes(String(column.id)),
    );
  }, [
    userRole,
    userID,
    isViewOnly,
    onModelIdClick,
    onTeamIdClick,
    onDeleteClick,
    onTogglePauseClick,
    pausingModelId,
    credentialLabels,
    customer,
  ]);

  const modelGroupOptions = useMemo(
    () => [
      { label: ALL_PROXY_MODELS_LABEL, value: ALL_MODEL_GROUPS_VALUE },
      markUiCopy({ label: "Wildcard Models (*)", value: WILDCARD_MODEL_GROUP_VALUE }, { label: "Wildcard Models (*)" }),
      ...availableModelGroups.map((group) => ({ label: group, value: group })),
    ],
    [availableModelGroups],
  );

  const accessGroupOptions = useMemo(
    () => [
      markUiCopy(
        { label: "All Model Access Groups", value: ALL_MODEL_GROUPS_VALUE },
        { label: "All Model Access Groups" },
      ),
      ...availableModelAccessGroups.map((accessGroup) => ({ label: accessGroup, value: accessGroup })),
    ],
    [availableModelAccessGroups],
  );

  const formatFilterValue = (columnId: string, value: unknown): string => {
    const raw = String(value);
    if (columnId === MODEL_NAME_COLUMN_ID && raw === WILDCARD_MODEL_GROUP_VALUE) {
      return "Wildcard Models (*)";
    }
    return raw;
  };

  const selectedTeamLabel =
    teamOptions.find((option) => option.value === selectedTeamValue)?.label ?? teamOptions[0]?.label ?? "";

  return (
    <DataTable
      data={data}
      columns={columns}
      getRowId={(row, index) => row.model_info?.id ?? String(index)}
      sortingMode="server"
      sorting={sorting}
      onSortingChange={onSortingChange}
      enableSortingRemoval
      paginationMode="server"
      pagination={pagination}
      onPaginationChange={onPaginationChange}
      rowCount={rowCount}
      pageSizeOptions={[10, 25, 50]}
      filterMode="server"
      columnFilters={columnFilters}
      onColumnFiltersChange={onColumnFiltersChange}
      defaultColumnVisibility={{ [STATUS_COLUMN_ID]: false }}
      enableColumnResizing
      maxBodyHeight={MODEL_TABLE_BODY_HEIGHT}
      isLoading={isLoading}
      loadingMessage={translateMessage("Loading models…")}
      noDataMessage={<EmptyState />}
      size="compact"
      toolbar={(table) => (
        <>
          <DataTableToolbar
            table={table}
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            searchPlaceholder={translateMessage("Search model names…")}
            onOpenFilters={() => setFiltersOpen(true)}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            filterLabels={FILTER_LABELS}
            formatFilterValue={formatFilterValue}
          >
            <Select value={selectedTeamValue} onValueChange={(value) => onTeamChange(String(value))}>
              <SelectTrigger
                size="sm"
                aria-label={translateMessage("Current team")}
                data-testid="models-team-select"
                className="gap-2 bg-secondary"
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    selectedTeamValue === PERSONAL_TEAM_VALUE ? "bg-info" : "bg-success",
                  )}
                />
                <span className="text-muted-foreground">
                  <LocalizedText text={"Team"} />
                </span>
                <span className="truncate font-semibold">{selectedTeamLabel}</span>
              </SelectTrigger>
              <SelectContent>
                {teamOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    disabled={isLoadingTeams}
                    className="[&>div]:min-w-0"
                  >
                    <span
                      data-slot="select-item-label"
                      className="min-w-0 truncate"
                      title={localizedProperty(option, "label", option.label)}
                    >
                      {localizedProperty(option, "label", option.label)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={viewMode} onValueChange={(value) => onViewModeChange(value as ModelViewMode)}>
              <SelectTrigger
                size="sm"
                aria-label={translateMessage("View")}
                data-testid="models-view-select"
                className="gap-2"
              >
                <span className="text-muted-foreground">
                  <LocalizedText text={"View"} />
                </span>
                <span className="truncate">
                  {localizedProperty(VIEW_MODE_LABELS, viewMode, VIEW_MODE_LABELS[viewMode])}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_team">{VIEW_MODE_LABELS.current_team}</SelectItem>
                <SelectItem value="all">{VIEW_MODE_LABELS.all}</SelectItem>
              </SelectContent>
            </Select>

            <ToolbarSeparator className="mx-0.5" />

            <Button
              variant="outline"
              size="icon-sm"
              aria-label={translateMessage("Model Settings")}
              title={translateMessage("Model Settings")}
              data-testid="models-settings-trigger"
              onClick={onOpenModelSettings}
            >
              <Settings />
            </Button>
          </DataTableToolbar>
          <DataTableFilterDrawer
            table={table}
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            title={translateMessage("Filters")}
            description={translateMessage("Narrow down models + endpoints")}
            resetLabel="Reset Filters"
            onReset={onResetFilters}
          >
            {({ get, set }) => (
              <>
                <DataTableFilterField label={translateMessage("Public Model Name")}>
                  <SearchSelect
                    options={modelGroupOptions}
                    value={(get(MODEL_NAME_COLUMN_ID) as string) ?? ALL_MODEL_GROUPS_VALUE}
                    onValueChange={(value) =>
                      set(MODEL_NAME_COLUMN_ID, value === ALL_MODEL_GROUPS_VALUE ? undefined : value ?? undefined)
                    }
                    placeholder={translateMessage("Filter by Public Model Name")}
                    emptyText={translateMessage("No models found")}
                  />
                </DataTableFilterField>
                <DataTableFilterField label={translateMessage("Model Access Group")}>
                  <SearchSelect
                    options={accessGroupOptions}
                    value={(get(ACCESS_GROUPS_COLUMN_ID) as string) ?? ALL_MODEL_GROUPS_VALUE}
                    onValueChange={(value) =>
                      set(ACCESS_GROUPS_COLUMN_ID, value === ALL_MODEL_GROUPS_VALUE ? undefined : value ?? undefined)
                    }
                    placeholder={translateMessage("Filter by Model Access Group")}
                    emptyText={translateMessage("No model access groups found")}
                  />
                </DataTableFilterField>
              </>
            )}
          </DataTableFilterDrawer>
        </>
      )}
    />
  );
}
