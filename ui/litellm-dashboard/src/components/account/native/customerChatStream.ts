import { z } from "zod";
import { AccountRequestError, errorMessage } from "../accountApi";

const chunkSchema = z.object({
  id: z.string().optional(),
  object: z.literal("chat.completion.chunk").optional(),
  created: z.number().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        index: z.number().int().min(0),
        delta: z
          .object({ role: z.literal("assistant").optional(), content: z.string().nullable().optional() })
          .default({}),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .default([]),
  usage: z
    .object({
      prompt_tokens: z.number().int().min(0),
      completion_tokens: z.number().int().min(0),
      total_tokens: z.number().int().min(0),
    })
    .nullable()
    .optional(),
});
const interrupted = () => new Error("流式响应中断，请查看用量记录后重试。");

export function publicChatStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  let pending = "";
  let finished = false;
  const decoder = new TextDecoder();
  return source
    .pipeThrough(
      new TransformStream<Uint8Array, string>({
        transform(bytes, controller) {
          controller.enqueue(decoder.decode(bytes, { stream: true }));
        },
        flush(controller) {
          controller.enqueue(decoder.decode());
        },
      }),
    )
    .pipeThrough(
      new TransformStream<string, string>({
        transform(text, controller) {
          pending += text;
          if (pending.length > 1048576) throw interrupted();
          for (;;) {
            const boundary = /\r?\n\r?\n/.exec(pending);
            if (!boundary) break;
            const event = pending.slice(0, boundary.index);
            pending = pending.slice(boundary.index + boundary[0].length);
            const data = event
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (!data) continue;
            if (finished) throw interrupted();
            if (data === "[DONE]") {
              finished = true;
              controller.enqueue("data: [DONE]\n\n");
              continue;
            }
            try {
              const parsed: unknown = JSON.parse(data);
              if (parsed && typeof parsed === "object" && "error" in parsed) throw interrupted();
              const chunk = chunkSchema.parse(parsed);
              controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
            } catch {
              throw interrupted();
            }
          }
        },
        flush() {
          if (!finished || pending.trim()) throw interrupted();
        },
      }),
    )
    .pipeThrough(new TextEncoderStream());
}

export async function streamResponse(response: Response): Promise<Response> {
  if (!response.ok) {
    const body = await response.text();
    const code = [
      "insufficient_balance",
      "wallet_billing_unavailable",
      "wallet_pricing_unavailable",
      "wallet_request_not_supported",
    ].find((candidate) => body.includes(candidate));
    throw new AccountRequestError(errorMessage(code ?? "model_request_rejected"), response.status);
  }
  if (!response.body || !response.headers.get("Content-Type")?.includes("text/event-stream")) {
    await response.body?.cancel();
    throw new AccountRequestError("模型没有返回流式响应，请稍后重试。", 502);
  }
  return new Response(publicChatStream(response.body), {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
  });
}
