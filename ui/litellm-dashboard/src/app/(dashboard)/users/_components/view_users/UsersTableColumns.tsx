"use client";
import { LocalizedText, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";
import { Copy, Info, KeyRound, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { UserInfo } from "@/components/networking";
import { createSelectionColumn, DataTableSortHeader } from "@/components/shared/DataTable";
import { CellTooltip, DateCell, IdentityCell, MoneyCell, StatusBadge } from "@/components/shared/table_cells";
import { Badge } from "@/components/ui/badge";
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
import { UserGroupColumnCell, UserGroupMembershipContext } from "@/components/account/UserGroupCell";
import { UserWalletCell, UserWalletTotalsCell, UserWalletContext } from "@/components/account/UserWalletCells";
import { useContext } from "react";
import { Wallet } from "lucide-react";

const SSO_ID_HINT =
  "SSO ID is the ID of the user in the SSO provider. If the user is not using SSO, this will be null.";

const SCIM_INACTIVE_HINT = "Deactivated via SCIM (external identity provider). The user's virtual keys are blocked.";

function isScimInactive(user: UserInfo): boolean {
  return (user.metadata as Record<string, unknown> | null | undefined)?.scim_active === false;
}

function UserStatusCell({ user }: { user: UserInfo }) {
  useUiLocale();
  const { members } = useContext(UserGroupMembershipContext);
  const scimInactive = isScimInactive(user);
  const inactive = scimInactive || members.get(user.user_id)?.enabled === false;
  return (
    <StatusBadge
      tone={inactive ? "error" : "success"}
      label={translateMessage(inactive ? "Inactive" : "Active")}
      tooltip={scimInactive ? SCIM_INACTIVE_HINT : undefined}
      dataTestId={`user-status-${user.user_id}`}
    />
  );
}

interface UserRowActionsProps {
  user: UserInfo;
  onUserClick: (userId: string, openInEditMode?: boolean) => void;
  onDeleteUser: (user: UserInfo) => void;
  onResetPassword: (userId: string) => void;
}

function UserRowActions({ user, onUserClick, onDeleteUser, onResetPassword }: UserRowActionsProps) {
  useUiLocale();
  const finances = useContext(UserWalletContext);
  const wallet = finances.status === "ready" ? finances.wallets.get(user.user_id) : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={translateMessage("Open user actions")}
        data-testid={`user-actions-${user.user_id}`}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground")}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {wallet && finances.onOpen && (
          <DropdownMenuItem onClick={() => finances.onOpen?.(user.user_id)}>
            <Wallet />
            <LocalizedText text="余额与流水" />
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onUserClick(user.user_id, true)} data-testid="user-action-edit">
          <Pencil />
          <LocalizedText text={"Edit user"} />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onResetPassword(user.user_id)} data-testid="user-action-reset-password">
          <KeyRound />
          <LocalizedText text={"Reset password"} />
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => void copyToClipboard(user.user_id, "User ID copied")}
          data-testid="user-action-copy"
        >
          <Copy />
          <LocalizedText text={"Copy user ID"} />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onDeleteUser(user)} data-testid="user-action-delete">
          <Trash2 />
          <LocalizedText text={"Delete user"} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface UsersTableColumnsDeps {
  includeWallets?: boolean;
  includeUserGroups?: boolean;
  possibleUIRoles: Record<string, Record<string, string>> | null;
  includeSelection: boolean;
  onUserClick: (userId: string, openInEditMode?: boolean) => void;
  onDeleteUser: (user: UserInfo) => void;
  onResetPassword: (userId: string) => void;
}

