"use client";

import { gatewayApi } from "./gatewayApi";
import { walletApi } from "./walletApi";
import { formatCredits } from "./money";
import { errorMessage } from "./accountApi";
import { GatewayFrame, SummaryCards, useGatewayPage, number, usd } from "./AccountGatewayShared";
import { Card, CardContent } from "@/components/ui/card";

const load = async () => {
  const [access, usage, wallet] = await Promise.all([gatewayApi.access(), gatewayApi.usage(), walletApi.balance()]);
  return { access, usage, wallet };
};

export default function AccountGatewayHome() {
  const page = useGatewayPage(load);
  return (
    <GatewayFrame title="概览" description="个人 API 网关，查看额度、调用和开发入口" page={page}>
      {page.data && (
        <>
          <SummaryCards
            items={[
              { label: "钱包余额（USD 额度）", value: formatCredits(page.data.wallet.available_units) },
              { label: "近 30 天请求", value: number(page.data.usage.totals.requests) },
              { label: "近 30 天 Token", value: number(page.data.usage.totals.total_tokens) },
              { label: "近 30 天调用费用", value: usd(page.data.usage.totals.spend_usd) },
            ]}
          />
          {page.data.access.key_creation_reason && (
            <Card>
              <CardContent className="space-y-2">
                <h2 className="font-semibold">开通调用权限</h2>
                <p className="text-sm text-muted-foreground">{errorMessage(page.data.access.key_creation_reason)}</p>
                <p className="text-sm text-muted-foreground">
                  钱包余额与调用预算独立，当前需由管理员分配模型和调用额度。
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { title: "API 密钥", href: "/account/keys/", detail: "为应用创建个人密钥，管理有效期和删除操作" },
          { title: "模型目录", href: "/account/models/", detail: "查看已授权模型，复制 API 模型名称" },
          { title: "Playground", href: "/account/playground/", detail: "使用自己的密钥发送真实模型请求" },
          { title: "用量统计", href: "/account/usage/", detail: "查看每日调用、Token 与模型费用" },
          { title: "余额与充值", href: "/account/wallet/", detail: "兑换额度，查看充值记录和余额流水" },
          { title: "接入文档", href: "/account/docs/", detail: "使用兼容 OpenAI 的接口接入应用" },
        ].map((item) => (
          <Card key={item.href}>
            <CardContent className="space-y-2">
              <a href={item.href} className="font-semibold hover:underline">
                {item.title}
              </a>
              <p className="text-sm text-muted-foreground">{item.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </GatewayFrame>
  );
}
