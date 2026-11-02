"use client";
import { LocalizedText, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { useAutoRouters, useInvalidateAutoRouters } from "@/app/(dashboard)/hooks/models/useModels";
import { useModelDetailRouting } from "@/app/(dashboard)/models-and-endpoints/detailNavigation";
import AddAutoRouterTab from "@/components/add_model/add_auto_router_tab";
import DeleteResourceModal from "@/components/common_components/DeleteResourceModal";
import { toast } from "@/lib/toast";
import { modelDeleteCall } from "@/components/networking";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type ModelWriteScope } from "@/utils/modelPermissions";
import { Team } from "@/components/networking";

import { AutoRoutersTable } from "./AutoRoutersTable";
import { AutoRouterRow, toAutoRouterRows } from "./autoRouterRows";

interface AutoRoutersPanelProps {
  accessToken: string;
  userRole: string;
  userID: string | null;
  isViewOnly: boolean;
  teams: Team[] | null;
  /** Owned by the page, which knows how this caller must scope what they create. */
  createScope: ModelWriteScope;
}

export function AutoRoutersPanel({
  accessToken,
  userRole,
  userID,
  isViewOnly,
  teams,
  createScope,
}: AutoRoutersPanelProps) {
  useUiLocale();
  const canCreate = createScope !== "forbidden";
  const { data: deployments, isLoading } = useAutoRouters();
  const invalidateAutoRouters = useInvalidateAutoRouters();
  // Clicking a router opens the same ?model= drill-in the Deployed Models table uses, so an auto
  // router gets the full ModelInfoView: Model Settings, Edit Settings, Edit Auto Router and
  // Delete. A separate detail view here would be a worse copy of it.
  const { openModel } = useModelDetailRouting();
  const [isCreating, setIsCreating] = useState(false);
  const [deletingRouter, setDeletingRouter] = useState<AutoRouterRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const routers = useMemo(
    () => toAutoRouterRows(deployments ?? [], { userRole, userID, isViewOnly }, teams),
    [deployments, userRole, userID, isViewOnly, teams],
  );

  const handleCreated = () => {
    setIsCreating(false);
    void invalidateAutoRouters();
  };

  const handleConfirmDelete = async () => {
    if (!deletingRouter) return;
    setIsDeleting(true);
    try {
      await modelDeleteCall(accessToken, deletingRouter.id);
      toast.success(translateMessage("Deleted auto router: %{0}", [deletingRouter.name]));
      setDeletingRouter(null);
      await invalidateAutoRouters();
    } catch (error) {
      toast.fromError(`Failed to delete auto router: ${error}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            <LocalizedText text={"Auto routers"} />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <LocalizedText
              text={
                "Auto routers sit above your deployments and pick a model per request. They are called like any other model, so clients keep using a single model name."
              }
            />
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setIsCreating(true)} className="shrink-0">
            <Plus />
            <LocalizedText text={"Add Auto Router"} />
          </Button>
        )}
      </div>

      <AutoRoutersTable
        routers={routers}
        isLoading={isLoading}
        canModify={canCreate}
        onRouterClick={(row) => openModel(row.id)}
        onDeleteClick={setDeletingRouter}
      />

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        {/* The form is long, so the dialog caps its height and scrolls its body rather than
            growing past the viewport. */}
        <DialogContent
          overlayClassName="bg-black/40 backdrop-blur-sm"
          className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
        >
          <DialogHeader>
            <DialogTitle>
              <LocalizedText text={"Add Auto Router"} />
            </DialogTitle>
            <DialogDescription>
              <LocalizedText
                text={
                  "Choose a classifier to route each request to a model. Called like any other model, so clients keep using a single model name."
                }
              />
            </DialogDescription>
          </DialogHeader>
          <AddAutoRouterTab
            handleOk={handleCreated}
            accessToken={accessToken}
            userRole={userRole}
            userId={userID}
            createScope={createScope}
            teams={teams}
          />
        </DialogContent>
      </Dialog>

      {deletingRouter && (
        <DeleteResourceModal
          isOpen
          title={translateMessage("Delete Auto Router")}
          message={translateMessage(
            'Are you sure you want to delete "%{0}"? Any client still calling this model name will start failing.',
            [deletingRouter.name],
          )}
          resourceInformationTitle="Auto router"
          resourceInformation={[
            markUiCopy({ label: "Name", value: deletingRouter.name }, { label: "Name" }),
            markUiCopy({ label: "Type", value: deletingRouter.typeLabel }, { label: "Type" }),
            markUiCopy({ label: "ID", value: deletingRouter.id }, { label: "ID" }),
          ]}
          onCancel={() => setDeletingRouter(null)}
          onOk={handleConfirmDelete}
          confirmLoading={isDeleting}
        />
      )}
    </div>
  );
}