export const getUsersTableColumns = ({
  includeWallets = false,
  includeUserGroups = false,
  possibleUIRoles,
  includeSelection,
  onUserClick,
  onDeleteUser,
  onResetPassword,
}: UsersTableColumnsDeps): ColumnDef<UserInfo>[] => {
  const groupColumns: ColumnDef<UserInfo>[] = !includeUserGroups
    ? []
    : [
        {
          id: "user_group",
          header: () => <LocalizedText text="用户组" />,
          meta: markUiCopy({ title: "用户组" }, { title: "用户组" }),
          size: 180,
          enableSorting: false,
          cell: ({ row }) => <UserGroupColumnCell userId={row.original.user_id} />,
        },
      ];
  const baseColumns: ColumnDef<UserInfo>[] = [
    {
      id: "user_id",
      accessorKey: "user_id",
      meta: markUiCopy({ title: "User ID" }, { title: "User ID" }),
      header: ({ column }) => (
        <DataTableSortHeader column={column} title={translateMessage("User ID")} variant="header-cycle" />
      ),
      size: 220,
      enableSorting: true,
      cell: ({ row }) => (
        <IdentityCell
          title={row.original.user_id}
          titleClassName="font-mono text-xs text-primary"
          onClick={() => onUserClick(row.original.user_id, false)}
        />
      ),
    },
    {
      id: "user_email",
      accessorKey: "user_email",
      meta: includeWallets
        ? markUiCopy({ title: "用户" }, { title: "用户" })
        : markUiCopy({ title: "Email" }, { title: "Email" }),
      header: ({ column }) => (
        <DataTableSortHeader
          column={column}
          title={translateMessage(includeWallets ? "用户" : "Email")}
          variant="header-cycle"
        />
      ),
      size: 220,
      enableSorting: true,
      cell: ({ row }) =>
        includeWallets ? (
          <IdentityCell
            title={row.original.user_email || row.original.user_id}
            className="max-w-64"
            subtitle={row.original.user_email ? row.original.user_id : row.original.user_alias ?? undefined}
            onClick={() => onUserClick(row.original.user_id, false)}
          />
        ) : (
          <span className="block max-w-60 truncate text-sm" title={row.original.user_email ?? undefined}>
            {row.original.user_email || "-"}
          </span>
        ),
    },
    ...groupColumns,
    ...(includeWallets
      ? ([
          {
            id: "available_balance",
            header: () => <LocalizedText text="可用余额" />,
            meta: markUiCopy({ title: "可用余额", numeric: true }, { title: "可用余额" }),
            size: 160,
            enableSorting: false,
            cell: ({ row }) => <UserWalletCell userId={row.original.user_id} />,
          },
          {
            id: "wallet_totals",
            header: () => <LocalizedText text="累计入账 / 扣减" />,
            meta: markUiCopy({ title: "累计入账 / 扣减", numeric: true }, { title: "累计入账 / 扣减" }),
            size: 170,
            enableSorting: false,
            cell: ({ row }) => <UserWalletTotalsCell userId={row.original.user_id} />,
          },
        ] satisfies ColumnDef<UserInfo>[])
      : []),
    markUiCopy(
      {
        id: "status",
        meta: markUiCopy({ title: "Status", skeleton: "badge" as const }, { title: "Status" }),
        header: "Status",
        size: 110,
        enableSorting: false,
        cell: ({ row }) => <UserStatusCell user={row.original} />,
      },
      { header: "Status" },
    ),
    {
      id: "user_role",
      accessorKey: "user_role",
      meta: markUiCopy({ title: "Global Proxy Role" }, { title: "Global Proxy Role" }),
      header: ({ column }) => (
        <DataTableSortHeader column={column} title={translateMessage("Global Proxy Role")} variant="header-cycle" />
      ),
      size: 160,
      enableSorting: true,
      cell: ({ row }) => (
        <span
          className="block max-w-44 truncate text-sm"
          title={(row.original.user_role && possibleUIRoles?.[row.original.user_role]?.ui_label) || undefined}
        >
          {(row.original.user_role && possibleUIRoles?.[row.original.user_role]?.ui_label) || "-"}
        </span>
      ),
    },
    markUiCopy(
      {
        id: "user_alias",
        accessorKey: "user_alias",
        meta: markUiCopy({ title: "User Alias" }, { title: "User Alias" }),
        header: "User Alias",
        size: 150,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block max-w-40 truncate text-sm" title={row.original.user_alias ?? undefined}>
            {row.original.user_alias || "-"}
          </span>
        ),
      },
      { header: "User Alias" },
    ),
    {
      id: "spend",
      accessorKey: "spend",
      meta: markUiCopy({ title: "Spend (USD)", numeric: true }, { title: "Spend (USD)" }),
      header: ({ column }) => (
        <DataTableSortHeader column={column} title={translateMessage("Spend (USD)")} variant="header-cycle" />
      ),
      size: 130,
      enableSorting: true,
      cell: ({ row }) => <MoneyCell value={row.original.spend} decimals={2} />,
    },
    markUiCopy(
      {
        id: "max_budget",
        accessorKey: "max_budget",
        meta: markUiCopy({ title: "Budget (USD)", numeric: true }, { title: "Budget (USD)" }),
        header: "Budget (USD)",
        size: 130,
        enableSorting: false,
        cell: ({ row }) => (
          <MoneyCell value={row.original.max_budget} decimals={2} emptyText={translateMessage("Unlimited")} showZero />
        ),
      },
      { header: "Budget (USD)" },
    ),
    {
      id: "sso_user_id",
      accessorKey: "sso_user_id",
      meta: markUiCopy({ title: "SSO ID" }, { title: "SSO ID" }),
      header: () => (
        <span className="flex items-center gap-1.5">
          <LocalizedText text={"SSO ID"} />
          <CellTooltip
            content={SSO_ID_HINT}
            trigger={
              <Info className="size-3.5 shrink-0 text-muted-foreground" aria-label={translateMessage("About SSO ID")} />
            }
          />
        </span>
      ),
      size: 160,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-40 truncate font-mono text-xs" title={row.original.sso_user_id ?? undefined}>
          {row.original.sso_user_id ?? "-"}
        </span>
      ),
    },
    markUiCopy(
      {
        id: "key_count",
        accessorKey: "key_count",
        meta: markUiCopy({ title: "Virtual Keys", skeleton: "badge" as const }, { title: "Virtual Keys" }),
        header: "Virtual Keys",
        size: 120,
        enableSorting: false,
        cell: ({ row }) => {
          const keyCount = row.original.key_count;
          if (keyCount > 0) {
            return (
              <Badge
                variant="outline"
                className="whitespace-nowrap border-indigo-200 bg-indigo-50 font-normal text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
              >
                {keyCount} {keyCount === 1 ? translateMessage("Key") : translateMessage("Keys")}
              </Badge>
            );
          }
          return (
            <Badge
              variant="outline"
              className="whitespace-nowrap border-border bg-muted font-normal text-muted-foreground"
            >
              <LocalizedText text={"No Keys"} />
            </Badge>
          );
        },
      },
      { header: "Virtual Keys" },
    ),
    {
      id: "created_at",
      accessorKey: "created_at",
      meta: markUiCopy({ title: "Created At" }, { title: "Created At" }),
      header: ({ column }) => (
        <DataTableSortHeader column={column} title={translateMessage("Created At")} variant="header-cycle" />
      ),
      size: 130,
      enableSorting: true,
      cell: ({ row }) => <DateCell value={row.original.created_at} precision="date" />,
    },
    markUiCopy(
      {
        id: "updated_at",
        accessorKey: "updated_at",
        meta: markUiCopy({ title: "Updated At" }, { title: "Updated At" }),
        header: "Updated At",
        size: 130,
        enableSorting: false,
        cell: ({ row }) => <DateCell value={row.original.updated_at} precision="date" />,
      },
      { header: "Updated At" },
    ),
    {
      id: "actions",
      meta: markUiCopy(
        { title: "Actions", className: "text-right", headerClassName: "text-right", pinned: "right" as const },
        { title: "Actions" },
      ),
      header: () => (
        <span className="sr-only">
          <LocalizedText text={"Actions"} />
        </span>
      ),
      size: 60,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <UserRowActions
            user={row.original}
            onUserClick={onUserClick}
            onDeleteUser={onDeleteUser}
            onResetPassword={onResetPassword}
          />
        </div>
      ),
    },
  ];

  if (!includeSelection) {
    return baseColumns;
  }

  return [
    createSelectionColumn<UserInfo>({
      rowAriaLabel: (row) => `Select ${row.original.user_email || row.original.user_id}`,
    }),
    ...baseColumns,
  ];
};
