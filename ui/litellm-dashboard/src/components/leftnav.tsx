
"use client";
import { LocalizedText, localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";
import { canViewProjectsPage, projectReaderRoles } from "@/app/(dashboard)/hooks/projects/projectAccess";
import { useTeams } from "@/app/(dashboard)/hooks/teams/useTeams";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import useIsOrgAdmin from "@/app/(dashboard)/hooks/useIsOrgAdmin";
import { useHealthReadinessDetails } from "@/app/(dashboard)/hooks/healthReadiness/useHealthReadinessDetails";
import { useLogout } from "@/app/(dashboard)/hooks/useLogout";
import { getProxyBaseUrl } from "@/components/networking";
import { useTheme } from "@/contexts/ThemeContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarSeparator,
  sidebarMenuButtonVariants,
} from "@/components/shared/Sidebar";
import {
  Activity,
  Aperture,
  BarChart3,
  Bell,
  Blocks,
  Bot,
  BookOpen,
  Boxes,
  ChevronRight,
  Code2,
  Database,
  ExternalLink,
  FileText,
  FlaskConical,
  Folder,
  HeartPulse,
  House,
  KeyRound,
  LayoutGrid,
  Network,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PiggyBank,
  PlayCircle,
  Route,
  ScrollText,
  Search,
  Server,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Tags,
  Terminal,
  Trophy,
  User,
  Users,
  Wallet,
  Wrench,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cva.config";
import { rolesWithCapability } from "../utils/capabilities";
import {
  all_admin_roles,
  internalUserRoles,
  isAdminRole,
  isUserTeamAdminForAnyTeam,
  rolesAllowedToViewWriteScopedPages,
  rolesWithWriteAccess,
} from "../utils/roles";
import BetaBadge from "./BetaBadge";
import SidebarAccountMenu from "./SidebarAccountMenu/SidebarAccountMenu";
import SidebarUsageCard from "./SidebarUsageCard";
import { routeSegmentForPathname, uiHref } from "@/utils/uiHref";

const ICON = { strokeWidth: 1.75 } as const;

const LOGO_CLASS_NAME =
  "h-6 w-auto max-w-[150px] object-contain group-data-[collapsed=true]/sidebar:h-7 group-data-[collapsed=true]/sidebar:w-7";

function bundledLogoSrc(baseUrl: string, { dark, monogram }: { dark: boolean; monogram: boolean }): string {
  const query = [dark && "theme=dark", monogram && "variant=monogram", "v=cocaapi-20261102"].filter(Boolean).join("&");
  return `${baseUrl}/get_image${query ? `?${query}` : ""}`;
}

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  enabledPagesInternalUsers?: string[] | null;
  enableProjectsUI?: boolean;
  disableAgentsForInternalUsers?: boolean;
  allowAgentsForTeamAdmins?: boolean;
  disableVectorStoresForInternalUsers?: boolean;
  allowVectorStoresForTeamAdmins?: boolean;
}

export interface MenuItem {
  key: string;
  page: string;
  route?: string;
  label: string | React.ReactNode;
  roles?: string[];
  children?: MenuItem[];
  icon?: React.ReactNode;
  external_url?: string;
}

export interface MenuGroup {
  groupLabel: string;
  items: MenuItem[];
  roles?: string[];
}

export interface MenuVisibilityContext {
  userRole: string;
  isViewOnly: boolean;
  isOrgAdmin: boolean;
  isTeamAdmin: boolean;
  enabledPagesInternalUsers?: string[] | null;
  enableProjectsUI?: boolean;
  disableAgentsForInternalUsers?: boolean;
  allowAgentsForTeamAdmins?: boolean;
  disableVectorStoresForInternalUsers?: boolean;
  allowVectorStoresForTeamAdmins?: boolean;
}

