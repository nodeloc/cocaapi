"use client";

import { useCallback, useState } from "react";
import { gatewayApi } from "./gatewayApi";
import { GatewayFrame, SummaryCards, useGatewayPage, number, usd, when } from "./AccountGatewayShared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Pager } from "./WalletTables";

function Range({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="usage-range">时间范围</Label>
      <select
        id="usage-range"
        value={days}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border bg-background px-3 py-2 text-sm"
      >
        <option value={7}>最近 7 天</option>
        <option value={30}>最近 30 天</option>
      </select>
    </div>
  );
}

export default function AccountGatewayUsage() {
  const [days, setDays] = useState(30);
  const load = useCallback(() => gatewayApi.usage(days), [days]);
  const page = useGatewayPage(load);
  return (
    <GatewayFrame title="用量统计" description="查看自己的个人密钥调用情况，统计按 UTC 日期汇总" page={page}>
      <div className="flex flex-wrap justify-between gap-4">
        <Range days={days} onChange={setDays} />
        <Button variant="outline" disabled={page.loading} onClick={page.refresh}>
          刷新统计
        </Button>
      </div>
      {page.data && (
        <>
          <SummaryCards
            items={[
              { label: "请求次数", value: number(page.data.totals.requests) },
              { label: "总 Token 数", value: number(page.data.totals.total_tokens) },
              {
                label: "输入 / 输出 Token",
                value: `${number(page.data.totals.prompt_tokens)} / ${number(page.data.totals.completion_tokens)}`,
              },
              { label: "调用费用（USD）", value: usd(page.data.totals.spend_usd) },
            ]}
          />
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <Card>
              <CardContent className="space-y-4">
                <h2 className="text-lg font-semibold">每日用量</h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["日期（UTC）", "请求", "Token", "费用"].map((label) => (
                        <TableHead key={label}>{label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.data.daily.map((row) => (
                      <TableRow key={row.day}>
                        <TableCell className="whitespace-nowrap">{row.day}</TableCell>
                        <TableCell>{number(row.requests)}</TableCell>
                        <TableCell>{number(row.total_tokens)}</TableCell>
                        <TableCell>{usd(row.spend_usd)}</TableCell>
                      </TableRow>
                    ))}
                    {page.data.daily.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                          所选范围内暂无调用
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-4">
                <h2 className="text-lg font-semibold">模型用量</h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["模型", "请求", "Token", "费用"].map((label) => (
                        <TableHead key={label}>{label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.data.models.map((row) => (
                      <TableRow key={row.model}>
                        <TableCell className="max-w-56 break-all">{row.model}</TableCell>
                        <TableCell>{number(row.requests)}</TableCell>
                        <TableCell>{number(row.total_tokens)}</TableCell>
                        <TableCell>{usd(row.spend_usd)}</TableCell>
                      </TableRow>
                    ))}
                    {page.data.models.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                          暂无模型用量
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground">
            调用记录可能有短暂写入延迟。费用来自网关调用日志，不等同于钱包余额变动；模型汇总最多展示 100 个模型。
          </p>
        </>
      )}
    </GatewayFrame>
  );
}

export function AccountGatewayLogs() {
  const [days, setDays] = useState(30);
  const [offset, setOffset] = useState(0);
  const load = useCallback(() => gatewayApi.logs(days, offset), [days, offset]);
  const page = useGatewayPage(load);
  return (
    <GatewayFrame title="请求日志" description="仅展示自己个人密钥的请求摘要，包含已删除密钥的历史记录" page={page}>
      <div className="flex flex-wrap justify-between gap-4">
        <Range
          days={days}
          onChange={(value) => {
            setDays(value);
            setOffset(0);
          }}
        />
        <Button variant="outline" disabled={page.loading} onClick={page.refresh}>
          刷新日志
        </Button>
      </div>
      {page.data && (
        <Card>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  {["请求 ID / 时间", "模型", "状态", "Token", "费用（USD）"].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.data.items.map((row) => (
                  <TableRow key={row.request_id}>
                    <TableCell className="min-w-48">
                      <p className="max-w-64 break-all font-mono text-xs">{row.request_id}</p>
                      <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">{when(row.started_at)}</p>
                    </TableCell>
                    <TableCell className="max-w-60 break-all">{row.model}</TableCell>
                    <TableCell>{row.status || "未记录"}</TableCell>
                    <TableCell>{number(row.total_tokens)}</TableCell>
                    <TableCell>{usd(row.spend_usd)}</TableCell>
                  </TableRow>
                ))}
                {page.data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      所选范围内暂无请求日志
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <Pager offset={offset} hasMore={page.data.has_more} busy={page.loading} onPage={setOffset} />
          </CardContent>
        </Card>
      )}
    </GatewayFrame>
  );
}
