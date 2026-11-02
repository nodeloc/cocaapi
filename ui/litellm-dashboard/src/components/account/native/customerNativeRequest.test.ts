import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCustomerTransport } from "./customerNativeRequest";
import { dashboardFetch, registerCustomerTransport } from "@/lib/http/customerTransport";
import { registerAuthHeaderNameGetter } from "@/lib/http/runtime";
import type { Profile } from "../accountApi";
import { nativeWindow } from "./customerNativeUsage";
vi.hoisted(() => vi.stubGlobal("window", { location: { origin: "http://localhost" } }));

const profile: Profile = {
  user_id: "customer-a",
  email: "a@example.com",
  email_verified: true,
  has_password: true,
  bindings: [],
  csrf_token: "csrf-a",
  reauthentication_required: false,
};
const access = {
  models: ["model-a", "model-b"],
  max_budget_usd: 20,
  spend_usd: 1,
  rpm_limit: 10,
  tpm_limit: 1000,
  budget_reset_at: null,
  can_create_key: true,
  key_creation_reason: null,
};
const key = (id: string, name: string, blocked = false) => ({
  id,
  name,
  models: ["model-a"],
  spend_usd: 0,
  max_budget_usd: null,
  expires_at: null,
  created_at: "2026-01-01T00:00:00Z",
  blocked,
});
const fetchMock = vi.fn<typeof fetch>();
let release: (() => void) | undefined;
const request = (path: string, body?: object) =>
  new Request(
    "http://localhost" + path,
    body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined,
  );
beforeEach(() => {
  fetchMock.mockReset();
  registerAuthHeaderNameGetter(() => "Authorization");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input) => {
    const req = input as Request;
    const path = new URL(req.url).pathname;
    expect(path).toMatch(/^\/account\/api\/v1\/gateway\//);
    expect(req.headers.has("Authorization")).toBe(false);
    if (path.endsWith("/access")) return Response.json(access);
    if (path.endsWith("/keys"))
      return req.method === "GET"
        ? Response.json({ items: [key("own-a", "Zulu"), key("own-b", "Alpha", true)], has_more: false })
        : Response.json({ key: "sk-one-time-owned" }, { status: 201 });
    if (path.endsWith("/delete")) return Response.json({ message: "ok" });
    if (path.endsWith("/playground"))
      return Response.json({
        content: "answer",
        request_id: "req-own",
        created: 123,
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      });
    if (path.endsWith("/logs"))
      return Response.json({
        items: [
          {
            request_id: "failed-own",
            model: "model-a",
            status: "failure",
            started_at: "2026-01-01T00:00:00Z",
            ended_at: "2026-01-01T00:00:01Z",
            prompt_tokens: 2,
            completion_tokens: 0,
            total_tokens: 2,
            spend_usd: 0,
          },
        ],
        has_more: false,
      });
    if (path.endsWith("/own-b")) return Response.json(key("own-b", "Alpha", true));
    return Response.json(key("own-a", "Zulu"));
  });
});
afterEach(() => {
  release?.();
  release = undefined;
  registerAuthHeaderNameGetter(() => "Authorization");
  vi.unstubAllGlobals();
});

it("routes native components to customer APIs and fails closed for admin mutations", async () => {
  release = registerCustomerTransport(createCustomerTransport(profile));
  const result = await dashboardFetch(request("/key/list"));
  expect((await result.json()).keys).toHaveLength(2);
  const before = fetchMock.mock.calls.length;
  const forbidden = await dashboardFetch(request("/config/update", { master_key: "forged" }));
  expect(forbidden.status).toBe(403);
  expect(fetchMock).toHaveBeenCalledTimes(before);
});

it("preserves administrator requests when customer transport is absent", async () => {
  fetchMock.mockResolvedValue(Response.json({ native: true }));
  const req = request("/key/list");
  req.headers.set("Authorization", "Bearer native-admin");
  expect((await dashboardFetch(req)).ok).toBe(true);
  const sent = fetchMock.mock.calls[0][0] as Request;
  expect(sent.url).toBe(req.url);
  expect(sent.headers.get("Authorization")).toBe("Bearer native-admin");
});

