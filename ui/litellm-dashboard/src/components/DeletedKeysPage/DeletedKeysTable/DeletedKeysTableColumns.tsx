"use client";
import { markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";

import { DataTableSortHeader } from "@/components/shared/DataTable";
import { DateCell, IdCell, IdentityCell, MoneyCell } from "@/components/shared/table_cells";
import { DeletedKeyResponse } from "@/app/(dashboard)/hooks/keys/useKeys";
import { userDetailHref } from "@/utils/entityLinks";

function TruncatedTextCell({ value }: { value: string | null | undefined }) {
  useUiLocale();
  if (!value) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <span className="block max-w-60 truncate" title={value}>
      {value}
    </span>
  );
}

function UserLinkCell({ userId }: { userId: string | null | undefined }) {
  useUiLocale();
  if (!userId) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <span className="block max-w-60" title={userId}>
      <IdentityCell title={userId} titleClassName="font-normal" href={userDetailHref(userId)} />
    </span>
  );
}

export const getDeletedKeysTableColumns = (): ColumnDef<DeletedKeyResponse>[] => [
  markUiCopy(
    {
      id: "token",
      accessorKey: "token",
      meta: markUiCopy({ title: "Key ID" }, { title: "Key ID" }),
      header: "Key ID",
      size: 150,
      enableSorting: false,
      cell: ({ row }) => <IdCell value={row.original.token} variant="plain" />,
    },
    { header: "Key ID" },
  ),
  markUiCopy(
    {
      id: "key_alias",
      accessorKey: "key_alias",
      meta: markUiCopy({ title: "Key Alias" }, { title: "Key Alias" }),
      header: "Key Alias",
      size: 150,
      enableSorting: false,
      cell: ({ row }) => {
        const value = row.original.key_alias;
        if (!value) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <span className="block max-w-60 truncate font-mono text-xs" title={value}>
            {value}
          </span>
        );
      },
    },
    { header: "Key Alias" },
  ),
  markUiCopy(
    {
      id: "team_alias",
      accessorKey: "team_alias",
      meta: markUiCopy({ title: "Team Alias" }, { title: "Team Alias" }),
      header: "Team Alias",
      size: 120,
      enableSorting: false,
      cell: ({ row }) => <TruncatedTextCell value={row.original.team_alias} />,
    },
    { header: "Team Alias" },
  ),
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
      id: "user_email",
      accessorKey: "user_email",
      meta: markUiCopy({ title: "User Email" }, { title: "User Email" }),
      header: "User Email",
      size: 160,
      enableSorting: false,
      cell: ({ row }) => <TruncatedTextCell value={row.original.user_email} />,
    },
    { header: "User Email" },
  ),
  markUiCopy(
    {
      id: "user_id",
      accessorKey: "user_id",
      meta: markUiCopy({ title: "User ID" }, { title: "User ID" }),
      header: "User ID",
      size: 120,
      enableSorting: false,
      cell: ({ row }) => <UserLinkCell userId={row.original.user_id} />,
    },
    { header: "User ID" },
  ),
  {
    id: "created_at",
    accessorKey: "created_at",
    meta: markUiCopy({ title: "Created At" }, { title: "Created At" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Created At")} />,
    size: 120,
    enableSorting: true,
    cell: ({ row }) => <DateCell value={row.original.created_at} precision="date" />,
  },
  markUiCopy(
    {
      id: "created_by",
      accessorKey: "created_by",
      meta: markUiCopy({ title: "Created By" }, { title: "Created By" }),
      header: "Created By",
      size: 120,
      enableSorting: false,
      cell: ({ row }) => <UserLinkCell userId={row.original.created_by} />,
    },
    { header: "Created By" },
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
      cell: ({ row }) => <UserLinkCell userId={row.original.deleted_by} />,
    },
    { header: "Deleted By" },
  ),
];
