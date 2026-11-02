import { createTable, getCoreRowModel, type ColumnDef } from "@tanstack/react-table";
import { expect, it } from "vitest";
import { markUiCopy } from "./copy";
import { localizedColumns } from "./Columns";

type Row = { metrics: { spend: number } };
function identities(columns: ColumnDef<Row>[]) {
  return createTable({
    data: [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {},
    onStateChange: () => {},
    renderFallbackValue: null,
  })
    .getAllFlatColumns()
    .map((column) => column.id);
}

it("preserves real table IDs for dotted accessors, explicit IDs, accessor functions and nested groups", () => {
  const columns: ColumnDef<Row>[] = [
    markUiCopy({ accessorKey: "metrics.spend", header: "Spend" }, { header: "Spend" }),
    markUiCopy({ id: "explicit.id", accessorKey: "metrics.spend", header: "Cost" }, { header: "Cost" }),
    markUiCopy(
      {
        header: "Totals",
        columns: [markUiCopy({ header: "Amount", accessorFn: (row: Row) => row.metrics.spend }, { header: "Amount" })],
      },
      { header: "Totals" },
    ),
  ];
  expect(identities(localizedColumns(columns))).toEqual(identities(columns));
  expect(columns[0].header).toBe("Spend");
});