it("rejects stale customer markers and off-origin requests", async () => {
  const req = request("/key/list");
  req.headers.set("X-Test-Auth", "Bearer customer-ui:customer-a");
  expect((await dashboardFetch(req)).status).toBe(401);
  release = registerCustomerTransport(createCustomerTransport(profile));
  expect((await dashboardFetch("https://other.example/key/list")).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("honors native key status filters, ID filters and sorting", async () => {
  const transport = createCustomerTransport(profile);
  const active = await transport.request(request("/key/list?status=active"));
  expect((await active.json()).keys.map((row: { token: string }) => row.token)).toEqual(["own-a"]);
  const deleted = await transport.request(request("/key/list?status=deleted"));
  expect((await deleted.json()).keys).toEqual([]);
  const sorted = await transport.request(request("/key/list?sort_by=key_alias&sort_order=asc"));
  expect((await sorted.json()).keys.map((row: { key_alias: string }) => row.key_alias)).toEqual(["Alpha", "Zulu"]);
  const exact = await transport.request(request("/key/list?key_hash=own-b"));
  expect((await exact.json()).keys.map((row: { token: string }) => row.token)).toEqual(["own-b"]);
});

it("selects the requested model and limits native model pages to own grants", async () => {
  const transport = createCustomerTransport(profile);
  const details = await transport.request(request("/model/info?modelId=model-b"));
  expect((await details.json()).data.map((row: { model_name: string }) => row.model_name)).toEqual(["model-b"]);
  const unknown = await transport.request(request("/model/info?modelId=other-model"));
  expect((await unknown.json()).data).toEqual([]);
  const page = await transport.request(request("/model/info?page=2&size=1"));
  expect((await page.json()).data.map((row: { model_name: string }) => row.model_name)).toEqual(["model-b"]);
  const descending = await transport.request(request("/model/info?sortOrder=desc"));
  expect((await descending.json()).data.map((row: { model_name: string }) => row.model_name)).toEqual([
    "model-b",
    "model-a",
  ]);
  const groups = await transport.request(request("/models?only_model_access_groups=True"));
  expect((await groups.json()).data).toEqual([]);
});

it("creates and deletes through CSRF without forwarding native credentials", async () => {
  const transport = createCustomerTransport(profile);
  const created = await transport.request(
    request("/key/generate", { key_alias: "personal", duration: "1h", models: ["model-a"], key_type: "llm_api" }),
  );
  expect((await created.json()).key).toBe("sk-one-time-owned");
  const post = fetchMock.mock.calls.map((call) => call[0] as Request).find((req) => req.method === "POST");
  expect(post?.headers.get("X-CSRF-Token")).toBe(profile.csrf_token);
  expect(await post?.json()).toEqual({ name: "personal", duration: "1h", models: ["model-a"], expires_in_days: 30 });
  const removed = await transport.request(request("/key/delete", { keys: ["own-a"] }));
  expect(removed.status).toBe(200);
  const deletion = fetchMock.mock.calls.at(-1)?.[0] as Request;
  expect(deletion.url).toContain("/keys/own-a/delete");
  expect(deletion.headers.get("X-CSRF-Token")).toBe(profile.csrf_token);
  const count = fetchMock.mock.calls.length;
  expect(
    (await transport.request(request("/key/generate", { key_alias: "forged", team_id: "other-team" }))).status,
  ).toBe(403);
  expect(fetchMock).toHaveBeenCalledTimes(count);
});

it("preserves conversation and actual usage with a configurable auth header", async () => {
  registerAuthHeaderNameGetter(() => "X-Gateway-Key");
  const transport = createCustomerTransport(profile);
  const messages = [
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
    { role: "user", content: "continue" },
  ];
  const req = request("/v1/chat/completions", { model: "model-a", messages, stream: false });
  req.headers.set("X-Gateway-Key", "Bearer sk-owned-secret");
  const answer = await transport.request(req);
  expect((await answer.json()).usage.total_tokens).toBe(5);
  const submitted = fetchMock.mock.calls.at(-1)?.[0] as Request;
  expect(await submitted.json()).toEqual({
    api_key: "sk-owned-secret",
    model: "model-a",
    messages,
    prompt: "",
    max_tokens: 4096,
  });
  expect(submitted.headers.get("X-CSRF-Token")).toBe(profile.csrf_token);
});

it("loads owned failure details without prompt, upstream or other customer data", async () => {
  const result = await createCustomerTransport(profile).request(
    request("/spend/logs/ui/failed-own?start_date=2026-01-01"),
  );
  const details = await result.json();
  expect(details.metadata.status).toBe("failure");
  expect(details.messages).toBeNull();
  expect(details.response).toBeNull();
  const nativeRequest = fetchMock.mock.calls.at(-1)?.[0] as Request;
  expect(new URL(nativeRequest.url).searchParams.get("request_id")).toBe("failed-own");
  expect(new URL(nativeRequest.url).searchParams.get("start_time")).toBe("2026-01-01T00:00:00.000Z");
});

it("forwards the selected output limit and preserves a truncated completion", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ content: "partial", finish_reason: "length" }));
  const req = request("/v1/chat/completions", {
    model: "model-a",
    messages: [{ role: "user", content: "hello" }],
    stream: false,
    max_tokens: 8192,
  });
  req.headers.set("Authorization", "Bearer sk-owned-secret");
  const response = await createCustomerTransport(profile).request(req);
  expect((await response.json()).choices[0]).toMatchObject({
    message: { content: "partial" },
    finish_reason: "length",
  });
  const submitted = fetchMock.mock.calls.at(-1)?.[0] as Request;
  expect(await submitted.json()).toMatchObject({ max_tokens: 8192 });
});

