"use client";
import { localizedProperty, useUiLocale } from "@/lib/i18n";
import { Loader2 } from "lucide-react";

import { StateMessage, type StateMessageProps } from "./StateMessage";

type LoadingStateProps = Omit<StateMessageProps, "role" | "icon" | "tone">;

export function LoadingState(cocaCopyProps0: LoadingStateProps) {
  const { title, ...props } = cocaCopyProps0;
  useUiLocale();
  return (
    <StateMessage
      role="status"
      aria-label={localizedProperty(cocaCopyProps0, "title", title)}
      icon={<Loader2 className="size-5 animate-spin motion-reduce:animate-none" />}
      title={localizedProperty(cocaCopyProps0, "title", title)}
      {...props}
    />
  );
}
