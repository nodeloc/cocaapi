"use client";
import { getIntlLocale, translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import type { DateRangePickerValue } from "@/components/shared/date_picker_types";

interface ExportSummaryProps {
  dateRange: DateRangePickerValue;
  selectedFilters: string[];
}

const ExportSummary: React.FC<ExportSummaryProps> = ({ dateRange, selectedFilters }) => {
  useUiLocale();
  return (
    <div className="text-sm text-muted-foreground">
      {dateRange.from?.toLocaleDateString(getIntlLocale())} - {dateRange.to?.toLocaleDateString(getIntlLocale())}
      {selectedFilters.length > 0 &&
        translateMessage(" · %{0} filter%{1}", [selectedFilters.length, selectedFilters.length > 1 ? "s" : ""])}
    </div>
  );
};

export default ExportSummary;
