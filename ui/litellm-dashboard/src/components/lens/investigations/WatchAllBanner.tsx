"use client";
import { LocalizedText, localizedProperty, translateMessage, useUiLocale } from "@/lib/i18n";

import { z } from "zod";
import { useLensUpdate } from "../data/mutations";
import type { Lens } from "../model/types";

const watchAllResult = z.object({
  skipped: z.array(z.object({ id: z.string(), name: z.string(), reason: z.string() })),
});

export interface WatchAllBannerProps {
  readonly lenses: readonly Lens[];
}

export function WatchAllBanner({ lenses }: WatchAllBannerProps) {
  useUiLocale();
  const watchAll = useLensUpdate();
  const paused = lenses.filter((lens) => !lens.settings.enabled).length;
  if (paused === 0) return null;
  const result = watchAllResult.safeParse(watchAll.data);
  const skipped = result.success ? result.data.skipped : [];
  if (skipped.length >= paused)
    return (
      <span
        role="status"
        className="text-xs text-muted-foreground"
        title={skipped.map((s) => `${s.name}: ${s.reason}`).join("\n")}
      >
        {paused}
        <LocalizedText text={" paused · "} />
        {skipped.length === 1
          ? translateMessage("%{0} needs a fix", [skipped[0].name])
          : translateMessage("%{0} need a fix", [skipped.length])}
      </span>
    );
  return (
    <span role="status" className="text-xs text-muted-foreground">
      {paused}
      <LocalizedText text={" paused · "} />
      {watchAll.error && <span className="text-destructive">{localizedProperty(watchAll.error, "message")} · </span>}
      <button
        type="button"
        disabled={watchAll.isPending}
        onClick={() => watchAll.mutate((api) => api.watchAll())}
        className="font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50"
      >
        <LocalizedText text={"Turn all on"} />
      </button>
    </span>
  );
}
