"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMediaQuery } from "usehooks-ts";
import {
  ChevronsUpDown,
  House,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  ShieldCheck,
  Wallet,
  KeyRound,
  Boxes,
  FlaskConical,
  ChartColumn,
  ScrollText,
  Gauge,
  BookOpen,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  sidebarMenuButtonVariants,
} from "@/components/shared/Sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import ThemeToggle from "@/components/ThemeToggle/ThemeToggle";
import { Page } from "@/components/shared/Page";
import { PageHeader, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/PageHeader";
import { AccountNotice } from "./AccountShell";
import { accountApi, type Profile } from "./accountApi";
import { CocaApiLogo } from "@/components/common_components/CocaApiLogo";

const groups = [
  {
    label: "AI 网关",
    items: [
      { label: "概览", href: "/account/home/", icon: Gauge },
      { label: "API 密钥", href: "/account/keys/", icon: KeyRound },
      { label: "模型目录", href: "/account/models/", icon: Boxes },
      { label: "Playground", href: "/account/playground/", icon: FlaskConical },
    ],
  },
  {
    label: "用量与记录",
    items: [
      { label: "用量统计", href: "/account/usage/", icon: ChartColumn },
      { label: "请求日志", href: "/account/logs/", icon: ScrollText },
      { label: "调用限额", href: "/account/limits/", icon: Gauge },
    ],
  },
  {
    label: "用户中心",
    items: [
      { label: "我的账号", href: "/account/profile/", icon: House },
      { label: "余额与充值", href: "/account/wallet/", icon: Wallet },
      { label: "充值订单", href: "/account/orders/", icon: ReceiptText },
    ],
  },
  { label: "账号管理", items: [{ label: "安全设置", href: "/account/security/", icon: ShieldCheck }] },
  { label: "开发者工具", items: [{ label: "接入文档", href: "/account/docs/", icon: BookOpen }] },
] as const;

function AccountNavigation({
  profile,
  collapsed,
  onToggle,
  onLogout,
  busy,
}: {
  profile: Profile | null;
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
  busy: boolean;
}) {
  const pathname = usePathname()?.replace(/\/?$/, "/");
  const identity = profile?.email ?? "个人账号";
  return (
    <Sidebar collapsed={collapsed}>
      <SidebarHeader className="h-14 border-b border-border group-data-[collapsed=true]/sidebar:h-auto">
        <div className="flex items-center justify-between gap-2 group-data-[collapsed=true]/sidebar:flex-col">
          <a
            href="/account/home/"
            aria-label="CocaAPI 用户中心"
            className="min-w-0 text-xl font-semibold tracking-tight"
          >
            <CocaApiLogo compact={collapsed} className={collapsed ? undefined : "w-[120px]"} />
          </a>
          <Button variant="ghost" size="icon-sm" aria-label={collapsed ? "展开侧栏" : "收起侧栏"} onClick={onToggle}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent aria-label="用户中心导航">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map(({ label, href, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <a
                    href={href}
                    aria-label={label}
                    aria-current={pathname === href ? "page" : undefined}
                    title={collapsed ? label : undefined}
                    className={sidebarMenuButtonVariants({ isActive: pathname === href })}
                  >
                    <Icon strokeWidth={1.75} />
                    <span className="truncate group-data-[collapsed=true]/sidebar:hidden">{label}</span>
                  </a>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="h-auto w-full justify-start gap-2 p-1.5"
                aria-label="账号菜单"
                disabled={!profile || busy}
              />
            }
          >
            <Avatar className="size-8 shrink-0">
              <AvatarFallback>{identity.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 text-left group-data-[collapsed=true]/sidebar:hidden">
              <span className="block truncate text-[13px] font-medium">{profile ? identity : "正在加载账号…"}</span>
              <span className="block text-xs text-muted-foreground">个人账户</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 group-data-[collapsed=true]/sidebar:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-52">
            <DropdownMenuItem onClick={onLogout} disabled={busy}>
              <LogOut />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AccountDashboardShell({
  title,
  description,
  profile,
  children,
  nativeContent = false,
}: {
  title: string;
  description: string;
  profile: Profile | null;
  children: ReactNode;
  nativeContent?: boolean;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isDesktop = useMediaQuery("(min-width: 768px)", { initializeWithValue: false });
  if (isDesktop && mobileOpen) setMobileOpen(false);
  const logout = async () => {
    if (!profile || busy) return;
    setMobileOpen(false);
    setBusy(true);
    setError("");
    try {
      await accountApi.logout(profile.csrf_token);
      router.replace("/account/login/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "退出失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <div lang="zh-CN" className="flex h-screen overflow-hidden bg-background text-foreground max-md:h-dvh">
        <a
          href="#account-main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-floating focus:rounded-md focus:bg-background focus:p-3 focus:ring-2"
        >
          跳至主要内容
        </a>
        <div className="hidden h-full md:flex">
          <AccountNavigation
            profile={profile}
            collapsed={collapsed}
            onToggle={() => setCollapsed((value) => !value)}
            onLogout={logout}
            busy={busy}
          />
        </div>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="gap-0 p-0 data-[side=left]:w-[min(280px,calc(100vw-3rem))] [&_[data-slot=sidebar]]:w-full"
          onClickCapture={(event) => {
            if (event.target instanceof Element && event.target.closest("a[href]")) setMobileOpen(false);
          }}
        >
          <SheetTitle className="sr-only">用户中心菜单</SheetTitle>
          <AccountNavigation
            profile={profile}
            collapsed={false}
            onToggle={() => setMobileOpen(false)}
            onLogout={logout}
            busy={busy}
          />
        </SheetContent>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-14 flex-none items-center justify-between gap-4 border-b border-border bg-background px-4 max-md:gap-2 max-md:px-2">
            <SheetTrigger
              render={<Button variant="ghost" size="icon" className="size-11 md:hidden" aria-label="打开用户导航" />}
            >
              <Menu />
            </SheetTrigger>
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem className="hidden md:inline-flex">
                  <BreadcrumbLink href="/account/home/">用户中心</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:flex" />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate">{title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <ThemeToggle />
          </header>
          <main id="account-main" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            {nativeContent ? (
              <div className="h-full min-h-0 w-full">
                <AccountNotice error={error} message="" />
                {children}
              </div>
            ) : (
              <Page>
                <PageHeader>
                  <PageHeaderTitle>{title}</PageHeaderTitle>
                  <PageHeaderDescription>{description}</PageHeaderDescription>
                </PageHeader>
                <AccountNotice error={error} message="" />
                {children}
              </Page>
            )}
          </main>
        </div>
      </div>
    </Sheet>
  );
}
