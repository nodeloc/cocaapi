"use client";
import { localizedProperty, markUiCopy, translateMessage, useUiLocale } from "@/lib/i18n";

import type { ReactNode } from "react";
import { Settings2, Wallet } from "lucide-react";
import { Page, PageTabs, PageTabsContent, PageTabsList, PageTabsTrigger } from "@/components/shared/Page";
import { PageHeader, PageHeaderControls, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/PageHeader";

const sections = [
  markUiCopy({ id: "wallets", href: "/ui/commerce/", label: "用户余额" }, { label: "用户余额" }),
  markUiCopy({ id: "redemptions", href: "/ui/commerce/redemptions/", label: "兑换码" }, { label: "兑换码" }),
  markUiCopy({ id: "orders", href: "/ui/commerce/orders/", label: "充值订单" }, { label: "充值订单" }),
  markUiCopy({ id: "groups", href: "/ui/commerce/groups/", label: "分组与倍率" }, { label: "分组与倍率" }),
  markUiCopy({ id: "settings", href: "/ui/commerce/settings/", label: "登录与注册" }, { label: "登录与注册" }),
] as const;

export function CommercePage({ section, children }: { section: (typeof sections)[number]["id"]; children: ReactNode }) {
  useUiLocale();
  const settings = section === "settings";
  return (
    <Page>
      <PageTabs value={section}>
        <PageHeader>
          <PageHeaderTitle>
            {settings ? <Settings2 /> : <Wallet />}
            {settings ? translateMessage("登录与注册") : translateMessage("账户与充值")}
          </PageHeaderTitle>
          <PageHeaderDescription>
            {settings
              ? translateMessage("配置用户中心的第三方登录与新用户注册")
              : translateMessage("管理用户额度、分组倍率、兑换码批次和充值订单")}
          </PageHeaderDescription>
          <PageHeaderControls>
            <PageTabsList aria-label={translateMessage("账户管理导航")}>
              {sections.map((item) => (
                <PageTabsTrigger
                  key={item.id}
                  value={item.id}
                  nativeButton={false}
                  render={<a href={item.href} aria-current={section === item.id ? "page" : undefined} />}
                >
                  {localizedProperty(item, "label", item.label)}
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
