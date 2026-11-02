"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { useCustomerNative } from "@/components/account/native/CustomerNativeContext";
import { useMemo, useState } from "react";

import { useInfiniteSpendLogEndUsers } from "@/app/(dashboard)/hooks/spendLogs/useSpendLogEndUsers";
import { useInfiniteSpendLogUsers } from "@/app/(dashboard)/hooks/spendLogs/useSpendLogUsers";
import { useInfiniteKeyAliases } from "@/app/(dashboard)/hooks/keys/useKeyAliases";
import { useInfiniteModelInfo } from "@/app/(dashboard)/hooks/models/useModels";
import { DataTableFilterField } from "@/components/shared/DataTable";
import { PaginatedSearchSelect } from "@/components/shared/PaginatedSearchSelect";
import { SearchSelect, type SearchSelectOption } from "@/components/shared/SearchSelect";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { Team } from "../../key_team_helpers/key_list";
import { CREDENTIAL_LABELS, ERROR_CODE_OPTIONS } from "../constants";
import { LOG_FILTER_IDS, type LogsWindow } from "./useLogFilterLogic";

const ALL_VALUE = "all";

const STATUS_FILTER_ITEMS = [
  markUiCopy({ value: ALL_VALUE, label: "All Statuses" }, { label: "All Statuses" }),
  markUiCopy({ value: "success", label: "Success" }, { label: "Success" }),
  markUiCopy({ value: "failure", label: "Failure" }, { label: "Failure" }),
] as const;

const CACHE_FILTER_ITEMS = [
  markUiCopy({ value: ALL_VALUE, label: "All Requests" }, { label: "All Requests" }),
  markUiCopy({ value: "hit", label: "Cache Hit" }, { label: "Cache Hit" }),
  markUiCopy({ value: "miss", label: "Cache Miss" }, { label: "Cache Miss" }),
] as const;

const CREDENTIAL_FILTER_ITEMS = [
  markUiCopy({ value: ALL_VALUE, label: "All Credentials" }, { label: "All Credentials" }),
  ...Object.entries(CREDENTIAL_LABELS).map(([value, label]) => ({ value, label })),
] as const;

const SPAN_TYPE_FILTER_ITEMS = [
  markUiCopy({ value: ALL_VALUE, label: "All Types" }, { label: "All Types" }),
  markUiCopy({ value: "llm", label: "LLM" }, { label: "LLM" }),
  markUiCopy({ value: "agent", label: "Agent" }, { label: "Agent" }),
  markUiCopy({ value: "mcp", label: "MCP" }, { label: "MCP" }),
  markUiCopy({ value: "batch", label: "Batch" }, { label: "Batch" }),
] as const;
const PAGE_SIZE = 50;

const SEARCH_INPUT_REASONS: ReadonlySet<string> = new Set(["input-change", "input-clear", "clear-press"]);

const asString = (value: unknown): string => (typeof value === "string" ? value : "");
const emptyToUndefined = (value: string): string | undefined => (value === "" ? undefined : value);

function TeamFilterField({
  value,
  onChange,
  teams,
}: {
  value: string;
  onChange: (value: string | undefined) => void;
  teams: Team[];
}) {
  useUiLocale();
  const options = useMemo<SearchSelectOption[]>(
    () =>
      teams.map((team) => ({
        label: team.team_alias || team.team_id,
        value: team.team_id,
        sublabel: team.team_id,
      })),
    [teams],
  );

  return (
    <DataTableFilterField label={translateMessage("Team ID")}>
      <SearchSelect
        options={options}
        value={value}
        onValueChange={(next) => onChange(next ?? undefined)}
        placeholder={translateMessage("Search or select a team")}
        emptyText={translateMessage("No teams found")}
      />
    </DataTableFilterField>
  );
}

