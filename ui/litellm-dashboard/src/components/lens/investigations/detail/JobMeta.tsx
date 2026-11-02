"use client";
import { translateMessage, useUiLocale } from "@/lib/i18n";

import { analysisElapsed } from "../../model/progress";
import type { Job } from "../../model/types";

export function ScanDuration({ job }: { job: Job }) {
  useUiLocale();
  if (!job.finished_at) return null;
  return (
    <span title={translateMessage("Total time, including any wait for an analyzer")}>
      {translateMessage(" · Took ")}
      {analysisElapsed(job.created_at, Date.parse(job.finished_at))}
    </span>
  );
}
