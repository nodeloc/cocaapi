import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginSettings from "./LoginSettings";

vi.mock("@/app/(dashboard)/hooks/useAuthorized", () => ({
  default: () => ({ accessToken: "native-admin", userRole: "Admin", isViewOnly: false, isAuthorized: true }),
}));
const fetchMock = vi.fn<typeof fetch>();
const configuration = {
  revision: 2,
  registration_enabled: false,
  email_enabled: false,
  updated_at: null,
  providers: ["github", "google", "nodeloc"].map((id) => ({
    id,
    label: { github: "GitHub", google: "Google", nodeloc: "NodeLoc" }[id],
    enabled: false,
    client_id: "",
    secret_configured: false,
    callback_url: `https://example.com/account/api/v1/oauth/${id}/callback`,
  })),
};

describe("login settings", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("saves NodeLoc credentials with native authorization, then clears the password input", async () => {
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      expect(request.headers.get("Authorization")).toBe("Bearer native-admin");
      if (request.method === "GET") return Response.json(configuration);
      const body = await request.json();
      expect(body.revision).toBe(2);
      expect(body.registration_enabled).toBe(true);
      expect(body.providers.find((provider: { id: string }) => provider.id === "nodeloc")).toEqual({
        id: "nodeloc",
        enabled: true,
        client_id: "node-app",
        client_secret: "entered-secret",
        clear_secret: false,
      });
      return Response.json({
        ...configuration,
        revision: 3,
        registration_enabled: true,
        providers: configuration.providers.map((provider) =>
          provider.id === "nodeloc"
            ? { ...provider, enabled: true, client_id: "node-app", secret_configured: true }
            : provider,
        ),
      });
    });
    render(<LoginSettings />);
    const client = await screen.findByLabelText("NodeLoc Client ID");
    fireEvent.change(client, { target: { value: "node-app" } });
    fireEvent.change(screen.getByLabelText("NodeLoc Client Secret"), { target: { value: "entered-secret" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "启用 NodeLoc 登录" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "允许新用户注册" }));
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    expect(await screen.findByRole("status")).toHaveTextContent("登录与注册设置已保存");
    expect(screen.getByLabelText("NodeLoc Client Secret")).toHaveValue("");
    expect(screen.getByText("密钥已配置")).toBeInTheDocument();
  });
  it("omits blank secrets and requires explicit clearing that disables the provider", async () => {
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      const current = {
        ...configuration,
        providers: configuration.providers.map((provider) => ({
          ...provider,
          enabled: true,
          secret_configured: true,
          client_id: provider.id + "-app",
        })),
      };
      if (request.method === "GET") return Response.json(current);
      const body = await request.json();
      expect(body.providers.find((provider: { id: string }) => provider.id === "github")).not.toHaveProperty(
        "client_secret",
      );
      expect(body.providers.find((provider: { id: string }) => provider.id === "nodeloc")).toEqual({
        id: "nodeloc",
        enabled: false,
        client_id: "nodeloc-app",
        clear_secret: true,
      });
      return Response.json({ ...current, revision: 3 });
    });
    render(<LoginSettings />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "清除 NodeLoc 密钥并停用登录" }));
    expect(screen.getByRole("checkbox", { name: "启用 NodeLoc 登录" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    expect(await screen.findByRole("status")).toHaveTextContent("设置已保存");
  });
});