it("authorizes the personal key before opening a live stream and forwards only allowed fields", async () => {
  const sent: Request[] = [];
  fetchMock.mockImplementation(async (input) => {
    const req = input as Request;
    sent.push(req);
    if (new URL(req.url).pathname.endsWith("/authorize")) return Response.json({ message: "ok" });
    return new Response(
      'data: {"choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });
  const controller = new AbortController();
  const req = new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    signal: controller.signal,
    headers: { Authorization: "Bearer sk-owned-secret" },
    body: JSON.stringify({
      model: "model-a",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
      max_tokens: 8192,
      user: "forged-owner",
      extra_body: { max_tokens: 1 },
      stream_options: { include_usage: false },
    }),
  });
  const result = await createCustomerTransport(profile).request(req);
  expect(result.headers.get("Content-Type")).toContain("text/event-stream");
  expect(await result.text()).toContain("hello");
  expect(sent.map((item) => new URL(item.url).pathname)).toEqual([
    "/account/api/v1/gateway/playground/authorize",
    "/v1/chat/completions",
  ]);
  expect(sent[0].headers.get("X-CSRF-Token")).toBe(profile.csrf_token);
  expect(sent[1].headers.get("Authorization")).toBe("Bearer sk-owned-secret");
  expect(sent[1].headers.has("X-CSRF-Token")).toBe(false);
  expect(sent[1].credentials).toBe("omit");
  expect(await sent[1].json()).toEqual({
    model: "model-a",
    messages: [{ role: "user", content: "hello" }],
    max_tokens: 8192,
    stream: true,
    stream_options: { include_usage: true },
  });
  controller.abort();
  expect(sent[1].signal.aborted).toBe(true);
});

it("does not open the native stream when account authorization rejects the key", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ detail: "key_not_found" }, { status: 404 }));
  const req = request("/v1/chat/completions", {
    model: "model-a",
    messages: [{ role: "user", content: "hello" }],
    stream: true,
  });
  req.headers.set("Authorization", "Bearer sk-other-key");
  expect((await createCustomerTransport(profile).request(req)).status).toBe(404);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("converts native local-day filters to UTC bounds", () => {
  expect(
    nativeWindow(new URLSearchParams({ start_date: "2026-11-02", end_date: "2026-11-02", timezone: "-480" })),
  ).toEqual({
    start_time: "2026-11-01T16:00:00.000Z",
    end_time: "2026-11-02T16:00:00.000Z",
  });
});
