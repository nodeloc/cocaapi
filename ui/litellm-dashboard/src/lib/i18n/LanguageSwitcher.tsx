"use client";

import { Languages } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setUiLocale } from "./locale";
import { useUiLocale } from "./useUiLocale";

const languages = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

export function LanguageSwitcher() {
  const locale = useUiLocale();
  return (
    <Select
      value={locale ?? "zh"}
      items={languages}
      onValueChange={(value) => {
        if (value === "zh" || value === "en") setUiLocale(value);
      }}
    >
      <SelectTrigger aria-label="语言 / Language" className="h-8 w-[104px] shrink-0 gap-1 px-2">
        <Languages className="size-4 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {languages.map((language) => (
          <SelectItem key={language.value} value={language.value}>
            {language.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