const adminPageVisibility = (item: MenuItem, context: MenuVisibilityContext, isAdmin: boolean): boolean | null => {
  if (item.key !== "users") return null;
  const hasRoleAccess = !item.roles || item.roles.includes(context.userRole) || context.isOrgAdmin;
  if (!hasRoleAccess) return false;
  if (!isAdmin && context.enabledPagesInternalUsers != null) {
    return context.enabledPagesInternalUsers.includes(item.page);
  }
  return true;
};

const projectPageIsVisible = (item: MenuItem, context: MenuVisibilityContext): boolean => {
  if (item.key !== "projects") return true;
  if (!context.enableProjectsUI) return false;
  return canViewProjectsPage({
    userRole: context.userRole,
    isOrgAdmin: context.isOrgAdmin,
    isTeamAdmin: context.isTeamAdmin,
  });
};

const pageIsDisabledForInternalUsers = (
  item: MenuItem,
  pageKey: "agents" | "vector-stores",
  isAdmin: boolean,
  context: MenuVisibilityContext,
): boolean => {
  const isDisabled =
    pageKey === "agents" ? context.disableAgentsForInternalUsers : context.disableVectorStoresForInternalUsers;
  const allowedForTeamAdmins =
    pageKey === "agents" ? context.allowAgentsForTeamAdmins : context.allowVectorStoresForTeamAdmins;
  if (item.key !== pageKey || isAdmin || !isDisabled) return false;
  return !(allowedForTeamAdmins && context.isTeamAdmin);
};

const pageIsEnabledForInternalUser = (item: MenuItem, context: MenuVisibilityContext): boolean => {
  const enabledPages = context.enabledPagesInternalUsers;
  if (enabledPages == null) return true;
  if (item.children?.some((child) => enabledPages.includes(child.page))) return true;
  return enabledPages.includes(item.page);
};

const menuItemIsVisible = (item: MenuItem, context: MenuVisibilityContext, isAdmin: boolean): boolean => {
  if (item.children && item.children.length === 0) return false;
  if (item.key === "llm-playground" && context.isViewOnly) return false;
  if (item.key === "commerce" && context.isViewOnly) return false;
  if (item.key === "login-settings" && context.isViewOnly) return false;
  const adminVisibility = adminPageVisibility(item, context, isAdmin);
  if (adminVisibility !== null) return adminVisibility;
  if (!projectPageIsVisible(item, context)) return false;
  if (pageIsDisabledForInternalUsers(item, "agents", isAdmin, context)) return false;
  if (pageIsDisabledForInternalUsers(item, "vector-stores", isAdmin, context)) return false;
  if (item.roles && !item.roles.includes(context.userRole)) return false;
  if (!isAdmin && context.enabledPagesInternalUsers != null) return pageIsEnabledForInternalUser(item, context);
  return true;
};

export const visibleMenuGroups = (groups: readonly MenuGroup[], context: MenuVisibilityContext): MenuGroup[] => {
  const isAdmin = isAdminRole(context.userRole);
  const filterItems = (items: MenuItem[]): MenuItem[] =>
    items
      .map((item) => markUiCopy({ ...item, children: item.children ? filterItems(item.children) : undefined }, {}, [item]))
      .filter((item) => menuItemIsVisible(item, context, isAdmin));

  return groups
    .filter((group) => !group.roles || group.roles.includes(context.userRole))
    .map((group) => (markUiCopy({ groupLabel: group.groupLabel, items: filterItems(group.items) }, {"groupLabel": { owner: group, field: "groupLabel" }})))
    .filter((group) => group.items.length > 0);
};

