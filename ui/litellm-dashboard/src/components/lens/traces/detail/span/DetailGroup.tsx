"use client";
import { localizedProperty, useUiLocale } from "@/lib/i18n";
export function DetailGroup(cocaCopyProps0: { title: string; children: React.ReactNode }) {
  const { title, children } = cocaCopyProps0;
  useUiLocale();
  return (
    <section aria-label={localizedProperty(cocaCopyProps0, "title", title)} className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {localizedProperty(cocaCopyProps0, "title", title)}
      </h3>
      <div className="rounded-lg border border-border bg-card px-3 py-1.5">{children}</div>
    </section>
  );
}
