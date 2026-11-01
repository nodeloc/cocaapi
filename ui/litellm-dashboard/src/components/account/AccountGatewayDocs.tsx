"use client";

import { useState } from "react";
import { gatewayApi } from "./gatewayApi";
import { GatewayFrame, useGatewayPage } from "./AccountGatewayShared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function Example({ title, code }: { title: string; code: string }) {
  const [feedback, setFeedback] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setFeedback("已复制");
    } catch {
      setFeedback("复制失败，请手动复制");
    }
  };
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-semibold">{title}</h2>
          <Button size="sm" variant="outline" onClick={copy}>
            复制示例
          </Button>
        </div>
        {feedback && (
          <p role="status" className="text-xs text-muted-foreground">
            {feedback}
          </p>
        )}
        <pre className="max-w-full overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-6">
          <code>{code}</code>
        </pre>
      </CardContent>
    </Card>
  );
}

export default function AccountGatewayDocs() {
  const page = useGatewayPage(gatewayApi.access);
  const model = page.data?.models[0] ?? "YOUR_MODEL_ID";
  const curl = `curl https://cocaapi.com/v1/chat/completions \\
  -H "Authorization: Bearer $COCAAPI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ model, messages: [{ role: "user", content: "Hello" }] }, null, 2)}'`;
  const python = `import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["COCAAPI_API_KEY"],
    base_url="https://cocaapi.com/v1",
)
response = client.chat.completions.create(
    model=${JSON.stringify(model)},
    messages=[{"role": "user", "content": "Hello"}],
)
print(response.choices[0].message.content)`;
  return (
    <GatewayFrame title="接入文档" description="使用个人 API 密钥接入兼容 OpenAI 的 API" page={page}>
      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-lg font-semibold">开始使用</h2>
          <p className="text-sm">
            API Base URL：<code className="break-all rounded bg-muted px-2 py-1">https://cocaapi.com/v1</code>
          </p>
          <p className="text-sm text-muted-foreground">
            先在
            <a href="/account/models/" className="underline">
              模型目录
            </a>
            确认权限，再在
            <a href="/account/keys/" className="underline">
              API 密钥
            </a>
            创建密钥。将密钥设置为环境变量 COCAAPI_API_KEY，替换示例中的模型名称。
          </p>
          <p className="text-sm text-muted-foreground">
            请在自己的服务端保管密钥，避免将它写入公开代码、网页或分享链接。
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <a
              href="https://docs.litellm.ai/docs/proxy/user_keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              客户端接入参考
            </a>
            <a
              href="https://models.litellm.ai/cookbook"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              学习资源
            </a>
          </div>
        </CardContent>
      </Card>
      <Example title="cURL 请求" code={curl} />
      <Example title="Python OpenAI SDK" code={python} />
    </GatewayFrame>
  );
}