function KeyAliasFilterField({
  value,
  onChange,
  teamId,
}: {
  value: string;
  onChange: (value: string | undefined) => void;
  teamId: string;
}) {
  useUiLocale();
  const [search, setSearch] = useState("");
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteKeyAliases(
    PAGE_SIZE,
    emptyToUndefined(search),
    emptyToUndefined(teamId),
  );

  const options = useMemo<SearchSelectOption[]>(() => {
    const seen = new Set<string>();
    return (data?.pages ?? []).flatMap((page) =>
      page.aliases.flatMap((alias) => {
        if (!alias || seen.has(alias)) return [];
        seen.add(alias);
        return [{ label: alias, value: alias }];
      }),
    );
  }, [data]);

  return (
    <DataTableFilterField label={translateMessage("Key Alias")}>
      <PaginatedSearchSelect
        options={options}
        value={value}
        onValueChange={(next) => onChange(next ?? undefined)}
        onSearchChange={setSearch}
        onLoadMore={() => void fetchNextPage()}
        hasNextPage={hasNextPage}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        placeholder={translateMessage("Search a key alias")}
        emptyText={translateMessage("No key aliases found")}
      />
    </DataTableFilterField>
  );
}

function ModelFilterField({ value, onChange }: { value: string; onChange: (value: string | undefined) => void }) {
  useUiLocale();
  const [search, setSearch] = useState("");
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteModelInfo(
    PAGE_SIZE,
    emptyToUndefined(search),
  );

  const options = useMemo<SearchSelectOption[]>(() => {
    const seen = new Set<string>();
    return (data?.pages ?? []).flatMap((page) =>
      page.data.flatMap((model) => {
        const modelId = model.model_info?.id ?? "";
        const modelName = model.model_name ?? "";
        if (!modelId || seen.has(modelId)) return [];
        seen.add(modelId);
        return [{ label: modelName || modelId, value: modelId, sublabel: `Model ID: ${modelId}` }];
      }),
    );
  }, [data]);

  return (
    <DataTableFilterField label={translateMessage("Model")}>
      <PaginatedSearchSelect
        options={options}
        value={value}
        onValueChange={(next) => onChange(next ?? undefined)}
        onSearchChange={setSearch}
        onLoadMore={() => void fetchNextPage()}
        hasNextPage={hasNextPage}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        placeholder={translateMessage("Search a model")}
        emptyText={translateMessage("No models found")}
      />
    </DataTableFilterField>
  );
}

function UserIdFilterField({
  value,
  onChange,
  logsWindow,
}: {
  value: string;
  onChange: (value: string | undefined) => void;
  logsWindow: LogsWindow;
}) {
  useUiLocale();
  const [search, setSearch] = useState("");
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteSpendLogUsers(
    logsWindow,
    PAGE_SIZE,
    emptyToUndefined(search),
  );

  const options = useMemo<SearchSelectOption[]>(() => {
    const seen = new Set<string>();
    return (data?.pages ?? []).flatMap((page) =>
      page.data.flatMap((userId) => {
        if (!userId || seen.has(userId)) return [];
        seen.add(userId);
        return [{ label: userId, value: userId }];
      }),
    );
  }, [data]);

  return (
    <DataTableFilterField label={translateMessage("User ID")}>
      <PaginatedSearchSelect
        options={options}
        value={value}
        onValueChange={(next) => onChange(next ?? undefined)}
        onSearchChange={setSearch}
        onLoadMore={() => void fetchNextPage()}
        hasNextPage={hasNextPage}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        placeholder={translateMessage("Search an internal user")}
        emptyText={translateMessage("No users found")}
      />
    </DataTableFilterField>
  );
}

function EndUserFilterField({
  value,
  onChange,
  logsWindow,
}: {
  value: string;
  onChange: (value: string | undefined) => void;
  logsWindow: LogsWindow;
}) {
  useUiLocale();
  const [search, setSearch] = useState("");
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteSpendLogEndUsers(
    logsWindow,
    PAGE_SIZE,
    emptyToUndefined(search),
  );

  const options = useMemo<SearchSelectOption[]>(() => {
    const seen = new Set<string>();
    return (data?.pages ?? []).flatMap((page) =>
      page.data.flatMap((endUser) => {
        if (!endUser || seen.has(endUser)) return [];
        seen.add(endUser);
        return [{ label: endUser, value: endUser }];
      }),
    );
  }, [data]);

  return (
    <DataTableFilterField label={translateMessage("End User")}>
      <PaginatedSearchSelect
        options={options}
        value={value}
        onValueChange={(next) => onChange(next ?? undefined)}
        onSearchChange={setSearch}
        onLoadMore={() => void fetchNextPage()}
        hasNextPage={hasNextPage}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        placeholder={translateMessage("Search an end user")}
        emptyText={translateMessage("No end users in this time range")}
      />
    </DataTableFilterField>
  );
}

