"use client";
import { markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";

import { DataTableSortHeader } from "@/components/shared/DataTable";
import { DateCell, IdCell, IdentityCell, ModelsCell, MoneyCell } from "@/components/shared/table_cells";
import { DeletedTeam } from "@/app/(dashboard)/hooks/teams/useTeams";
import { orgDetailHref, userDetailHref } from "@/utils/entityLinks";

function EntityCell({ value, href }: { value: string | null | undefined; href: string | undefined }) {
  useUiLocale();
  if (!value) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <span className="block max-w-60" title={value}>
      <IdentityCell title={value} titleClassName="font-normal" href={href} />
    </span>
  );
}

export const getDeletedTeamsTableColumns = (): ColumnDef<DeletedTeam>[] => [
  markUiCopy(
    {
      id: "team_alias",
      accessorKey: "team_alias",
      meta: markUiCopy({ title: "Team Name" }, { title: "Team Name" }),
      header: "Team Name",
      size: 150,
      enableSorting: false,
      cell: ({ row }) => {
        const value = row.original.team_alias;
        if (!value) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <span className="block max-w-60 truncate font-medium" title={value}>
            {value}
          </span>
        );
      },
    },
    { header: "Team Name" },
  ),
  markUiCopy(
    {
      id: "team_id",
      accessorKey: "team_id",
      meta: markUiCopy({ title: "Team ID" }, { title: "Team ID" }),
      header: "Team ID",
      size: 150,
      enableSorting: false,
      cell: ({ row }) => <IdCell value={row.original.team_id} variant="plain" />,
    },
    { header: "Team ID" },
  ),
  {
    id: "created_at",
    accessorKey: "created_at",
    meta: markUiCopy({ title: "Created" }, { title: "Created" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Created")} />,
    size: 120,
    enableSorting: true,
    cell: ({ row }) => <DateCell value={row.original.created_at} precision="date" />,
  },
  {
    id: "spend",
    accessorKey: "spend",
    meta: markUiCopy({ title: "Spend (USD)", numeric: true }, { title: "Spend (USD)" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Spend (USD)")} />,
    size: 100,
    enableSorting: true,
    cell: ({ row }) => <MoneyCell value={row.original.spend} decimals={4} />,
  },
  markUiCopy(
    {
      id: "max_budget",
      accessorKey: "max_budget",
      meta: markUiCopy({ title: "Budget (USD)", numeric: true }, { title: "Budget (USD)" }),
      header: "Budget (USD)",
      size: 110,
      enableSorting: false,
      cell: ({ row }) => (
        <MoneyCell value={row.original.max_budget} decimals={0} emptyText={translateMessage("Unlimited")} showZero />
      ),
    },
    { header: "Budget (USD)" },
  ),
  markUiCopy(
    {
      id: "models",
      accessorKey: "models",
      meta: markUiCopy({ title: "Models", skeleton: "chips" as const }, { title: "Models" }),
      header: "Models",
      size: 200,
      enableSorting: false,
      cell: ({ row }) => <ModelsCell models={row.original.models} />,
    },
    { header: "Models" },
  ),
  markUiCopy(
    {
      id: "organization_id",
      accessorKey: "organization_id",
      meta: markUiCopy({ title: "Organization" }, { title: "Organization" }),
      header: "Organization",
      size: 150,
      enableSorting: false,
      cell: ({ row }) => {
        const orgId = row.original.organization_id;
        return <EntityCell value={orgId} href={orgId ? orgDetailHref(orgId) : undefined} />;
      },
    },
    { header: "Organization" },
  ),
  {
    id: "deleted_at",
    accessorKey: "deleted_at",
    meta: markUiCopy({ title: "Deleted At" }, { title: "Deleted At" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Deleted At")} />,
    size: 120,
    enableSorting: true,
    cell: ({ row }) => <DateCell value={row.original.deleted_at} precision="date" />,
  },
  markUiCopy(
    {
      id: "deleted_by",
      accessorKey: "deleted_by",
      meta: markUiCopy({ title: "Deleted By" }, { title: "Deleted By" }),
      header: "Deleted By",
      size: 120,
      enableSorting: false,
      cell: ({ row }) => {
        const deletedBy = row.original.deleted_by;
        return <EntityCell value={deletedBy} href={deletedBy ? userDetailHref(deletedBy) : undefined} />;
      },
    },
    { header: "Deleted By" },
  ),
];
