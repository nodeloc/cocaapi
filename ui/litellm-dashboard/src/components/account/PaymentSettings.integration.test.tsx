import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PaymentSettings from "./PaymentSettings";

vi.mock("@/app/(dashboard)/hooks/useAuthorized", () => ({
  default: () => ({ accessToken: "native-admin", userRole: "Admin", isViewOnly: false, isAuthorized: true }),
}));
const fetchMock = vi.fn<typeof fetch>();
const configuration = {
  revision: 2,
  enabled: false,
  origin: "https://payments.example.com",
  merchant_id: "123",
  private_key_configured: true,
  public_key_configured: true,
  updated_at: null,
  notify_url: "https://example.com/commerce/webhooks/goepay",
  return_url: "https://example.com/account/billing/",
};

describe("易支付 settings", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("saves with native admin auth and clears entered PEMs after saving", async () => {
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      expect(request.headers.get("Authorization")).toBe("Bearer native-admin");
      expect(new URL(request.url).pathname).toBe("/commerce/admin/v1/payment-settings");
      if (request.method === "GET") return Response.json(configuration);
      expect(await request.json()).toEqual({
        revision: 2,
        enabled: false,
        origin: configuration.origin,
        merchant_id: "456",
        private_key: "entered-private",
        public_key: "entered-public",
        clear_private_key: false,
        clear_public_key: false,
      });
      return Response.json({ ...configuration, revision: 3, merchant_id: "456" });
    });
    render(<PaymentSettings />);
    fireEvent.change(await screen.findByLabelText("商户号"), { target: { value: "456" } });
    fireEvent.change(screen.getByLabelText("商户私钥"), { target: { value: "entered-private" } });
    fireEvent.change(screen.getByLabelText("平台公钥"), { target: { value: "entered-public" } });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    expect(await screen.findByRole("status")).toHaveTextContent("易支付设置已保存");
    expect(screen.getByLabelText("商户私钥")).toHaveValue("");
    expect(screen.getByLabelText("平台公钥")).toHaveValue("");
  });
  it("omits blank PEMs and clearing a key also disables payment", async () => {
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.method === "GET") return Response.json({ ...configuration, enabled: true });
      const body = await request.json();
      expect(body).not.toHaveProperty("private_key");
      expect(body).not.toHaveProperty("public_key");
      expect(body.enabled).toBe(false);
      expect(body.clear_private_key).toBe(true);
      return Response.json({ ...configuration, revision: 3, private_key_configured: false });
    });
    render(<PaymentSettings />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "清除商户私钥并停用支付" }));
    expect(screen.getByRole("checkbox", { name: "启用易支付" })).not.toBeChecked();
    expect(screen.getByLabelText("商户私钥")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    expect(await screen.findByRole("status")).toHaveTextContent("易支付设置已保存");
  });
  it("shows revision conflicts without claiming success and clears pasted keys", async () => {
    fetchMock.mockImplementation(async (input) =>
      (input as Request).method === "GET"
        ? Response.json(configuration)
        : Response.json({ detail: "payment_settings_conflict" }, { status: 409 }),
    );
    render(<PaymentSettings />);
    fireEvent.change(await screen.findByLabelText("商户私钥"), { target: { value: "sensitive-input" } });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("设置已被其他管理员更新");
    expect(screen.getByLabelText("商户私钥")).toHaveValue("");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
