"use client";

import { useState } from "react";
import { gatewayApi } from "./gatewayApi";
import { GatewayFrame, SummaryCards, useGatewayPage, number, usd, when } from "./AccountGatewayShared";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { errorMessage } from "./accountApi";

export default function AccountGatewayCatalog({ limits = false }: { limits?: boolean }) {
  const page = useGatewayPage(gatewayApi.access);
  const [search, setSearch] = useState("");
  const models = page.data?.models.filter((name) => name.toLowerCase().includes(search.toLowerCase())) ?? [];
  const [copyMessage, setCopyMessage] = useState("");
  const copy = async (model: string) => {
    try {
      await navigator.clipboard.writeText(model);
      setCopyMessage(`已复制 ${model}`);
    } catch {
      setCopyMessage("复制失败，请选中模型名称手动复制。");
    }
  };
  return (
    <GatewayFrame
      title={limits ? "调用限额" : "模型目录"}
      description={limits ? "查看管理员分配的调用预算与速率限制" : "查看账号已获授权的模型，在 API 请求中使用模型名称"}
      page={page}
    >
      {page.data?.key_creation_reason && (
        <p className="text-sm text-muted-foreground">{errorMessage(page.data.key_creation_reason)}</p>
      )}
      {page.data &&
        (limits ? (
          <>
            <SummaryCards
              items={[
                {
                  label: "账号调用预算（USD）",
                  value: page.data.max_budget_usd == null ? "未设上限" : usd(page.data.max_budget_usd),
                },
                { label: "当前预算周期已用", value: usd(page.data.spend_usd) },
                {
                  label: "每分钟请求数",
                  value: page.data.rpm_limit == null ? "未设账号上限" : number(page.data.rpm_limit),
                },
                {
                  label: "每分钟 Token 数",
                  value: page.data.tpm_limit == null ? "未设账号上限" : number(page.data.tpm_limit),
                },
              ]}
            />
            <Card>
              <CardContent className="space-y-3">
                <h2 className="text-lg font-semibold">额度说明</h2>
                <p className="text-sm">预算下次重置：{when(page.data.budget_reset_at)}</p>
                <p className="text-sm text-muted-foreground">
                  以上为 API
                  调用预算，与钱包充值余额独立。钱包自动扣费尚未接入，充值不会自动提高调用预算；如需开通模型或额度，请联系管理员。
                </p>
                <p className="text-sm text-muted-foreground">
                  实际调用还会受到密钥、模型和平台全局限制，页面显示未设账号上限不代表平台无限额。
                </p>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-lg font-semibold">
                  可用模型 <Badge variant="secondary">{page.data.models.length}</Badge>
                </h2>
                <div className="w-full space-y-2 sm:w-72">
                  <Label htmlFor="model-search" className="sr-only">
                    搜索模型
                  </Label>
                  <Input
                    id="model-search"
                    placeholder="搜索模型名称"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              {copyMessage && (
                <p role="status" className="text-sm text-muted-foreground">
                  {copyMessage}
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>模型名称</TableHead>
                    <TableHead>访问权限</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.map((model) => (
                    <TableRow key={model}>
                      <TableCell className="break-all font-mono text-sm">{model}</TableCell>
                      <TableCell>
                        <Badge variant="outline">已授权</Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-sm underline underline-offset-4"
                          onClick={() => copy(model)}
                          aria-label={`复制模型 ${model}`}
                        >
                          复制名称
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {models.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                        {search ? "没有匹配的模型" : "尚未分配可用模型"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                模型调用需要有效个人密钥及足够的调用预算。目录仅展示访问权限，实际支持的请求类型以管理员配置为准。
              </p>
            </CardContent>
          </Card>
        ))}
    </GatewayFrame>
  );
}
