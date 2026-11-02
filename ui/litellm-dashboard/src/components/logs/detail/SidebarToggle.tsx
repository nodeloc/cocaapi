"use client";
import { translateMessage, useUiLocale } from "@/lib/i18n";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cva.config";

export interface SidebarToggleProps {
  isCollapsed: boolean;
  onToggle: () => void;
  className?: string;
}

export function SidebarToggle({ isCollapsed, onToggle, className }: SidebarToggleProps) {
  useUiLocale();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onToggle}
      className={cn("shrink-0 bg-card! border! border-border! rounded-md!", className)}
      aria-label={isCollapsed ? translateMessage("Expand trace sidebar") : translateMessage("Collapse trace sidebar")}
    >
      {isCollapsed ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
    </Button>
  );
}
