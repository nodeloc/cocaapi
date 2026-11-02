"use client";

import { localizedProperty, useUiLocale } from "@/lib/i18n";
import type { ReactNode } from "react";
import { AccountDashboardShell } from "../AccountDashboardShell";
import { CustomerSessionBoundary } from "./CustomerSessionProvider";

export default function CustomerNativePage(props: { title: string; children: ReactNode }) {
  useUiLocale();
  return (
    <CustomerSessionBoundary>
      {({ profile }) => (
        <AccountDashboardShell
          title={localizedProperty(props, "title", props.title)}
          description=""
          profile={profile}
          nativeContent
        >
          {props.children}
        </AccountDashboardShell>
      )}
    </CustomerSessionBoundary>
  );
}
