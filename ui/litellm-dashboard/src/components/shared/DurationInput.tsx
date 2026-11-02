"use client";
import { localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import type { ComponentProps } from "react";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cva.config";

export type DurationInputProps = Omit<ComponentProps<"div">, "onChange"> & {
  label: string;
  value: number;
  onChange: (value: number) => void;
  base: "minutes" | "hours";
  max?: number;
};

export function DurationInput(cocaCopyProps0: DurationInputProps) {
  const { label, value, onChange, base, max, className, ...props } = cocaCopyProps0;
  useUiLocale();
  const id = useId();
  const units =
    base === "minutes"
      ? [
          markUiCopy({ label: "minutes", scale: 1 }, { label: "minutes" }),
          markUiCopy({ label: "hours", scale: 60 }, { label: "hours" }),
          markUiCopy({ label: "days", scale: 1440 }, { label: "days" }),
        ]
      : [
          markUiCopy({ label: "hours", scale: 1 }, { label: "hours" }),
          markUiCopy({ label: "days", scale: 24 }, { label: "days" }),
        ];
  const [scale, setScale] = useState(() => [...units].reverse().find((unit) => value % unit.scale === 0)?.scale ?? 1);
  function changeUnit(next: number) {
    setScale(next);
  }
  return (
    <div {...props} data-slot="duration-input" className={cn("space-y-2", className)}>
      <label htmlFor={id} className="text-sm">
        {localizedProperty(cocaCopyProps0, "label", label)}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          min={1 / scale}
          max={max === undefined ? undefined : max / scale}
          step={1 / scale}
          value={Number.isFinite(value) ? value / scale : ""}
          onChange={(event) => onChange(event.target.value === "" ? NaN : Number(event.target.value) * scale)}
        />
        <div className="relative w-28 shrink-0">
          <select
            aria-label={translateMessage("%{0} unit", [label])}
            value={scale}
            className="h-9 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-9 text-sm"
            onChange={(event) => changeUnit(Number(event.target.value))}
          >
            {units.map((unit) => (
              <option key={unit.scale} value={unit.scale}>
                {localizedProperty(unit, "label", unit.label)}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </div>
    </div>
  );
}
