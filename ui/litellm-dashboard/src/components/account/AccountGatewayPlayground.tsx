"use client";
import { useState, type FormEvent } from "react";
import { gatewayApi } from "./gatewayApi";
import { GatewayFrame, useGatewayPage } from "./AccountGatewayShared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { errorMessage } from "./accountApi";
export default function AccountGatewayPlayground() {
  const page = useGatewayPage(gatewayApi.access);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const clear = () => {
    setKey("");
    setPrompt("");
    setAnswer("");
  };
  const selected = page.data?.models.includes(model) ? model : page.data?.models[0] ?? "";
  const canSend = Boolean(page.profile && selected && page.data?.can_create_key);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!page.profile || busy) return;
    setBusy(true);
    setAnswer("");
    try {
      const result = await gatewayApi.chat({ api_key: key, model: selected, prompt }, page.profile.csrf_token);
      setAnswer(result.content);
    } catch (cause) {
      page.report(cause);
    } finally {
      setBusy(false);
    }
  };
  return (
    <GatewayFrame title="Playground" description="使用自己的 API 密钥测试模型，请求按实际调用计费" page={page}>
      {page.data?.key_creation_reason && (
        <p className="text-sm text-muted-foreground">{errorMessage(page.data.key_creation_reason)}</p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardContent>
            <form onSubmit={send} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="playground-key">API 密钥</Label>
                <Input
                  id="playground-key"
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  required
                  maxLength={256}
                  disabled={busy}
                />
                <p className="text-xs text-muted-foreground">
                  仅使用当前账号的个人密钥，页面不会将密钥保存到浏览器存储。
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="playground-model">模型</Label>
                <select
                  id="playground-model"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={selected}
                  onChange={(e) => setModel(e.target.value)}
                  required
                  disabled={busy || !selected}
                >
                  {!selected && <option value="">暂无可用模型</option>}
                  {page.data?.models.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="playground-prompt">输入内容</Label>
                <Textarea
                  id="playground-prompt"
                  rows={8}
                  maxLength={8000}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  required
                  disabled={busy}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || !canSend}>
                  {busy ? "正在生成…" : "发送测试请求"}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={clear}>
                  清空
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-lg font-semibold">模型回复</h2>
            {busy ? (
              <p role="status" className="text-sm text-muted-foreground">
                等待模型响应…
              </p>
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm leading-7">
                {answer || "发送请求后在这里查看回复。"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </GatewayFrame>
  );
}
