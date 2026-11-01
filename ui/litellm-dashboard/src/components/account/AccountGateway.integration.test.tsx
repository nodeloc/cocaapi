import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AccountGatewayKeys from "./AccountGatewayKeys";
import AccountGatewayPlayground from "./AccountGatewayPlayground";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/account/keys/" }));
const fetchMock = vi.fn<typeof fetch>();
const profile = {
  user_id: "customer-a",
  email: "customer@example.com",
  email_verified: true,
  has_password: true,
  csrf_token: "customer-csrf",
  bindings: [],
  reauthentication_required: false,
};
const access = {
  models: ["granted-model"],
  max_budget_usd: 20,
  spend_usd: 1,
  rpm_limit: 10,
  tpm_limit: 1000,
  budget_reset_at: null,
  can_create_key: true,
  key_creation_reason: null,
};

beforeEach(() => {
  replace.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input) => {
    const request = input as Request;
    if (request.url.endsWith("/me")) return Response.json(profile);
    if (request.url.endsWith("/access")) return Response.json(access);
    return Response.json({ items: [], has_more: false });
  });
});
afterEach(() => vi.unstubAllGlobals());

it("creates a personal key with customer CSRF and lets the user dismiss its one-time secret", async () => {
  fetchMock.mockImplementation(async (input) => {
    const request = input as Request;
    if (request.url.endsWith("/me")) return Response.json(profile);
    if (request.url.endsWith("/access")) return Response.json(access);
    if (request.method === "POST") {
      expect(request.headers.get("X-CSRF-Token")).toBe("customer-csrf");
      expect(request.headers.has("Authorization")).toBe(false);
      expect(await request.json()).toEqual({ name: "my application", expires_in_days: 30 });
      return Response.json({ key: "sk-one-time-customer-secret" }, { status: 201 });
    }
    return Response.json({ items: [], has_more: false });
  });
  render(<AccountGatewayKeys />);
  fireEvent.change(await screen.findByLabelText("密钥名称"), { target: { value: "my application" } });
  fireEvent.click(screen.getByRole("button", { name: "创建密钥", exact: true }));
  expect(await screen.findByText("sk-one-time-customer-secret", { exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "我已保存，关闭显示" }));
  expect(screen.queryByText("sk-one-time-customer-secret")).not.toBeInTheDocument();
});

it("requires confirmation and the scoped key id before deleting a personal key", async () => {
  let deleted = false;
  fetchMock.mockImplementation(async (input) => {
    const request = input as Request;
    if (request.url.endsWith("/me")) return Response.json(profile);
    if (request.url.endsWith("/access")) return Response.json(access);
    if (request.method === "POST") {
      expect(request.url).toContain("/keys/opaque-owned-key/delete");
      expect(request.headers.get("X-CSRF-Token")).toBe("customer-csrf");
      deleted = true;
      return Response.json({ message: "ok" });
    }
    return Response.json({
      items: deleted
        ? []
        : [
            {
              id: "opaque-owned-key",
              name: "personal",
              models: ["granted-model"],
              spend_usd: 0,
              max_budget_usd: 20,
              expires_at: null,
              created_at: null,
              blocked: false,
            },
          ],
      has_more: false,
    });
  });
  render(<AccountGatewayKeys />);
  fireEvent.click(await screen.findByRole("button", { name: "删除 personal" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "确认删除" }));
  expect(await screen.findByText("暂无个人密钥")).toBeVisible();
});

it("blocks key creation when the account has no model entitlement", async () => {
  const deniedAccess = { ...access, models: [], can_create_key: false, key_creation_reason: "model_access_required" };
  fetchMock.mockImplementation(async (input) => {
    const request = input as Request;
    if (request.url.endsWith("/me")) return Response.json(profile);
    if (request.url.endsWith("/access")) return Response.json(deniedAccess);
    return Response.json({ items: [], has_more: false });
  });
  render(<AccountGatewayKeys />);
  expect(await screen.findByText("尚未分配可用模型，请联系管理员开通。")).toBeVisible();
  expect(screen.getByRole("button", { name: "创建密钥", exact: true })).toBeDisabled();
});

it("submits an owned API key and prompt through the customer playground without a browser admin token", async () => {
  fetchMock.mockImplementation(async (input) => {
    const request = input as Request;
    if (request.url.endsWith("/me")) return Response.json(profile);
    if (request.url.endsWith("/access")) return Response.json(access);
    expect(request.url).toContain("/account/api/v1/gateway/playground");
    expect(request.headers.get("X-CSRF-Token")).toBe("customer-csrf");
    expect(request.headers.has("Authorization")).toBe(false);
    expect(await request.json()).toEqual({
      api_key: "sk-customer-only-secret",
      model: "granted-model",
      prompt: "hello model",
    });
    return Response.json({ content: "model response" });
  });
  render(<AccountGatewayPlayground />);
  await waitFor(() => expect(screen.getByLabelText("模型")).toHaveValue("granted-model"));
  fireEvent.change(screen.getByLabelText("API 密钥", { selector: "input" }), {
    target: { value: "sk-customer-only-secret" },
  });
  fireEvent.change(screen.getByLabelText("输入内容"), { target: { value: "hello model" } });
  fireEvent.click(screen.getByRole("button", { name: "发送测试请求" }));
  expect(await screen.findByText("model response", { exact: true })).toBeVisible();
  expect(screen.getByLabelText("API 密钥", { selector: "input" })).toHaveAttribute("type", "password");
});
