"use client";
import { localizedProperty, markUiCopy, useUiLocale } from "@/lib/i18n";
import { useCustomerNative } from "@/components/account/native/CustomerNativeContext";
import { BarChart3, Bot, Building2, Globe, LineChart, ShoppingCart, Tags, User, Users } from "lucide-react";
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hasCapability, type Capability } from "@/utils/capabilities";
import { all_admin_roles } from "@/utils/roles";
export type UsageOption =
  | "global"
  | "my-usage"
  | "organization"
  | "team"
  | "customer"
  | "tag"
  | "agent"
  | "user"
  | "user-agent-activity";
export interface UsageViewSelectProps {
  value: UsageOption;
  onChange: (value: UsageOption) => void;
  userRole: string | null;
  canViewTagUsage?: boolean;
  isOrgAdmin?: boolean;
  title?: string;
  description?: string;
  "data-id"?: string;
}
interface OptionConfig {
  value: UsageOption;
  label: string;
  description: string;
  icon: React.ReactNode;
  capability?: Capability;
  adminOnly?: boolean;
  showForAdmin?: string;
  showForNonAdmin?: string;
  descriptionForAdmin?: string;
  descriptionForNonAdmin?: string;
  badgeText?: string;
}
const OPTIONS: OptionConfig[] = [
  markUiCopy(
    {
      value: "global",
      label: "Global Usage",
      showForAdmin: "Global Usage",
      showForNonAdmin: "Your Usage",
      description: "View usage across all resources",
      descriptionForAdmin: "View usage across all resources",
      descriptionForNonAdmin: "View your usage",
      icon: <Globe className="size-4" />,
    },
    { label: "Global Usage", description: "View usage across all resources" },
  ),
  markUiCopy(
    {
      value: "my-usage",
      label: "Your Usage",
      description: "View your own usage",
      icon: <User className="size-4" />,
      adminOnly: true,
    },
    { label: "Your Usage", description: "View your own usage" },
  ),
  markUiCopy(
    {
      value: "organization",
      label: "Organization Usage",
      description: "View usage across all organizations",
      icon: <Building2 className="size-4" />,
      capability: "viewOrganizationUsage",
    },
    { label: "Organization Usage", description: "View usage across all organizations" },
  ),
  markUiCopy(
    {
      value: "team",
      label: "Team Usage",
      description: "View usage by team",
      icon: <Users className="size-4" />,
    },
    { label: "Team Usage", description: "View usage by team" },
  ),
  markUiCopy(
    {
      value: "customer",
      label: "Customer Usage",
      description: "View usage by customer accounts",
      icon: <ShoppingCart className="size-4" />,
      adminOnly: true,
    },
    { label: "Customer Usage", description: "View usage by customer accounts" },
  ),
  markUiCopy(
    {
      value: "tag",
      label: "Tag Usage",
      description: "View usage grouped by tags",
      icon: <Tags className="size-4" />,
      adminOnly: true,
    },
    { label: "Tag Usage", description: "View usage grouped by tags" },
  ),
  markUiCopy(
    {
      value: "agent",
      label: "Agent Usage (A2A)",
      description: "View usage by AI agents",
      icon: <Bot className="size-4" />,
      capability: "viewAgentUsage",
    },
    { label: "Agent Usage (A2A)", description: "View usage by AI agents" },
  ),
  markUiCopy(
    {
      value: "user",
      label: "User Usage",
      description: "View usage by individual users",
      icon: <User className="size-4" />,
      adminOnly: true,
    },
    { label: "User Usage", description: "View usage by individual users" },
  ),
  markUiCopy(
    {
      value: "user-agent-activity",
      label: "User Agent Activity",
      description: "View detailed user agent activity logs",
      icon: <LineChart className="size-4" />,
      adminOnly: true,
    },
    { label: "User Agent Activity", description: "View detailed user agent activity logs" },
  ),
];
export const UsageViewSelect: React.FC<UsageViewSelectProps> = ({
  value,
  onChange,
  userRole,
  canViewTagUsage = false,
  isOrgAdmin = false,
  title = "Usage",
  description = "Select the usage data you want to view",
  "data-id": dataId,
}) => {
  useUiLocale();
  const customer = useCustomerNative();
  const isAdmin = all_admin_roles.includes(userRole ?? "");
  const getFilteredOptions = () => {
    return OPTIONS.filter((option) => {
      if (customer) return option.value === "global";
      if (option.capability) {
        return hasCapability(userRole, option.capability, isOrgAdmin);
      }
      if (option.value === "tag" && canViewTagUsage) {
        return true;
      }
      if (option.adminOnly && !isAdmin) {
        return false;
      }
      return true;
    }).map((option) => {
      let label = option.label;
      let desc = option.description;
      if (option.showForAdmin && option.showForNonAdmin) {
        label = isAdmin ? option.showForAdmin : option.showForNonAdmin;
      }
      if (option.descriptionForAdmin && option.descriptionForNonAdmin) {
        desc = isAdmin ? option.descriptionForAdmin : option.descriptionForNonAdmin;
      }
      return {
        value: option.value,
        label,
        description: desc,
        icon: option.icon,
        badgeText: option.badgeText,
      };
    });
  };
  const filteredOptions = getFilteredOptions();
  const selectedOption = filteredOptions.find((option) => option.value === value);
  return (
    <div className="flex items-center gap-3" data-id={dataId}>
      <h1 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <BarChart3 aria-hidden="true" className="size-4" strokeWidth={2} />
        {title}
      </h1>
      <Select
        value={value}
        onValueChange={(next: UsageOption | null) => {
          if (next) onChange(next);
        }}
      >
        <SelectTrigger aria-label={description} className="h-8 w-52">
          <SelectValue>
            {selectedOption && (
              <span className="flex items-center gap-2">
                {selectedOption.icon}
                <span className="text-sm">{localizedProperty(selectedOption, "label", selectedOption.label)}</span>
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        {/* Sized to its content rather than the narrow trigger, so descriptions never clip. */}
        <SelectContent align="start" className="w-auto min-w-72 p-1">
          {filteredOptions.map((option) => (
            <SelectItem key={option.value} value={option.value} className="rounded-md py-2 pr-8 pl-2">
              <span className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 text-muted-foreground">{option.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm leading-5 text-foreground">
                    {localizedProperty(option, "label", option.label)}
                  </span>
                  <span className="block text-xs leading-4 text-muted-foreground">
                    {localizedProperty(option, "description", option.description)}
                  </span>
                </span>
                {option.badgeText && <Badge>{option.badgeText}</Badge>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
