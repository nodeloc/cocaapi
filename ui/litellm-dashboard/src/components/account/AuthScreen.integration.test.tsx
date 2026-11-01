import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthScreen from "./AuthScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const methods = { registration_enabled: true, email_enabled: true, providers: [], csrf_token: "browser-csrf" };
const fetchMock = vi.fn<typeof fetch>();

describe("customer account forms", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/account/register/");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the entered registration credentials and CSRF token, then shows mail instructions", async () => {
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.method === "GET") return Response.json(methods);
      expect(request.url).toContain("/account/api/v1/register");
      expect(request.headers.get("X-CSRF-Token")).toBe("browser-csrf");
      expect(await request.json()).toEqual({ email: "person@example.com", password: "Account-password-123!" });
      return Response.json({ message: "verification_email_queued" }, { status: 201 });
    });
    render(<AuthScreen mode="register" />);
    const submit = await screen.findByRole("button", { name: "注册并发送验证邮件" });
    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "person@example.com" } });
    fireEvent.change(screen.getByLabelText("密码", { exact: true }), { target: { value: "Account-password-123!" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "Account-password-123!" } });
    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent("注册成功，请查收验证邮件");
  });

  it("requires an explicit click before consuming a verification link and removes its token from the URL", async () => {
    window.history.replaceState(null, "", "/account/verify/#token=single-use-mail-token-123456");
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.method === "GET") return Response.json(methods);
      expect(await request.json()).toEqual({ token: "single-use-mail-token-123456" });
      return Response.json({ message: "ok" });
    });
    render(<AuthScreen mode="verify" />);
    const submit = await screen.findByRole("button", { name: "确认验证邮箱" });
    expect(submit).toBeEnabled();
    expect(window.location.hash).toBe("");
    expect(fetchMock.mock.calls).toHaveLength(1);
    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent("邮箱验证成功");
  });

  it("keeps email registration unavailable when SMTP is not configured", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...methods, email_enabled: false }));
    render(<AuthScreen mode="register" />);
    expect(await screen.findByText("邮箱注册和找回密码将在邮件服务配置后开放。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "注册并发送验证邮件" })).not.toBeInTheDocument();
  });
});
