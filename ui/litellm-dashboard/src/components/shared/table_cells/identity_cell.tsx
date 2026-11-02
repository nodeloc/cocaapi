"use client";
import { localizedProperty, useUiLocale } from "@/lib/i18n";

import { ChevronRight } from "lucide-react";
import * as React from "react";

import { useEntityLinkClick } from "@/components/shared/EntityLink";
import { cn } from "@/lib/cva.config";

interface IdentityCellProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  titleClassName?: string;
}

const INTERACTIVE_CELL_CLASSES =
  "group -mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted";

const HoverChevron = () => {
  useUiLocale();
  return (
    <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
  );
};

export function IdentityCell(cocaCopyProps0: IdentityCellProps) {
  const { title, subtitle, badge, onClick, href, className, titleClassName } = cocaCopyProps0;
  useUiLocale();
  const hasSubtitleRow = (subtitle != null && subtitle !== "") || badge != null;

  const body = (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={cn("truncate text-sm font-medium text-foreground", titleClassName)}>
        {localizedProperty(cocaCopyProps0, "title", title)}
      </span>
      {hasSubtitleRow && (
        <span className="flex min-w-0 items-center gap-2">
          {subtitle != null && subtitle !== "" && (
            <span className="truncate font-mono text-xs text-muted-foreground">{subtitle}</span>
          )}
          {badge}
        </span>
      )}
    </div>
  );

  if (href != null) {
    return <IdentityCellLink href={href} className={className} body={body} />;
  }

  if (onClick != null) {
    return (
      <button type="button" onClick={onClick} className={cn(INTERACTIVE_CELL_CLASSES, className)}>
        {body}
        <HoverChevron />
      </button>
    );
  }

  return <div className={cn("min-w-0", className)}>{body}</div>;
}

function IdentityCellLink({ href, className, body }: { href: string; className?: string; body: React.ReactNode }) {
  useUiLocale();
  const handleClick = useEntityLinkClick(href);

  return (
    <a href={href} onClick={handleClick} className={cn(INTERACTIVE_CELL_CLASSES, className)}>
      {body}
      <HoverChevron />
    </a>
  );
}