// Menu groups organized by category - defined outside component for export.
// Shape (key/page/label/roles/children) is consumed by page_utils.ts; only the
// icons changed to lucide as part of the sidebar redesign.
const menuGroups: MenuGroup[] = [
  markUiCopy({
    groupLabel: "AI GATEWAY",
    items: [
      markUiCopy({ key: "home", page: "home", label: "Home", icon: <House {...ICON} /> }, {"label": "Home"}),
      markUiCopy({ key: "api-keys", page: "api-keys", label: "Virtual Keys", icon: <KeyRound {...ICON} /> }, {"label": "Virtual Keys"}),
      markUiCopy({
        key: "llm-playground",
        page: "llm-playground",
        route: "playground",
        label: "Playground",
        icon: <PlayCircle {...ICON} />,
        roles: rolesWithWriteAccess,
      }, {"label": "Playground"}),
      markUiCopy({
        key: "models",
        page: "models",
        route: "models-and-endpoints",
        label: "Models + Endpoints",
        icon: <Network {...ICON} />,
        roles: rolesAllowedToViewWriteScopedPages,
      }, {"label": "Models + Endpoints"}),
      markUiCopy({
        key: "agentic",
        page: "agentic",
        label: "Agentic",
        icon: <Bot {...ICON} />,
        children: [
          markUiCopy({
            key: "agents",
            page: "agents",
            label: "Agents",
            icon: <Bot {...ICON} />,
            roles: rolesAllowedToViewWriteScopedPages,
          }, {"label": "Agents"}),
          markUiCopy({
            key: "workflows",
            page: "workflows",
            label: "Workflow Runs",
            icon: <Workflow {...ICON} />,
            roles: rolesWithCapability("viewWorkflowRuns"),
          }, {"label": "Workflow Runs"}),
          markUiCopy({
            key: "memory",
            page: "memory",
            label: "Memory",
            icon: <Database {...ICON} />,
            roles: rolesWithCapability("viewMemory"),
          }, {"label": "Memory"}),
        ],
      }, {"label": "Agentic"}),
      markUiCopy({ key: "mcp-servers", page: "mcp-servers", label: "MCP Servers", icon: <Server {...ICON} /> }, {"label": "MCP Servers"}),
      markUiCopy({ key: "skills", page: "skills", label: "Skills", icon: <Blocks {...ICON} />, roles: all_admin_roles }, {"label": "Skills"}),
      markUiCopy({ key: "guardrails", page: "guardrails", label: "Guardrails", icon: <Shield {...ICON} /> }, {"label": "Guardrails"}),
      markUiCopy({
        key: "policies",
        page: "policies",
        label: "Policies",
        icon: <ScrollText {...ICON} />,
        roles: rolesWithCapability("viewPolicies"),
      }, {"label": "Policies"}),
      markUiCopy({
        key: "tools",
        page: "tools",
        label: "Tools",
        icon: <Wrench {...ICON} />,
        children: [
          markUiCopy({ key: "search-tools", page: "search-tools", label: "Search Tools", icon: <Search {...ICON} /> }, {"label": "Search Tools"}),
          markUiCopy({ key: "vector-stores", page: "vector-stores", label: "Vector Stores", icon: <Database {...ICON} /> }, {"label": "Vector Stores"}),
          markUiCopy({
            key: "tool-policies",
            page: "tool-policies",
            label: "Tool Policies",
            icon: <ShieldCheck {...ICON} />,
            roles: rolesWithCapability("viewToolPolicies"),
          }, {"label": "Tool Policies"}),
        ],
      }, {"label": "Tools"}),
    ],
  }, {"groupLabel": "AI GATEWAY"}),
  markUiCopy({
    groupLabel: "OBSERVABILITY",
    items: [
      markUiCopy({
        key: "new_usage",
        page: "new_usage",
        route: "usage",
        icon: <BarChart3 {...ICON} />,
        roles: [...all_admin_roles, ...internalUserRoles],
        label: "Usage",
      }, {"label": "Usage"}),
      {
        key: "model-insights",
        page: "model-insights",
        icon: <Trophy {...ICON} />,
        roles: all_admin_roles,
        label: (
          <span className="flex items-center gap-2"><LocalizedText text={"Model Leaderboard "} /><BetaBadge />
          </span>
        ),
      },
      markUiCopy({
        key: "cost-optimization",
        page: "cost-optimization",
        icon: <PiggyBank {...ICON} />,
        roles: [...all_admin_roles, ...internalUserRoles],
        label: "Cost Optimization",
      }, {"label": "Cost Optimization"}),
      markUiCopy({ key: "logs", page: "logs", label: "Logs", icon: <Activity {...ICON} /> }, {"label": "Logs"}),
      {
        key: "lens",
        page: "lens",
        label: (
          <span className="flex items-center gap-2"><LocalizedText text={"Lens "} /><BetaBadge />
          </span>
        ),
        icon: <Aperture {...ICON} />,
      },
      markUiCopy({
        key: "guardrails-monitor",
        page: "guardrails-monitor",
        label: "Guardrails Monitor",
        icon: <HeartPulse {...ICON} />,
        roles: rolesWithCapability("viewGuardrailUsage"),
      }, {"label": "Guardrails Monitor"}),
    ],
  }, {"groupLabel": "OBSERVABILITY"}),
  markUiCopy({
    groupLabel: "ACCESS CONTROL",
    items: [
      markUiCopy({ key: "teams", page: "teams", label: "Teams", icon: <Users {...ICON} /> }, {"label": "Teams"}),
      {
        key: "projects",
        page: "projects",
        label: (
          <span className="flex items-center gap-2"><LocalizedText text={"Projects "} /><BetaBadge />
          </span>
        ),
        icon: <Folder {...ICON} />,
        roles: [...projectReaderRoles],
      },
      markUiCopy({ key: "users", page: "users", label: "Users", icon: <User {...ICON} />, roles: all_admin_roles }, {"label": "Users"}),
      markUiCopy({
        key: "access-groups",
        page: "access-groups",
        label: "Access Groups",
        icon: <Boxes {...ICON} />,
        roles: all_admin_roles,
      }, {"label": "Access Groups"}),
      markUiCopy({ key: "budgets", page: "budgets", label: "Budgets", icon: <Wallet {...ICON} />, roles: all_admin_roles }, {"label": "Budgets"}),
      markUiCopy({
        key: "commerce",
        page: "commerce",
        route: "commerce/orders",
        label: "账户与充值",
        icon: <Wallet {...ICON} />,
        roles: ["Admin", "proxy_admin"],
      }, {"label": "账户与充值"}),
      markUiCopy({
        key: "login-settings",
        page: "commerce/settings",
        label: "登录与注册",
        icon: <SettingsIcon {...ICON} />,
        roles: ["Admin", "proxy_admin"],
      }, {"label": "登录与注册"}),
    ],
  }, {"groupLabel": "ACCESS CONTROL"}),
  markUiCopy({
    groupLabel: "DEVELOPER TOOLS",
    items: [
      markUiCopy({ key: "api_ref", page: "api_ref", route: "api-reference", label: "API Reference", icon: <Code2 {...ICON} /> }, {"label": "API Reference"}),
      markUiCopy({ key: "model-hub-table", page: "model-hub-table", label: "AI Hub", icon: <LayoutGrid {...ICON} /> }, {"label": "AI Hub"}),
      markUiCopy({
        key: "learning-resources",
        page: "learning-resources",
        label: "Learning Resources",
        icon: <BookOpen {...ICON} />,
        external_url: "https://models.litellm.ai/cookbook",
      }, {"label": "Learning Resources"}),
      markUiCopy({
        key: "caching",
        page: "caching",
        label: "Response Cache",
        icon: <Database {...ICON} />,
        roles: all_admin_roles,
      }, {"label": "Response Cache"}),
      markUiCopy({
        key: "experimental",
        page: "experimental",
        label: "Experimental",
        icon: <FlaskConical {...ICON} />,
        children: [
          markUiCopy({
            key: "prompts",
            page: "prompts",
            label: "Prompts",
            icon: <FileText {...ICON} />,
            roles: rolesWithCapability("viewPrompts"),
          }, {"label": "Prompts"}),
          markUiCopy({
            key: "transform-request",
            page: "transform-request",
            label: "API Playground",
            icon: <Terminal {...ICON} />,
            roles: [...all_admin_roles, ...internalUserRoles],
          }, {"label": "API Playground"}),
          markUiCopy({
            key: "tag-management",
            page: "tag-management",
            label: "Tag Management",
            icon: <Tags {...ICON} />,
            roles: all_admin_roles,
          }, {"label": "Tag Management"}),
          markUiCopy({
            key: "4",
            page: "usage",
            route: "old-usage",
            label: "Old Usage",
            icon: <BarChart3 {...ICON} />,
            roles: rolesWithCapability("viewGlobalSpend"),
          }, {"label": "Old Usage"}),
        ],
      }, {"label": "Experimental"}),
    ],
  }, {"groupLabel": "DEVELOPER TOOLS"}),
  markUiCopy({
    groupLabel: "SETTINGS",
    roles: all_admin_roles,
    items: [
      markUiCopy({
        key: "settings",
        page: "settings",
        label: "Settings",
        icon: <SettingsIcon {...ICON} />,
        roles: all_admin_roles,
        children: [
          markUiCopy({
            key: "router-settings",
            page: "router-settings",
            label: "Router Settings",
            icon: <Route {...ICON} />,
            roles: all_admin_roles,
          }, {"label": "Router Settings"}),
          markUiCopy({
            key: "logging-and-alerts",
            page: "logging-and-alerts",
            label: "Logging & Alerts",
            icon: <Bell {...ICON} />,
            roles: all_admin_roles,
          }, {"label": "Logging & Alerts"}),
          markUiCopy({
            key: "admin-panel",
            page: "admin-panel",
            label: "Admin Settings",
            icon: <SettingsIcon {...ICON} />,
            roles: all_admin_roles,
          }, {"label": "Admin Settings"}),
          markUiCopy({
            key: "cost-tracking",
            page: "cost-tracking",
            label: "Cost Tracking",
            icon: <BarChart3 {...ICON} />,
            roles: all_admin_roles,
          }, {"label": "Cost Tracking"}),
          markUiCopy({ key: "ui-theme", page: "ui-theme", label: "UI Theme", icon: <Palette {...ICON} />, roles: all_admin_roles }, {"label": "UI Theme"}),
        ],
      }, {"label": "Settings"}),
    ],
  }, {"groupLabel": "SETTINGS"}),
];

