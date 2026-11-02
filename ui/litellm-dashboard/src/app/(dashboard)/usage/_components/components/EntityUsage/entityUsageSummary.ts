import { getIntlLocale, markUiCopy } from "@/lib/i18n";
import { formatNumberWithCommas } from "@/utils/dataUtils";

export interface SummaryTile {
  title: string;
  value: string;
  className?: string;
  tooltip?: string;
  expandable?: boolean;
}

interface SpendSummaryMetadata {
  total_spend: number;
  total_flat_cost?: number;
  total_api_requests: number;
  total_successful_requests: number;
  total_failed_requests: number;
  total_tokens: number;
}

export const TOTAL_COST_TOOLTIP =
  "Request cost plus flat cost for reserved capacity. Select this tile to see the breakdown.";

export const REQUEST_COST_TOOLTIP =
  "Usage-based cost of the requests this entity sent during the selected period, priced per token.";

export const FLAT_COST_TOOLTIP =
  "Reserved provisioned throughput, billed per hour whether or not requests are sent. Reported here only; it does not count toward team, key, user, or organization budgets.";

export const hasFlatCost = (metadata: SpendSummaryMetadata): boolean => (metadata.total_flat_cost ?? 0) > 0;

export const buildSummaryTiles = (metadata: SpendSummaryMetadata, showFlatCost: boolean): SummaryTile[] => {
  const flatCost = metadata.total_flat_cost ?? 0;
  return [
    showFlatCost
      ? markUiCopy(
          {
            title: "Total Cost",
            value: `$${formatNumberWithCommas(metadata.total_spend + flatCost, 2)}`,
            tooltip: TOTAL_COST_TOOLTIP,
            expandable: true,
          },
          { title: "Total Cost" },
        )
      : markUiCopy(
          { title: "Total Spend", value: `$${formatNumberWithCommas(metadata.total_spend, 2)}` },
          { title: "Total Spend" },
        ),
    markUiCopy(
      { title: "Total Requests", value: metadata.total_api_requests.toLocaleString(getIntlLocale()) },
      { title: "Total Requests" },
    ),
    markUiCopy(
      {
        title: "Successful Requests",
        value: metadata.total_successful_requests.toLocaleString(getIntlLocale()),
        className: "text-success",
      },
      { title: "Successful Requests" },
    ),
    markUiCopy(
      {
        title: "Failed Requests",
        value: metadata.total_failed_requests.toLocaleString(getIntlLocale()),
        className: "text-destructive",
      },
      { title: "Failed Requests" },
    ),
    markUiCopy(
      { title: "Total Tokens", value: metadata.total_tokens.toLocaleString(getIntlLocale()) },
      { title: "Total Tokens" },
    ),
  ];
};

export const buildCostBreakdownTiles = (metadata: SpendSummaryMetadata): SummaryTile[] => [
  markUiCopy(
    {
      title: "Request Cost",
      value: `$${formatNumberWithCommas(metadata.total_spend, 2)}`,
      className: "text-info",
      tooltip: REQUEST_COST_TOOLTIP,
    },
    { title: "Request Cost" },
  ),
  markUiCopy(
    {
      title: "Flat Cost",
      value: `$${formatNumberWithCommas(metadata.total_flat_cost ?? 0, 2)}`,
      className: "text-violet-600",
      tooltip: FLAT_COST_TOOLTIP,
    },
    { title: "Flat Cost" },
  ),
];
