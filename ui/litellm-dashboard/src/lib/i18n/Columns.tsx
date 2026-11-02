"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { markUiCopy, uiCopySource } from "./copy";
import { LocalizedText } from "./LocalizedText";

export function localizedColumns<TData, TValue>(columns: ColumnDef<TData, TValue>[]): ColumnDef<TData, TValue>[] {
  return columns.map((column) => {
    const source = uiCopySource(column, "header");
    const nested = "columns" in column ? column.columns : undefined;
    if (!source && !nested) return column;
    const accessor = "accessorKey" in column ? column.accessorKey : undefined;
    const headerIdentity = typeof column.header === "string" ? column.header : undefined;
    const identity = column.id ?? (accessor ? String(accessor).replaceAll(".", "_") : headerIdentity);
    if (identity === undefined) return column;
    return {
      ...column,
      id: identity,
      ...(source
        ? {
            header: () => <LocalizedText text={source} />,
            ...(column.meta?.title === undefined
              ? { meta: markUiCopy({ ...column.meta, title: source }, { title: source }) }
              : {}),
          }
        : {}),
      ...(nested ? { columns: localizedColumns(nested) } : {}),
    };
  });
}
