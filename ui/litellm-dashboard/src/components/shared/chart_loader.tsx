"use client";
import { translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import { UiLoadingSpinner } from "../ui/ui-loading-spinner";

interface ChartLoaderProps {
  isDateChanging?: boolean;
}

export const ChartLoader: React.FC<ChartLoaderProps> = ({ isDateChanging = false }) => {
  useUiLocale();
  return (
    <div className="flex items-center justify-center h-40">
      <div className="flex items-center justify-center gap-3">
        <UiLoadingSpinner className="size-5" />
        <div className="flex flex-col">
          <span className="text-muted-foreground text-sm font-medium">
            {isDateChanging
              ? translateMessage("Processing date selection...")
              : translateMessage("Loading chart data...")}
          </span>
          <span className="text-muted-foreground text-xs mt-1">
            {isDateChanging ? translateMessage("This will only take a moment") : translateMessage("Fetching your data")}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChartLoader;
