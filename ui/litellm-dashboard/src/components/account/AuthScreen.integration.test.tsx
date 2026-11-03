import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthScreen from "./AuthScreen";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { setUiLocale } from "@/lib/i18n/locale";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/account/register/" }));

const methods = { registration_enabled: true, email_enabled: true, providers: [], csrf_token: "browser-csrf" };
const fetchMock = vi.fn<typeof fetch>();

describe("customer account forms", () => {
  it("translates the account heading and submit label without clearing registration credentials", async () => {
    fetchMock.mockResolvedValue(Response.json(methods));
    render(
      <LanguageProvider>
        <AuthScreen mode="register" />
      </LanguageProvider>,
    );
    act(() => setUiLocale("zh"));
    const email = await screen.findByLabelText("邮箱");
    fireEvent.change(email, { target: { value: "person@example.com" } });
    act(() => setUiLocale("en"));
    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register and send verification email" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBe(email);
    expect(email).toHaveValue("person@example.com");
  });
  it("shows an actionable message for rejected OAuth app credentials", async () => {
    window.history.replaceState(null, "", "/account/login/?error=provider_credentials_invalid");
    fetchMock.mockResolvedValue(Response.json(methods));
    render(<AuthScreen mode="login" />);
    expect(
      await screen.findByText("第三方登录的应用凭据无效，请联系管理员检查 Client ID 和 Client Secret。"),
    ).toBeInTheDocument();
  });
  beforeEach(() => {
    sessionStorage.clear();
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

  it("passes an invitation through email registration and clears it only after successful registration", async () => {
    const code = "valid-referral-code-12345";
    window.history.replaceState(null, "", `/account/register/?ref=${code}`);
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.method === "GET") return Response.json(methods);
      expect(await request.json()).toMatchObject({ referral_code: code, email: "invited@example.com" });
      return Response.json({ message: "verification_email_queued" }, { status: 201 });
    });
    render(<AuthScreen mode="register" />);
    const submit = await screen.findByRole("button", { name: "注册并发送验证邮件" });
    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "invited@example.com" } });
    fireEvent.change(screen.getByLabelText("密码", { exact: true }), { target: { value: "Account-password-123!" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "Account-password-123!" } });
    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent("注册成功");
    expect(sessionStorage.getItem("cocaapi.referral")).toBeNull();
  });

  it("passes the invitation into OAuth start and preserves it when authorization fails", async () => {
    const code = "valid-referral-code-12345";
    window.history.replaceState(null, "", `/account/register/?ref=${code}`);
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.method === "GET")
        return Response.json({ ...methods, providers: [{ id: "github", label: "GitHub" }] });
      expect(new URL(request.url).pathname).toBe("/account/api/v1/oauth/github/start");
      expect(await request.json()).toMatchObject({ referral_code: code, intent: "login" });
      return Response.json({ detail: "provider_credentials_invalid" }, { status: 503 });
    });
    render(<AuthScreen mode="register" />);
    fireEvent.click(await screen.findByRole("button", { name: "GitHub 登录" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("第三方登录的应用凭据无效");
    expect(sessionStorage.getItem("cocaapi.referral")).toBe(code);
  });

  it("lets a user remove an invitation before registration", async () => {
    window.history.replaceState(null, "", "/account/register/?ref=unknown-referral-code");
    fetchMock.mockResolvedValue(Response.json(methods));
    render(<AuthScreen mode="register" />);
    fireEvent.click(await screen.findByRole("button", { name: "取消邀请" }));
    expect(sessionStorage.getItem("cocaapi.referral")).toBeNull();
    expect(new URLSearchParams(window.location.search).has("ref")).toBe(false);
    expect(screen.queryByRole("button", { name: "取消邀请" })).not.toBeInTheDocument();
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
