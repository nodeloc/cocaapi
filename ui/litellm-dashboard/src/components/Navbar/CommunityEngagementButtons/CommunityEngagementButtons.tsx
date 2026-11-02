"use client";
import { localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";
import { useDisableShowPrompts } from "@/app/(dashboard)/hooks/useDisableShowPrompts";
import { buttonVariants } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cva.config";
import { Github, Slack } from "lucide-react";
import React from "react";

const COMMUNITY_LINKS = [
  markUiCopy(
    {
      href: "https://www.litellm.ai/support",
      label: "Join Slack",
      tooltip: "LiteLLM Slack community",
      Icon: Slack,
    },
    { label: "Join Slack", tooltip: "LiteLLM Slack community" },
  ),
  markUiCopy(
    {
      href: "https://github.com/BerriAI/litellm",
      label: "LiteLLM on GitHub",
      tooltip: "LiteLLM on GitHub",
      Icon: Github,
    },
    { label: "LiteLLM on GitHub", tooltip: "LiteLLM on GitHub" },
  ),
] as const;

export const CommunityEngagementButtons: React.FC = () => {
  useUiLocale();
  const disableShowPrompts = useDisableShowPrompts();

  if (disableShowPrompts) {
    return null;
  }

  return (
    <TooltipProvider>
      <ButtonGroup aria-label={translateMessage("Community links")}>
        {COMMUNITY_LINKS.map((cocaCopyProps0) => {
          const { href, label, tooltip, Icon } = cocaCopyProps0;
          return (
            <Tooltip key={href}>
              <TooltipTrigger
                render={
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={localizedProperty(cocaCopyProps0, "label", label)}
                    className={cn(buttonVariants({ variant: "outline", size: "icon" }), "text-muted-foreground")}
                  />
                }
              >
                <Icon />
              </TooltipTrigger>
              <TooltipContent>{localizedProperty(cocaCopyProps0, "tooltip", tooltip)}</TooltipContent>
            </Tooltip>
          );
        })}
      </ButtonGroup>
    </TooltipProvider>
  );
};
