"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";

import { Waypoints } from "lucide-react";
import { useMemo } from "react";

import { DataTable } from "@/components/shared/DataTable";

import { getPassThroughEndpointsTableColumns } from "./PassThroughEndpointsTableColumns";
import type { passThroughItem } from "./PassThroughSettings";

interface PassThroughEndpointsTableProps {
  endpoints: passThroughItem[];
  isLoading: boolean;
  onEndpointClick: (endpointId: string) => void;
  onDeleteClick: (endpointId: string) => void;
}

function EmptyState() {
  useUiLocale();
  return (
    <div className="flex flex-col items-center gap-1 py-6">
      <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-muted">
        <Waypoints className="size-5 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium text-foreground">
        <LocalizedText text={"No pass-through endpoints configured"} />
      </div>
      <div className="text-sm text-muted-foreground">
        <LocalizedText text={"Add a pass-through endpoint to route custom paths."} />
      </div>
    </div>
  );
}

export function PassThroughEndpointsTable({
  endpoints,
  isLoading,
  onEndpointClick,
  onDeleteClick,
}: PassThroughEndpointsTableProps) {
  useUiLocale();
  const columns = useMemo(
    () => getPassThroughEndpointsTableColumns({ onEndpointClick, onDeleteClick }),
    [onEndpointClick, onDeleteClick],
  );

  return (
    <DataTable
      data={endpoints}
      paginationMode="client"
      columns={columns}
      getRowId={(endpoint, index) => endpoint.id || endpoint.path || String(index)}
      isLoading={isLoading}
      loadingMessage={translateMessage("Loading pass-through endpoints…")}
      noDataMessage={<EmptyState />}
      size="compact"
    />
  );
}
