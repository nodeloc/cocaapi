import { expect, it, vi } from "vitest";
import { publicChatStream, streamResponse } from "./customerChatStream";

it("preserves the wallet rejection and hides unrelated upstream error details", async () => {
  await expect(
    streamResponse(Response.json({ error: { message: "insufficient_balance" } }, { status: 402 })),
  ).rejects.toMatchObject({ status: 402, message: "可用余额不足以支付本次调用，请充值或降低输出 Token 上限。" });
  await expect(
    streamResponse(Response.json({ error: { message: "private upstream diagnostic" } }, { status: 500 })),
  ).rejects.toMatchObject({ status: 500, message: "模型调用被拒绝，请检查密钥有效期、模型权限、预算和速率限制。" });
});

const encoder = new TextEncoder();
const event = (content: string) =>
  `data: ${JSON.stringify({ id: "completion-a", model: "model-a", choices: [{ index: 0, delta: { content }, finish_reason: null }], private: "hidden" })}\r\n\r\n`;

it("emits complete events before the upstream ends and preserves split UTF-8, usage and finish reason", async () => {
  let upstream!: ReadableStreamDefaultController<Uint8Array>;
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      upstream = controller;
    },
  });
  const reader = publicChatStream(source).getReader();
  const first = reader.read();
  const bytes = encoder.encode(event("你好"));
  const split = bytes.indexOf(0xe4) + 1;
  upstream.enqueue(bytes.slice(0, split));
  upstream.enqueue(bytes.slice(split));
  const visible = await first;
  expect(new TextDecoder().decode(visible.value)).toContain("你好");
  expect(new TextDecoder().decode(visible.value)).not.toContain("hidden");
  upstream.enqueue(
    encoder.encode(
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"length"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5,"cost":0,"is_byok":false}}\n\ndata: [DONE]\n\n',
    ),
  );
  upstream.close();
  const remainder = await new Response(
    new ReadableStream({
      async start(controller) {
        for (;;) {
          const item = await reader.read();
          if (item.done) break;
          controller.enqueue(item.value);
        }
        controller.close();
      },
    }),
  ).text();
  expect(remainder).toContain('"finish_reason":"length"');
  expect(remainder).toContain('"total_tokens":5');
  expect(remainder).toContain("[DONE]");
  expect(remainder).not.toContain('"cost"');
});

it.each(["broken", '{"error":{"message":"provider-private-details"}}'])(
  "rejects invalid or failed events safely: %s",
  async (payload) => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        controller.close();
      },
    });
    await expect(new Response(publicChatStream(source)).text()).rejects.toThrow("流式响应中断");
  },
);

it("does not treat a prematurely closed stream as a completed answer", async () => {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(event("partial")));
      controller.close();
    },
  });
  await expect(new Response(publicChatStream(source)).text()).rejects.toThrow("流式响应中断");
});

it("propagates reader cancellation to the upstream", async () => {
  const cancelled = vi.fn();
  const source = new ReadableStream<Uint8Array>({ cancel: cancelled });
  await publicChatStream(source).cancel();
  await vi.waitFor(() => expect(cancelled).toHaveBeenCalledOnce());
});