function ErrorCodeFilterField({ value, onChange }: { value: string; onChange: (value: string | undefined) => void }) {
  useUiLocale();
  const [query, setQuery] = useState("");

  const options = useMemo<SearchSelectOption[]>(() => {
    const trimmed = query.trim();
    const lowered = trimmed.toLowerCase();
    const matches = ERROR_CODE_OPTIONS.filter((option) => option.label.toLowerCase().includes(lowered));
    const isKnownCode = ERROR_CODE_OPTIONS.some(
      (option) => option.value === trimmed || option.label.toLowerCase() === lowered,
    );
    if (trimmed === "" || isKnownCode) return matches;
    return [...matches, { label: `Use custom code: ${trimmed}`, value: trimmed }];
  }, [query]);

  const selected = useMemo<SearchSelectOption | null>(() => {
    if (value === "") return null;
    return ERROR_CODE_OPTIONS.find((option) => option.value === value) ?? { label: value, value };
  }, [value]);

  const items = useMemo<SearchSelectOption[]>(() => {
    if (selected === null) return options;
    if (options.some((option) => option.value === selected.value)) return options;
    return [selected, ...options];
  }, [options, selected]);

  return (
    <DataTableFilterField label={translateMessage("Error Code")}>
      <Combobox
        items={items}
        value={selected}
        onValueChange={(item: SearchSelectOption | null) => onChange(emptyToUndefined(item?.value ?? ""))}
        onInputValueChange={(next, eventDetails) => setQuery(SEARCH_INPUT_REASONS.has(eventDetails.reason) ? next : "")}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setQuery("");
        }}
        isItemEqualToValue={(a: SearchSelectOption, b: SearchSelectOption) => a.value === b.value}
        itemToStringLabel={(item: SearchSelectOption) => item.label}
        filter={null}
      >
        <ComboboxInput
          onFocus={(event) => event.currentTarget.select()}
          placeholder={translateMessage("Select or type an error code")}
          showClear={value !== ""}
          className="w-full"
        />
        <ComboboxContent>
          <ComboboxEmpty>
            <LocalizedText text={"No error codes found"} />
          </ComboboxEmpty>
          <ComboboxList data-testid="error-code-filter-list">
            {(item: SearchSelectOption) => (
              <ComboboxItem key={item.value} value={item}>
                {localizedProperty(item, "label", item.label)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </DataTableFilterField>
  );
}

interface RequestLogsFiltersProps {
  get: (columnId: string) => unknown;
  set: (columnId: string, value: unknown) => void;
  teams: Team[];
  logsWindow: LogsWindow;
}

export function RequestLogsFilters({ get, set, teams, logsWindow }: RequestLogsFiltersProps) {
  useUiLocale();
  const customer = useCustomerNative();
  const valueOf = (id: string): string => asString(get(id));
  const setter = (id: string) => (next: string | undefined) => set(id, next);

  return (
    <>
      {!customer && (
        <>
          <TeamFilterField
            value={valueOf(LOG_FILTER_IDS.TEAM_ID)}
            onChange={setter(LOG_FILTER_IDS.TEAM_ID)}
            teams={teams}
          />

          <DataTableFilterField label={translateMessage("Span Type")}>
            <Select
              items={SPAN_TYPE_FILTER_ITEMS}
              value={valueOf(LOG_FILTER_IDS.SPAN_TYPE) === "" ? ALL_VALUE : valueOf(LOG_FILTER_IDS.SPAN_TYPE)}
              onValueChange={(next) =>
                set(LOG_FILTER_IDS.SPAN_TYPE, next === null || next === ALL_VALUE ? undefined : next)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={translateMessage("All Types")} />
              </SelectTrigger>
              <SelectContent>
                {SPAN_TYPE_FILTER_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {localizedProperty(item, "label", item.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DataTableFilterField>
        </>
      )}
      <DataTableFilterField label={translateMessage("Status")}>
        <Select
          items={STATUS_FILTER_ITEMS}
          value={valueOf(LOG_FILTER_IDS.STATUS) === "" ? ALL_VALUE : valueOf(LOG_FILTER_IDS.STATUS)}
          onValueChange={(next) => set(LOG_FILTER_IDS.STATUS, next === null || next === ALL_VALUE ? undefined : next)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={translateMessage("All Statuses")} />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {localizedProperty(item, "label", item.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataTableFilterField>

      {!customer && (
        <>
          <DataTableFilterField label={translateMessage("Cache")}>
            <Select
              items={CACHE_FILTER_ITEMS}
              value={valueOf(LOG_FILTER_IDS.CACHE_STATUS) === "" ? ALL_VALUE : valueOf(LOG_FILTER_IDS.CACHE_STATUS)}
              onValueChange={(next) =>
                set(LOG_FILTER_IDS.CACHE_STATUS, next === null || next === ALL_VALUE ? undefined : next)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={translateMessage("All Requests")} />
              </SelectTrigger>
              <SelectContent>
                {CACHE_FILTER_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {localizedProperty(item, "label", item.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DataTableFilterField>

          <DataTableFilterField label={translateMessage("Credential")}>
            <Select
              items={CREDENTIAL_FILTER_ITEMS}
              value={valueOf(LOG_FILTER_IDS.CREDENTIAL) === "" ? ALL_VALUE : valueOf(LOG_FILTER_IDS.CREDENTIAL)}
              onValueChange={(next) =>
                set(LOG_FILTER_IDS.CREDENTIAL, next === null || next === ALL_VALUE ? undefined : next)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={translateMessage("All Credentials")} />
              </SelectTrigger>
              <SelectContent>
                {CREDENTIAL_FILTER_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {localizedProperty(item, "label", item.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DataTableFilterField>

          <KeyAliasFilterField
            value={valueOf(LOG_FILTER_IDS.KEY_ALIAS)}
            onChange={setter(LOG_FILTER_IDS.KEY_ALIAS)}
            teamId={valueOf(LOG_FILTER_IDS.TEAM_ID)}
          />

          <UserIdFilterField
            value={valueOf(LOG_FILTER_IDS.USER_ID)}
            onChange={setter(LOG_FILTER_IDS.USER_ID)}
            logsWindow={logsWindow}
          />

          <EndUserFilterField
            value={valueOf(LOG_FILTER_IDS.END_USER)}
            onChange={setter(LOG_FILTER_IDS.END_USER)}
            logsWindow={logsWindow}
          />

          <ErrorCodeFilterField
            value={valueOf(LOG_FILTER_IDS.ERROR_CODE)}
            onChange={setter(LOG_FILTER_IDS.ERROR_CODE)}
          />

          <DataTableFilterField label={translateMessage("Error Message")}>
            <Input
              value={valueOf(LOG_FILTER_IDS.ERROR_MESSAGE)}
              onChange={(event) => set(LOG_FILTER_IDS.ERROR_MESSAGE, emptyToUndefined(event.target.value))}
              placeholder={translateMessage("Enter error message…")}
            />
          </DataTableFilterField>

          <DataTableFilterField label={translateMessage("Key Hash")}>
            <Input
              value={valueOf(LOG_FILTER_IDS.KEY_HASH)}
              onChange={(event) => set(LOG_FILTER_IDS.KEY_HASH, emptyToUndefined(event.target.value))}
              placeholder={translateMessage("Enter key hash…")}
            />
          </DataTableFilterField>

          <DataTableFilterField label={translateMessage("Session ID")}>
            <Input
              value={valueOf(LOG_FILTER_IDS.SESSION_ID)}
              onChange={(event) => set(LOG_FILTER_IDS.SESSION_ID, emptyToUndefined(event.target.value))}
              placeholder={translateMessage("Enter session ID…")}
            />
          </DataTableFilterField>
        </>
      )}
      <ModelFilterField value={valueOf(LOG_FILTER_IDS.MODEL_ID)} onChange={setter(LOG_FILTER_IDS.MODEL_ID)} />

      <DataTableFilterField label={translateMessage("Public model / search tool")}>
        <Input
          value={valueOf(LOG_FILTER_IDS.PUBLIC_MODEL_OR_SEARCH_TOOL)}
          onChange={(event) => set(LOG_FILTER_IDS.PUBLIC_MODEL_OR_SEARCH_TOOL, emptyToUndefined(event.target.value))}
          placeholder={translateMessage("Enter public model or search tool…")}
        />
      </DataTableFilterField>
    </>
  );
}
