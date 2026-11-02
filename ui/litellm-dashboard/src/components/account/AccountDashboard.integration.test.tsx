import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountProfile from "./AccountProfile";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/account/profile/" }));
const fetchMock = vi.fn<typeof fetch>();
const profile = {
  user_id: "customer-123",
  email: "person@example.com",
  email_verified: true,
  has_password: true,
  csrf_token: "customer-csrf",
  bindings: [],
  reauthentication_required: false,
};
const methods = { registration_enabled: true, email_enabled: true, providers: [], csrf_token: "customer-csrf" };

describe("customer dashboard", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    replace.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input) =>
      Response.json((input as Request).url.endsWith("/me") ? profile : methods),
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  it("provides the user sidebar and keeps account overview separate from security forms", async () => {
    render(<AccountProfile />);
    const navigation = await screen.findByRole("navigation", { name: "用户中心导航" });
    expect(within(navigation).getByRole("link", { name: "安全设置" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/account\/security\/?$/),
    );
    expect(within(navigation).getByRole("link", { name: "我的账号" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "API 密钥" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/account\/keys\/?$/),
    );
    expect(within(navigation).getByRole("link", { name: "用量统计" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/account\/usage\/?$/),
    );
    expect(within(navigation).getByRole("link", { name: "接入文档" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/account\/docs\/?$/),
    );
    expect(screen.queryByLabelText("新密码")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "登录与注册" })).not.toBeInTheDocument();
  });
  it("logs out with the customer CSRF token without a native admin authorization header", async () => {
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.method === "POST") {
        expect(request.url).toContain("/account/api/v1/logout");
        expect(request.headers.get("X-CSRF-Token")).toBe("customer-csrf");
        expect(request.headers.has("Authorization")).toBe(false);
        return Response.json({ message: "ok" });
      }
      return Response.json(request.url.endsWith("/me") ? profile : methods);
    });
    render(<AccountProfile />);
    await waitFor(() => expect(screen.getByRole("button", { name: "账号菜单" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "账号菜单" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "退出登录" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account/login/"));
  });
  it("opens mobile navigation with the same customer destinations", async () => {
    render(<AccountProfile />);
    fireEvent.click(screen.getByRole("button", { name: "打开用户导航" }));
    const menu = await screen.findByRole("dialog", { name: "用户中心菜单" });
    expect(within(menu).getByRole("link", { name: "充值订单" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/account\/orders\/?$/),
    );
    fireEvent.click(within(menu).getByRole("button", { name: "收起侧栏" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("keeps password changes available on the security page", async () => {
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.method === "POST") {
        expect(request.url).toContain("/account/api/v1/password");
        expect(request.headers.get("X-CSRF-Token")).toBe("customer-csrf");
        expect(await request.json()).toEqual({
          password: "New-password-123!",
          current_password: "Current-password-123!",
        });
        return Response.json({ message: "ok" });
      }
      return Response.json(request.url.endsWith("/me") ? profile : methods);
    });
    render(<AccountProfile security />);
    fireEvent.change(await screen.findByLabelText("当前密码"), { target: { value: "Current-password-123!" } });
    fireEvent.change(screen.getByLabelText("新密码"), { target: { value: "New-password-123!" } });
    fireEvent.change(screen.getByLabelText("确认新密码"), { target: { value: "New-password-123!" } });
    fireEvent.click(screen.getByRole("button", { name: "保存密码" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account/login/"));
  });
  it("keeps the account visible and reports a failed logout", async () => {
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.method === "POST") return Response.json({ detail: "invalid_csrf" }, { status: 403 });
      return Response.json(request.url.endsWith("/me") ? profile : methods);
    });
    render(<AccountProfile />);
    await waitFor(() => expect(screen.getByRole("button", { name: "账号菜单" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "账号菜单" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "退出登录" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("页面状态已过期，请刷新页面后重试");
    expect(replace).not.toHaveBeenCalled();
  });
  it("shows logout errors after leaving the mobile navigation drawer", async () => {
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.method === "POST") return Response.json({ detail: "invalid_csrf" }, { status: 403 });
      return Response.json(request.url.endsWith("/me") ? profile : methods);
    });
    render(<AccountProfile />);
    await waitFor(() => expect(screen.getByRole("button", { name: "账号菜单" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "打开用户导航" }));
    const dialog = await screen.findByRole("dialog", { name: "用户中心菜单" });
    fireEvent.click(within(dialog).getByRole("button", { name: "账号菜单" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "退出登录" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("页面状态已过期，请刷新页面后重试");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
