"use client";
import { useCallback, useState, type FormEvent } from "react";
import { gatewayApi } from "./gatewayApi";
import { GatewayFrame, useGatewayPage, usd, when } from "./AccountGatewayShared";
import { errorMessage } from "./accountApi";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Pager } from "./WalletTables";
import { AccountNotice } from "./AccountShell";

export default function AccountGatewayKeys() {
  const [offset, setOffset] = useState(0);
  const load = useCallback(
    async () => ({ keys: await gatewayApi.keys(offset), access: await gatewayApi.access() }),
    [offset],
  );
  const page = useGatewayPage(load);
  const [name, setName] = useState("");
  const [days, setDays] = useState("30");
  const [issued, setIssued] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);
  const canCreate = Boolean(
    page.profile && page.data?.access.can_create_key && !page.profile.reauthentication_required,
  );
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!page.profile || busy) return;
    setBusy(true);
    setIssued("");
    setMessage("");
    try {
      const result = await gatewayApi.create(name.trim(), Number(days), page.profile.csrf_token);
      setIssued(result.key);
      setName("");
      page.refresh();
    } catch (cause) {
      page.report(cause);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!pending || !page.profile || busy) return;
    setBusy(true);
    try {
      await gatewayApi.remove(pending.id, page.profile.csrf_token);
      setPending(null);
      setMessage("密钥已删除。");
      page.refresh();
    } catch (cause) {
      setPending(null);
      page.report(cause);
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued);
      setMessage("密钥已复制。");
    } catch {
      setMessage("复制失败，请选中密钥手动复制。");
    }
  };
  return (
    <GatewayFrame title="API 密钥" description="管理自己的个人 API 密钥，密钥完整内容仅在创建后显示一次" page={page}>
      <AccountNotice error="" message={message} />
      {issued && (
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-lg font-semibold">保存新密钥</h2>
            <p className="text-sm text-muted-foreground">关闭后无法再次查看，请妥善保存，不要公开分享。</p>
            <code className="block break-all rounded-md border bg-muted p-4 text-sm select-all">{issued}</code>
            <div className="flex flex-wrap gap-2">
              <Button onClick={copy}>复制密钥</Button>
              <Button variant="outline" onClick={() => setIssued("")}>
                我已保存，关闭显示
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {page.data && (
        <>
          <Card>
            <CardContent className="space-y-4">
              <h2 className="text-lg font-semibold">创建个人密钥</h2>
              {page.data.access.key_creation_reason && (
                <p className="text-sm text-muted-foreground">{errorMessage(page.data.access.key_creation_reason)}</p>
              )}
              {page.profile?.reauthentication_required && (
                <p className="text-sm text-muted-foreground">
                  创建或删除密钥前，请先在
                  <a href="/account/security/" className="underline">
                    安全设置
                  </a>
                  重新验证身份。
                </p>
              )}
              <form onSubmit={create} className="grid items-end gap-4 sm:grid-cols-[1fr_10rem_auto]">
                <div className="space-y-2">
                  <Label htmlFor="key-name">密钥名称</Label>
                  <Input
                    id="key-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    required
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="key-days">有效天数</Label>
                  <Input
                    id="key-days"
                    type="number"
                    min={1}
                    max={365}
                    step={1}
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    required
                    disabled={busy}
                  />
                </div>
                <Button type="submit" disabled={busy || !canCreate}>
                  {busy ? "正在处理…" : "创建密钥"}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">密钥继承管理员分配的模型和调用限制，不能提升账号权限。</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4">
              <h2 className="text-lg font-semibold">我的密钥</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    {["名称", "可用模型", "已用费用 / 密钥预算", "到期时间", "状态", "操作"].map((label) => (
                      <TableHead key={label}>{label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.data.keys.items.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="min-w-32 max-w-56 break-all font-medium">{key.name}</TableCell>
                      <TableCell className="min-w-40 max-w-72 break-all">
                        {key.models.join(", ") || "继承账号权限"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {usd(key.spend_usd)} / {key.max_budget_usd == null ? "未设上限" : usd(key.max_budget_usd)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{when(key.expires_at)}</TableCell>
                      <TableCell>
                        <Badge variant={key.blocked ? "secondary" : "outline"}>{key.blocked ? "已停用" : "正常"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`删除 ${key.name}`}
                          disabled={busy || !page.profile || page.profile.reauthentication_required}
                          onClick={() => setPending({ id: key.id, name: key.name })}
                        >
                          删除
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {page.data.keys.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        暂无个人密钥
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <Pager offset={offset} hasMore={page.data.keys.has_more} busy={busy || page.loading} onPage={setOffset} />
            </CardContent>
          </Card>
        </>
      )}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>删除密钥</AlertDialogTitle>
          <AlertDialogDescription>确认删除「{pending?.name}」？使用它的应用将无法继续调用。</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={remove}>
              确认删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </GatewayFrame>
  );
}
