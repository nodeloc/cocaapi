"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";
import { useCloudZeroDryRun } from "@/app/(dashboard)/hooks/cloudzero/useCloudZeroDryRun";
import { useCloudZeroExport } from "@/app/(dashboard)/hooks/cloudzero/useCloudZeroExport";
import { useCloudZeroDeleteSettings } from "@/app/(dashboard)/hooks/cloudzero/useCloudZeroSettings";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import DeleteResourceModal from "@/components/common_components/DeleteResourceModal";
import { Alert, AlertDescription, AlertTitle } from "@/components/shared/Alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/lib/toast";
import { CheckCircle, Pencil, Play, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import CloudZeroUpdateModal from "./CloudZeroUpdateModal";
import { CloudZeroSettings } from "./types";

interface CloudZeroIntegrationSettingsProps {
  settings: CloudZeroSettings;
  onSettingsUpdated: () => void;
}

interface DetailRowProps {
  label: string;
  children: React.ReactNode;
}

const DetailRow = (cocaCopyProps0: DetailRowProps) => {
  const { label, children } = cocaCopyProps0;
  useUiLocale();
  return (
    <div className="grid grid-cols-1 border-b border-border last:border-b-0 sm:grid-cols-[220px_minmax(0,1fr)]">
      <dt className="bg-muted/50 px-4 py-3 text-sm font-medium">{localizedProperty(cocaCopyProps0, "label", label)}</dt>
      <dd className="px-4 py-3 text-sm">{children}</dd>
    </div>
  );
};

const NotConfigured = () => {
  useUiLocale();
  return (
    <span className="text-muted-foreground italic">
      <LocalizedText text={"Not configured"} />
    </span>
  );
};

export function CloudZeroIntegrationSettings({ settings, onSettingsUpdated }: CloudZeroIntegrationSettingsProps) {
  useUiLocale();
  const { accessToken } = useAuthorized();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isExportConfirmOpen, setIsExportConfirmOpen] = useState(false);

  const dryRunMutation = useCloudZeroDryRun(accessToken || "");
  const exportMutation = useCloudZeroExport(accessToken || "");
  const deleteMutation = useCloudZeroDeleteSettings(accessToken || "");

  const handleDryRun = () => {
    if (!accessToken) return;

    dryRunMutation.mutate(
      { limit: 10 },
      {
        onSuccess: (data) => {
          toast.success(translateMessage("Dry run completed successfully"));
        },
        onError: (error) => {
          toast.error(
            localizedProperty(error, "message", error?.message) || translateMessage("Failed to perform dry run"),
          );
        },
      },
    );
  };

  const dryRunResult = dryRunMutation.data ? JSON.stringify(dryRunMutation.data, null, 2) : null;

  const handleExport = () => {
    if (!accessToken) return;

    exportMutation.mutate(
      { operation: "replace_hourly" },
      {
        onSuccess: () => {
          toast.success(translateMessage("Data successfully exported to CloudZero"));
          setIsExportConfirmOpen(false);
        },
        onError: (error) => {
          toast.error(localizedProperty(error, "message", error?.message) || translateMessage("Failed to export data"));
        },
      },
    );
  };

  const handleEdit = () => {
    setIsEditModalOpen(true);
  };

  const handleEditModalOk = async () => {
    setIsEditModalOpen(false);
    onSettingsUpdated();
  };

  const handleEditModalCancel = () => {
    setIsEditModalOpen(false);
  };

  const handleDeleteClick = () => {
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!accessToken) return;

    deleteMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(translateMessage("CloudZero integration deleted successfully"));
        setIsDeleteModalOpen(false);
        onSettingsUpdated();
      },
      onError: (error) => {
        toast.error(
          localizedProperty(error, "message", error?.message) ||
            translateMessage("Failed to delete CloudZero integration"),
        );
      },
    });
  };

  const handleDeleteCancel = () => {
    setIsDeleteModalOpen(false);
  };

  return (
    <>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LocalizedText text={"CloudZero Configuration"} />
              <Badge variant="secondary" className="capitalize">
                {settings.status || translateMessage("Active")}
              </Badge>
            </CardTitle>
            <CardAction className="flex gap-2">
              <Button variant="outline" onClick={handleEdit}>
                <Pencil />
                <LocalizedText text={"Edit"} />
              </Button>
              <Button variant="destructive" onClick={handleDeleteClick}>
                <Trash2 />
                <LocalizedText text={"Delete"} />
              </Button>
            </CardAction>
          </CardHeader>

          <CardContent>
            <dl className="rounded-md border border-border">
              <DetailRow label={translateMessage("API Key (Redacted)")}>
                <span className="font-mono">{settings.api_key_masked || <NotConfigured />}</span>
              </DetailRow>
              <DetailRow label={translateMessage("Connection ID")}>
                <span className="font-mono">{settings.connection_id || <NotConfigured />}</span>
              </DetailRow>
              <DetailRow label={translateMessage("Timezone")}>
                {settings.timezone || (
                  <span className="text-muted-foreground italic">
                    <LocalizedText text={"Default (UTC)"} />
                  </span>
                )}
              </DetailRow>
            </dl>

            <div className="mt-6 flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                <LocalizedText text={"Actions"} />
              </span>
              <Separator className="flex-1" />
            </div>

            <div className="mt-4 mb-6 flex flex-wrap gap-4">
              <Button variant="outline" onClick={handleDryRun} disabled={dryRunMutation.isPending}>
                <Play />
                <LocalizedText text={"Run Dry Run Simulation"} />
              </Button>

              <Button onClick={() => setIsExportConfirmOpen(true)} disabled={exportMutation.isPending}>
                <Upload />
                <LocalizedText text={"Export Data Now"} />
              </Button>
            </div>

            {dryRunResult && (
              <Alert>
                <CheckCircle />
                <AlertTitle>
                  <LocalizedText text={"Dry Run Results"} />
                </AlertTitle>
                <AlertDescription>
                  <p>
                    <LocalizedText text={"Simulation output for connection: "} />
                    {settings.connection_id}
                  </p>
                  <pre className="overflow-x-auto rounded-md border border-border bg-muted p-4 font-mono text-xs text-foreground">
                    {dryRunResult}
                  </pre>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={isExportConfirmOpen} onOpenChange={setIsExportConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <LocalizedText text={"Export Data to CloudZero"} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <LocalizedText text={"This will push the current accumulated cost data to CloudZero. Continue?"} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={exportMutation.isPending}>
              <LocalizedText text={"Cancel"} />
            </AlertDialogCancel>
            <Button onClick={handleExport} disabled={exportMutation.isPending}>
              <LocalizedText text={"Export"} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CloudZeroUpdateModal
        open={isEditModalOpen}
        onOk={handleEditModalOk}
        onCancel={handleEditModalCancel}
        settings={settings}
      />

      <DeleteResourceModal
        isOpen={isDeleteModalOpen}
        title={translateMessage("Delete CloudZero Integration?")}
        message={translateMessage(
          "Are you sure you want to delete this CloudZero integration? All associated settings and configurations will be permanently removed.",
        )}
        resourceInformationTitle="Integration Details"
        resourceInformation={[
          markUiCopy(
            {
              label: "Connection ID",
              value: settings.connection_id,
              code: true,
            },
            { label: "Connection ID" },
          ),
          markUiCopy(
            {
              label: "Timezone",
              value: settings.timezone || "Default (UTC)",
            },
            { label: "Timezone" },
          ),
        ]}
        onCancel={handleDeleteCancel}
        onOk={handleDeleteConfirm}
        confirmLoading={deleteMutation.isPending}
      />
    </>
  );
}
