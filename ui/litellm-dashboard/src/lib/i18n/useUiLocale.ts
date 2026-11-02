"use client";

import { useSyncExternalStore } from "react";
import { getUiLocale, serverLocale, subscribeLocale } from "./locale";

export function useUiLocale() {
  return useSyncExternalStore(subscribeLocale, getUiLocale, serverLocale);
}
