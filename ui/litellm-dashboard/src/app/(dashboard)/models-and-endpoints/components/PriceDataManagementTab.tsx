"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";
import PriceDataReload from "@/components/price_data_reload";
import React from "react";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { useQueryClient } from "@tanstack/react-query";
import { modelCostMapKeys } from "../../hooks/models/useModelCostMap";

const PriceDataManagementTab = () => {
  useUiLocale();
  const { accessToken } = useAuthorized();
  const queryClient = useQueryClient();

  return (
    <div>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold">
            <LocalizedText text={"Price Data Management"} />
          </h2>
          <p className="text-sm text-muted-foreground">
            <LocalizedText text={"Manage model pricing data and configure automatic reload schedules"} />
          </p>
        </div>
        <PriceDataReload
          accessToken={accessToken}
          onReloadSuccess={() => {
            queryClient.invalidateQueries({ queryKey: modelCostMapKeys.all });
          }}
          buttonText={translateMessage("Reload Price Data")}
          size="middle"
          type="primary"
          className="w-full"
        />
      </div>
    </div>
  );
};

export default PriceDataManagementTab;
