"use client";
import { LocalizedText, useUiLocale } from "@/lib/i18n";

import { PageContent } from "@/components/shared/Page";
import { useState } from "react";
import { PaginationState } from "@tanstack/react-table";
import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/shared/Alert";
import { useDeletedKeys } from "@/app/(dashboard)/hooks/keys/useKeys";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { DeletedKeysTable } from "./DeletedKeysTable/DeletedKeysTable";

export default function DeletedKeysPage() {
  useUiLocale();
  const { premiumUser } = useAuthorized();
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });

  const { data: keysData, isLoading } = useDeletedKeys(pagination.pageIndex + 1, pagination.pageSize);

  return (
    <PageContent>
      {!premiumUser && (
        <Alert className="shrink-0">
          <Info />
          <AlertTitle>
            <LocalizedText text={"Coming soon to Enterprise"} />
          </AlertTitle>
          <AlertDescription>
            <LocalizedText
              text={"Deleted key auditing is graduating from beta into our Enterprise audit & compliance suite."}
            />
          </AlertDescription>
        </Alert>
      )}
      <DeletedKeysTable
        keys={keysData?.keys || []}
        totalCount={keysData?.total_count || 0}
        isLoading={isLoading}
        pagination={pagination}
        onPaginationChange={setPagination}
      />
    </PageContent>
  );
}
