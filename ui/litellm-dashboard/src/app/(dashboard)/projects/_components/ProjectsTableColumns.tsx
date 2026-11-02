"use client";
import { markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { ColumnDef } from "@tanstack/react-table";
import { LayersIcon } from "lucide-react";

import { ProjectResponse } from "@/app/(dashboard)/hooks/projects/useProjects";
import { DataTableSortHeader } from "@/components/shared/DataTable";
import { CellTooltip, DateCell, IdentityCell, StatusBadge } from "@/components/shared/table_cells";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function ProjectTeamCell({
  project,
  teamAliasMap,
  isTeamsLoading,
}: {
  project: ProjectResponse;
  teamAliasMap: Map<string, string>;
  isTeamsLoading: boolean;
}) {
  useUiLocale();
  if (!project.team_id) return <span className="text-sm">—</span>;
  const alias = teamAliasMap.get(project.team_id);
  if (alias) {
    return (
      <span className="block max-w-60 truncate text-sm" title={alias}>
        {alias}
      </span>
    );
  }
  if (isTeamsLoading) return <Skeleton className="h-3.5 w-24" />;
  return (
    <span className="block max-w-60 truncate font-mono text-xs" title={project.team_id}>
      {project.team_id}
    </span>
  );
}

function ProjectModelsCell({ project }: { project: ProjectResponse }) {
  useUiLocale();
  const models = project.models ?? [];
  return (
    <CellTooltip
      content={models.length > 0 ? models.join(", ") : "No models"}
      trigger={
        <Badge variant="outline" className="cursor-default gap-1.5 font-normal">
          <LayersIcon className="size-3.5" />
          {models.length}
        </Badge>
      }
    />
  );
}

interface ProjectsTableColumnsDeps {
  onProjectClick: (projectId: string) => void;
  teamAliasMap: Map<string, string>;
  isTeamsLoading: boolean;
}

export const getProjectsTableColumns = ({
  onProjectClick,
  teamAliasMap,
  isTeamsLoading,
}: ProjectsTableColumnsDeps): ColumnDef<ProjectResponse>[] => [
  markUiCopy(
    {
      id: "project_id",
      accessorKey: "project_id",
      meta: markUiCopy({ title: "ID" }, { title: "ID" }),
      header: "ID",
      size: 190,
      enableSorting: false,
      cell: ({ row }) => (
        <IdentityCell
          title={row.original.project_id}
          titleClassName="font-mono text-xs font-normal"
          onClick={() => onProjectClick(row.original.project_id)}
        />
      ),
    },
    { header: "ID" },
  ),
  {
    id: "project_alias",
    accessorFn: (row) => row.project_alias ?? "",
    meta: markUiCopy({ title: "Name" }, { title: "Name" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Name")} />,
    size: 200,
    enableSorting: true,
    cell: ({ row }) => (
      <span className="block max-w-60 truncate text-sm font-medium" title={row.original.project_alias ?? undefined}>
        {row.original.project_alias ?? "—"}
      </span>
    ),
  },
  {
    id: "team",
    accessorFn: (row) => teamAliasMap.get(row.team_id ?? "") ?? "",
    meta: markUiCopy({ title: "Team" }, { title: "Team" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Team")} />,
    size: 180,
    enableSorting: true,
    cell: ({ row }) => (
      <ProjectTeamCell project={row.original} teamAliasMap={teamAliasMap} isTeamsLoading={isTeamsLoading} />
    ),
  },
  markUiCopy(
    {
      id: "models",
      meta: markUiCopy({ title: "Models", skeleton: "badge" as const }, { title: "Models" }),
      header: "Models",
      size: 110,
      enableSorting: false,
      cell: ({ row }) => <ProjectModelsCell project={row.original} />,
    },
    { header: "Models" },
  ),
  markUiCopy(
    {
      id: "status",
      accessorKey: "blocked",
      meta: markUiCopy({ title: "Status", skeleton: "badge" as const }, { title: "Status" }),
      header: "Status",
      size: 110,
      enableSorting: false,
      cell: ({ row }) => (
        <StatusBadge
          tone={row.original.blocked ? "error" : "success"}
          label={row.original.blocked ? translateMessage("Blocked") : translateMessage("Active")}
        />
      ),
    },
    { header: "Status" },
  ),
  {
    id: "created_at",
    accessorKey: "created_at",
    sortingFn: "datetime",
    meta: markUiCopy({ title: "Created" }, { title: "Created" }),
    header: ({ column }) => <DataTableSortHeader column={column} title={translateMessage("Created")} />,
    size: 140,
    enableSorting: true,
    cell: ({ row }) => <DateCell value={row.original.created_at} precision="date" />,
  },
  markUiCopy(
    {
      id: "updated_at",
      accessorKey: "updated_at",
      meta: markUiCopy({ title: "Updated" }, { title: "Updated" }),
      header: "Updated",
      size: 140,
      enableSorting: false,
      cell: ({ row }) => <DateCell value={row.original.updated_at} precision="date" />,
    },
    { header: "Updated" },
  ),
];