const HOME_ROUTE = "home";

export const routeOf = (item: MenuItem): string => item.route ?? item.page;

const topLevelRouteOf = (item: MenuItem): string => routeOf(item).split("/")[0];

const routeForPathname = (pathname: string): string => routeSegmentForPathname(pathname) || HOME_ROUTE;

const findParentKey = (route: string): string | null => {
  for (const group of menuGroups) {
    for (const item of group.items) {
      if (item.children?.some((c) => routeOf(c) === route)) return item.key;
    }
  }
  return null;
};

const findMenuItemKey = (route: string): string => {
  for (const group of menuGroups) {
    for (const item of group.items) {
      if (topLevelRouteOf(item) === route) return item.key;
      const child = item.children?.find((c) => routeOf(c) === route);
      if (child) return child.key;
    }
  }
  return HOME_ROUTE;
};

const SECTION_DISPLAY: Record<string, string> = {
  "AI GATEWAY": "AI Gateway",
  OBSERVABILITY: "Observability",
  "ACCESS CONTROL": "Access Control",
  "DEVELOPER TOOLS": "Developer Tools",
  SETTINGS: "Settings",
};

export const sectionText = (groupLabel: string): string => SECTION_DISPLAY[groupLabel] ?? groupLabel;

const prettify = (key: string): string =>
  key
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export const labelText = (item: MenuItem): string => (typeof item.label === "string" ? item.label : prettify(item.key));

