"use client";

import type { ReactNode } from "react";
import { Settings2, Wallet } from "lucide-react";
import { Page, PageTabs, PageTabsContent, PageTabsList, PageTabsTrigger } from "@/components/shared/Page";
import { PageHeader, PageHeaderControls, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/PageHeader";

const sections = [
  { id: "wallets", href: "/ui/commerce/", label: "用户余额" },
  { id: "redemptions", href: "/ui/commerce/redemptions/", label: "兑换码" },
  { id: "orders", href: "/ui/commerce/orders/", label: "充值订单" },
  { id: "settings", href: "/ui/commerce/settings/", label: "登录与注册" },
] as const;

export function CommercePage({ section, children }: { section: (typeof sections)[number]["id"]; children: ReactNode }) {
  const settings = section === "settings";
  return (
    <Page lang="zh-CN">
      <PageTabs value={section}>
        <PageHeader>
          <PageHeaderTitle>
            {settings ? <Settings2 /> : <Wallet />}
            {settings ? "登录与注册" : "账户与充值"}
          </PageHeaderTitle>
          <PageHeaderDescription>
            {settings ? "配置用户中心的第三方登录与新用户注册" : "管理用户额度、兑换码批次和充值订单"}
          </PageHeaderDescription>
          <PageHeaderControls>
            <PageTabsList aria-label="账户管理导航">
              {sections.map((item) => (
                <PageTabsTrigger
                  key={item.id}
                  value={item.id}
                  nativeButton={false}
                  render={<a href={item.href} aria-current={section === item.id ? "page" : undefined} />}
                >
                  {item.label}
                </PageTabsTrigger>
              ))}
            </PageTabsList>
          </PageHeaderControls>
        </PageHeader>
        <PageTabsContent value={section} className="gap-6">
          {children}
        </PageTabsContent>
      </PageTabs>
    </Page>
  );
}
