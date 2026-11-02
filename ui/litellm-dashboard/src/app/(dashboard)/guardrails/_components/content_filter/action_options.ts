import { markUiCopy } from "@/lib/i18n";
export const ACTION_ITEMS = [
  markUiCopy({ value: "BLOCK", label: "Block" }, { label: "Block" }),
  markUiCopy({ value: "MASK", label: "Mask" }, { label: "Mask" }),
] as const;

export const SEVERITY_ITEMS = [
  markUiCopy({ value: "high", label: "High" }, { label: "High" }),
  markUiCopy({ value: "medium", label: "Medium" }, { label: "Medium" }),
  markUiCopy({ value: "low", label: "Low" }, { label: "Low" }),
] as const;
