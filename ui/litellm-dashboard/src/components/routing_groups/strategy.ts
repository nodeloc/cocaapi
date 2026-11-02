import { markUiCopy } from "@/lib/i18n";
const STRATEGY_LABELS: Readonly<Record<string, string>> = markUiCopy(
  {
    "simple-shuffle": "Simple Shuffle",
    "least-busy": "Least Busy",
    "usage-based-routing": "Usage Based",
    "latency-based-routing": "Latency Based",
    priority: "Priority",
  },
  {
    "simple-shuffle": "Simple Shuffle",
    "least-busy": "Least Busy",
    "usage-based-routing": "Usage Based",
    "latency-based-routing": "Latency Based",
    priority: "Priority",
  },
);

export const formatStrategyLabel = (strategy: string): string => STRATEGY_LABELS[strategy] ?? strategy;
