"use client";
import { LocalizedText, translateMessage, useUiLocale } from "@/lib/i18n";
import React from "react";
import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/cva.config";

export type DocLinkProps = {
  href?: string;
  className?: string;
};

const DocLink = ({ href, className }: DocLinkProps) => {
  useUiLocale();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={translateMessage("Open documentation in a new tab")}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-border bg-card/80 px-3.5 py-2 text-sm font-medium text-foreground shadow-xs",
        "hover:bg-card focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring active:translate-y-[0.5px]",
        className,
      )}
    >
      <span>
        <LocalizedText text={"API Reference Docs"} />
      </span>
      <ExternalLink aria-hidden className="h-4 w-4 opacity-80" />
      <span className="sr-only">
        <LocalizedText text={"(opens in a new tab)"} />
      </span>
    </a>
  );
};

export default DocLink;