// Breadcrumb ("Section" / "Page") for the top bar, derived from the same nav config.
export const getBreadcrumb = (pathname: string): { section: string | null; title: string } => {
  const route = routeForPathname(pathname);
  for (const group of menuGroups) {
    for (const item of group.items) {
      const section = sectionText(group.groupLabel);
      if (topLevelRouteOf(item) === route) return { section, title: labelText(item) };
      const child = item.children?.find((c) => routeOf(c) === route);
      if (child) return { section, title: labelText(child) };
    }
  }
  return { section: null, title: prettify(route) };
};

const Sidebar_: React.FC<SidebarProps> = ({
  collapsed = false,
  onToggleCollapsed,
  enabledPagesInternalUsers,
  enableProjectsUI,
  disableAgentsForInternalUsers,
  allowAgentsForTeamAdmins,
  disableVectorStoresForInternalUsers,
  allowVectorStoresForTeamAdmins,
}) => {
  useUiLocale();
  const { userId, accessToken, userRole, isViewOnly } = useAuthorized();
  const isOrgAdmin = useIsOrgAdmin();
  const { data: teams } = useTeams();
  const { logoUrl, logoUrlDark } = useTheme();
  const [erroredDarkLogo, setErroredDarkLogo] = useState<string | null>(null);
  const { data: healthData } = useHealthReadinessDetails(accessToken);
  const logout = useLogout(accessToken);

  const baseUrl = getProxyBaseUrl();
  const version = healthData?.litellm_version;
  const currentRoute = routeForPathname(usePathname());
  const selectedKey = findMenuItemKey(currentRoute);

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const parent = findParentKey(currentRoute);
    return new Set(parent ? [parent] : []);
  });

  // Keep the active page's parent group expanded as the user navigates, using the
  // "adjust state during render" pattern rather than an effect (avoids a
  // setState-in-effect render cascade).
  const [prevRoute, setPrevRoute] = useState(currentRoute);
  if (currentRoute !== prevRoute) {
    setPrevRoute(currentRoute);
    const parent = findParentKey(currentRoute);
    if (parent && !openGroups.has(parent)) {
      setOpenGroups((prev) => new Set(prev).add(parent));
    }
  }

  const isTeamAdmin = useMemo(() => isUserTeamAdminForAnyTeam(teams ?? null, userId ?? ""), [teams, userId]);

  const visibleGroups = useMemo(() => {
    const context: MenuVisibilityContext = {
      userRole,
      isViewOnly,
      isOrgAdmin,
      isTeamAdmin,
      enabledPagesInternalUsers,
      enableProjectsUI,
      disableAgentsForInternalUsers,
      allowAgentsForTeamAdmins,
      disableVectorStoresForInternalUsers,
      allowVectorStoresForTeamAdmins,
    };
    return visibleMenuGroups(menuGroups, context);
  }, [
    allowAgentsForTeamAdmins,
    allowVectorStoresForTeamAdmins,
    disableAgentsForInternalUsers,
    disableVectorStoresForInternalUsers,
    enableProjectsUI,
    enabledPagesInternalUsers,
    isOrgAdmin,
    isTeamAdmin,
    isViewOnly,
    userRole,
  ]);

  const toggleGroup = (key: string) => {
    if (collapsed) {
      onToggleCollapsed?.();
      setOpenGroups((prev) => new Set(prev).add(key));
      return;
    }
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderLeaf = (item: MenuItem, isChild: boolean) => {
    const active = selectedKey === item.key;
    const size = isChild ? "sub" : "default";
    const label = <span className="flex-1 truncate group-data-[collapsed=true]/sidebar:hidden">{localizedProperty(item, "label", item.label)}</span>;

    if (item.external_url) {
      return (
        <a
          key={item.key}
          href={item.external_url}
          target="_blank"
          rel="noopener noreferrer"
          title={collapsed ? labelText(item) : undefined}
          data-active={active || undefined}
          className={cn(sidebarMenuButtonVariants({ isActive: active, size }))}
        >
          {item.icon}
          {label}
          <ExternalLink className="size-3.5 shrink-0 opacity-70 group-data-[collapsed=true]/sidebar:hidden" />
        </a>
      );
    }

    return (
      <Link
        key={item.key}
        href={uiHref(routeOf(item))}
        title={collapsed ? labelText(item) : undefined}
        data-active={active || undefined}
        className={cn(sidebarMenuButtonVariants({ isActive: active, size }))}
      >
        {item.icon}
        {label}
      </Link>
    );
  };

  const renderItem = (item: MenuItem) => {
    const isGroup = !!item.children && item.children.length > 0;
    if (!isGroup) {
      return <SidebarMenuItem key={item.key}>{renderLeaf(item, false)}</SidebarMenuItem>;
    }

    const active = selectedKey === item.key;
    const open = openGroups.has(item.key);
    return (
      <SidebarMenuItem key={item.key}>
        <SidebarMenuButton
          isActive={active}
          aria-expanded={open}
          onClick={() => toggleGroup(item.key)}
          title={collapsed ? labelText(item) : undefined}
        >
          {item.icon}
          <span className="flex-1 truncate group-data-[collapsed=true]/sidebar:hidden">{localizedProperty(item, "label", item.label)}</span>
          <ChevronRight
            className={cn(
              "size-4 shrink-0 transition-transform group-data-[collapsed=true]/sidebar:hidden",
              open && "rotate-90",
            )}
          />
        </SidebarMenuButton>
        {open && (
          <SidebarMenuSub>
            {item.children!.map((child) => (
              <SidebarMenuItem key={child.key}>{renderLeaf(child, true)}</SidebarMenuItem>
            ))}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>
    );
  };

  const logoSrc = logoUrl || bundledLogoSrc(baseUrl, { dark: false, monogram: collapsed });
  const reachableDarkLogo = logoUrlDark === erroredDarkLogo ? null : logoUrlDark;
  const darkLogoSrc = reachableDarkLogo || logoUrl || bundledLogoSrc(baseUrl, { dark: true, monogram: collapsed });

  return (
    <Sidebar collapsed={collapsed}>
      <SidebarHeader className="h-14 border-b border-border group-data-[collapsed=true]/sidebar:h-auto">
        <div className="flex items-center justify-between gap-2 group-data-[collapsed=true]/sidebar:flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <Link href={uiHref("")} className="flex min-w-0 items-center" aria-label={translateMessage("CocaAPI 管理后台")}>
              <img src={logoSrc} alt={translateMessage("CocaAPI")} className={cn(LOGO_CLASS_NAME, "dark:hidden")} />
              <img
                src={darkLogoSrc}
                alt=""
                aria-hidden
                onError={() => setErroredDarkLogo(logoUrlDark)}
                className={cn(LOGO_CLASS_NAME, "hidden dark:block")}
              />
            </Link>
            {version && (
              <Badge
                variant="outline"
                render={<a href="https://docs.litellm.ai/release_notes" target="_blank" rel="noopener noreferrer" />}
                className="px-1.5 py-0 font-mono text-[10px] font-medium text-muted-foreground group-data-[collapsed=true]/sidebar:hidden"
              >
                v{version}
              </Badge>
            )}
          </div>
          {onToggleCollapsed && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? translateMessage("Expand sidebar") : translateMessage("Collapse sidebar")}
              className="flex-none text-muted-foreground"
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          )}
        </div>
      </SidebarHeader>

      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-0.5 px-3 pb-3">
          {visibleGroups.map((group, gi) => (
            <SidebarGroup key={group.groupLabel}>
              {gi > 0 && <SidebarSeparator className="hidden group-data-[collapsed=true]/sidebar:block" />}
              <SidebarGroupLabel>{localizedProperty(group, "groupLabel", group.groupLabel)}</SidebarGroupLabel>
              <SidebarMenu>{group.items.map((item) => renderItem(item))}</SidebarMenu>
            </SidebarGroup>
          ))}
        </nav>
      </ScrollArea>

      <SidebarFooter>
        {isAdminRole(userRole) && (
          <SidebarUsageCard
            accessToken={accessToken}
            collapsed={collapsed}
            onExpandRail={() => onToggleCollapsed?.()}
          />
        )}
        <SidebarAccountMenu onLogout={logout} collapsed={collapsed} />
      </SidebarFooter>
    </Sidebar>
  );
};

export default Sidebar_;

export { menuGroups };
