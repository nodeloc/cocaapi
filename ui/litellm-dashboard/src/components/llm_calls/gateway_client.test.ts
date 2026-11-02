import { afterEach, expect, it, vi } from "vitest";
import { registerAuthHeaderNameGetter } from "@/lib/http/runtime";
import { createGatewayClient } from "./gateway_client";
import { registerCustomerTransport } from "@/lib/http/customerTransport";
import { createCustomerTransport } from "@/components/account/native/customerNativeRequest";
vi.hoisted(() => vi.stubGlobal("window", { location: { origin: "http://localhost" } }));

it("does not automatically repeat a potentially billable customer request", async () => {
  const release = registerCustomerTransport(
    createCustomerTransport({
      user_id: "customer-a",
      email: "a@example.com",
      email_verified: true,
      has_password: true,
      bindings: [],
      csrf_token: "csrf-test",
      reauthentication_required: false,
    }),
  );
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL((input as Request).url).pathname;
    return path.endsWith("/authorize")
      ? Response.json({ message: "ok" })
      : Response.json({ choices: [{ message: { content: "already generated" } }] });
  });
  vi.stubGlobal("fetch", fetchImpl);
  try {
    const client = createGatewayClient({ accessToken: "sk-test-personal-key", baseURL: "http://localhost/v1" });
    await expect(
      client.chat.completions.create({
        model: "model-a",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      }),
    ).rejects.toThrow("模型没有返回流式响应");
    expect(fetchImpl.mock.calls.map(([input]) => new URL((input as Request).url).pathname)).toEqual([
      "/account/api/v1/gateway/playground/authorize",
      "/v1/chat/completions",
    ]);
  } finally {
    release();
    vi.unstubAllGlobals();
  }
});

vi.mock("@/components/networking", () => ({ getProxyBaseUrl: () => "https://management.example/root" }));
afterEach(() => registerAuthHeaderNameGetter(() => "Authorization"));

it.each(["Authorization", "x-session-key"])(
  "uses the gateway's %s header and retains root paths and caller headers",
  async (header) => {
    registerAuthHeaderNameGetter(() => header);
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ data: [] }), { headers: { "Content-Type": "application/json" } }),
    );
    const client = createGatewayClient({
      accessToken: "session",
      defaultHeaders: { "x-litellm-tags": "playground", "x-custom": "custom" },
      fetch: fetchImpl,
    });
    await client.models.list();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://management.example/root/models");
    const headers = new Headers(init?.headers);
    expect(headers.get(header)).toBe("Bearer session");
    expect(headers.get("x-litellm-tags")).toBe("playground");
    expect(headers.get("x-custom")).toBe("custom");
    if (header !== "Authorization") expect(headers.has("Authorization")).toBe(false);
  },
);

it("retains explicit SDK options and an intentionally supplied Playground authorization header", async () => {
  const fetchImpl = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: [] }), { headers: { "Content-Type": "application/json" } }),
  );
  const options = {
    accessToken: "session",
    baseURL: "https://models.example/v1",
    defaultHeaders: { Authorization: "Bearer explicit-playground-token" },
    fetch: fetchImpl,
    maxRetries: 0,
    timeout: 1000,
  };
  const client = createGatewayClient(options);
  await client.models.list();
  expect(fetchImpl.mock.calls[0][0]).toBe("https://models.example/v1/models");
  expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get("Authorization")).toBe(
    "Bearer explicit-playground-token",
  );
});
