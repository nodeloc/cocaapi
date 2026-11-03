import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountWallet from "./AccountWallet";
import CommerceAdmin from "./CommerceAdmin";
const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/account/wallet/",
}));
vi.mock("@/app/(dashboard)/hooks/useAuthorized", () => ({
  default: () => ({ accessToken: "native-admin", userRole: "Admin", isViewOnly: false, isAuthorized: true }),
}));
const fetchMock = vi.fn<typeof fetch>();
const wallet = {
  user_id: "user-a",
  available_units: "5500000000",
  reserved_units: "0",
  credited_units: "5500000000",
  debited_units: "0",
  currency: "USD",
};
const empty = { items: [], has_more: false };

describe("wallet flows", () => {
  it("creates a CNY Alipay order with customer CSRF without presenting it as paid", async () => {
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.url.endsWith("/me"))
        return Response.json({ user_id: "user-a", email_verified: true, csrf_token: "customer-csrf" });
      if (request.url.endsWith("/payment-methods"))
        return Response.json({
          enabled: true,
          asset: "CNY",
          redemption_enabled: true,
          networks: [
            { id: "alipay", label: "支付宝" },
            { id: "wxpay", label: "微信支付" },
          ],
        });
      if (request.method === "POST") {
        expect(request.headers.get("X-CSRF-Token")).toBe("customer-csrf");
        expect(request.headers.has("Authorization")).toBe(false);
        expect(await request.json()).toEqual({ amount_usd: "10.00", network: "alipay" });
        return Response.json({ id: "pending-cny-order", status: "pending", asset: "CNY", payment_amount: "71.24" });
      }
      return Response.json(request.url.includes("transactions") ? empty : wallet);
    });
    render(<AccountWallet />);
    const submit = await screen.findByRole("button", { name: "创建充值订单" });
    expect(screen.getByText(/人民币/)).toBeVisible();
    fireEvent.click(submit);
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/account/orders/"));
    expect(screen.queryByText(/充值成功/)).not.toBeInTheDocument();
  });
  it.each([false, true])("creates a batch with the per-customer repeat setting %s", async (repeat) => {
    let created = false;
    const batch = {
      id: "policy-batch",
      name: "限制测试",
      face_units: "10000000000",
      count: 1,
      redeemed_count: 0,
      disabled: false,
      expires_at: null,
      created_at: "2026-11-02T00:00:00Z",
      created_by: "admin",
      allow_repeat_redemption: repeat,
    };
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.method === "POST") {
        expect(request.headers.get("Authorization")).toBe("Bearer native-admin");
        expect(await request.json()).toMatchObject({ name: "限制测试", allow_repeat_redemption: repeat });
        created = true;
        return Response.json({ batch, codes: ["COCA1-1234567890ABCDEF1234567890ABCDEF"] });
      }
      return Response.json({ items: created ? [batch] : [], has_more: false });
    });
    render(<CommerceAdmin section="redemptions" />);
    const policy = await screen.findByRole("checkbox", { name: "允许同一用户多次兑换" });
    expect(policy).not.toBeChecked();
    if (repeat) fireEvent.click(policy);
    fireEvent.change(screen.getByLabelText("批次名称"), { target: { value: "限制测试" } });
    fireEvent.click(screen.getByRole("button", { name: "生成兑换码" }));
    expect(await screen.findByRole("status")).toHaveTextContent("批次已创建");
    expect(await screen.findByText(repeat ? "允许多次" : "每人一次")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "已保存，关闭" }));
    expect(screen.getByRole("checkbox", { name: "允许同一用户多次兑换" })).not.toBeChecked();
  });

  it("explains a per-batch redemption limit without announcing a credit", async () => {
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.method === "POST") return Response.json({ detail: "redemption_limit_reached" }, { status: 409 });
      if (request.url.endsWith("/me"))
        return Response.json({ user_id: "user-a", email_verified: true, csrf_token: "customer-csrf" });
      if (request.url.endsWith("/payment-methods"))
        return Response.json({ enabled: false, redemption_enabled: true, networks: [] });
      return Response.json(request.url.includes("transactions") ? empty : wallet);
    });
    render(<AccountWallet />);
    await screen.findAllByText("$5.50");
    fireEvent.change(screen.getByLabelText("兑换码"), { target: { value: "COCA1-1234567890ABCDEF1234567890ABCDEF" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("该批次每位用户只能兑换一次，你已兑换过。");
    expect(screen.queryByText(/兑换成功/)).not.toBeInTheDocument();
  });

  it("links administrators to login and registration settings", async () => {
    fetchMock.mockResolvedValue(Response.json(empty));
    render(<CommerceAdmin />);
    expect(await screen.findByRole("tab", { name: "登录与注册" })).toHaveAttribute("href", "/ui/commerce/settings/");
  });
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("redeems the entered code with session CSRF and keeps unconfigured payments unavailable", async () => {
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.method === "POST") {
        expect(request.url).toContain("/account/api/v1/redemptions");
        expect(request.headers.get("X-CSRF-Token")).toBe("customer-csrf");
        expect(await request.json()).toEqual({ code: "COCA1-1234567890ABCDEF1234567890ABCDEF" });
        return Response.json({ delta_units: "5500000000" });
      }
      if (request.url.endsWith("/me"))
        return Response.json({ user_id: "user-a", email_verified: true, csrf_token: "customer-csrf" });
      if (request.url.endsWith("/payment-methods"))
        return Response.json({ enabled: false, redemption_enabled: true, networks: [] });
      return Response.json(request.url.includes("transactions") ? empty : wallet);
    });
    render(<AccountWallet />);
    expect(await screen.findAllByText("$5.50")).toHaveLength(2);
    expect(screen.getByText(/在线支付尚未开放/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "创建充值订单" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("兑换码"), { target: { value: "COCA1-1234567890ABCDEF1234567890ABCDEF" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    expect(await screen.findByRole("status")).toHaveTextContent("兑换成功，已入账 $5.50");
    expect(screen.getByLabelText("兑换码")).toHaveValue("");
  });

  it("keeps successful adjustments visible and clears the form if the later ledger read fails", async () => {
    let adjusted = false;
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      expect(request.headers.get("Authorization")).toBe("Bearer native-admin");
      if (request.method === "POST") {
        expect(request.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
        expect(await request.json()).toEqual({ amount_usd: "10.00", direction: "credit", reason: "补发额度" });
        adjusted = true;
        return Response.json({ id: "entry" });
      }
      if (request.url.includes("transactions"))
        return adjusted ? Response.json({ detail: "unavailable" }, { status: 503 }) : Response.json(empty);
      return Response.json({ items: [{ ...wallet, email: "user@example.test" }], has_more: false });
    });
    render(<CommerceAdmin />);
    fireEvent.click(await screen.findByRole("button", { name: "查看与调整" }));
    fireEvent.change(screen.getByLabelText("调整原因"), { target: { value: "补发额度" } });
    fireEvent.click(screen.getByRole("button", { name: "确认调整" }));
    expect(await screen.findByRole("status")).toHaveTextContent("余额已调整");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认调整" })).toBeDisabled();
  });

  it("shows API charges, reserved funds and outstanding debt separately", async () => {
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.url.endsWith("/me"))
        return Response.json({ user_id: "user-a", email_verified: true, csrf_token: "customer-csrf" });
      if (request.url.endsWith("/payment-methods"))
        return Response.json({ enabled: false, redemption_enabled: true, networks: [] });
      if (request.url.includes("transactions"))
        return Response.json({
          items: [
            {
              id: "usage-entry",
              kind: "usage",
              created_at: "2026-01-01T00:00:00Z",
              reason: "test-model · API 调用",
              delta_units: "-1000000000",
              available_after: "0",
            },
          ],
          has_more: false,
        });
      return Response.json({
        ...wallet,
        available_units: "0",
        reserved_units: "1000000000",
        debt_units: "1000000000",
        credited_units: "2000000000",
        debited_units: "2000000000",
      });
    });
    render(<AccountWallet />);
    expect(await screen.findByText("API 调用扣费")).toBeInTheDocument();
    expect(screen.getByText("调用冻结")).toBeInTheDocument();
    expect(screen.getByText("待补缴")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("后续充值或兑换将优先抵扣");
  });

  it("ignores an old customer's slow ledger response after switching customers", async () => {
    let resolveOld: (value: Response) => void = () => {
      throw new Error("No pending request");
    };
    const old = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.url.includes("user-a/transactions")) return old;
      if (request.url.includes("user-b/transactions")) return Response.json(empty);
      return Response.json({
        items: [
          { ...wallet, email: "a@example.test" },
          { ...wallet, user_id: "user-b", email: "b@example.test" },
        ],
        has_more: false,
      });
    });
    render(<CommerceAdmin />);
    const actions = await screen.findAllByRole("button", { name: "查看与调整" });
    fireEvent.click(actions[0]);
    fireEvent.click(actions[1]);
    expect(await screen.findByText("暂无余额变动")).toBeInTheDocument();
    await act(async () => {
      resolveOld(
        Response.json({
          items: [
            {
              id: "old",
              created_at: "2026-01-01T00:00:00Z",
              kind: "adjustment",
              reason: "旧账户流水",
              delta_units: "1",
              available_after: "1",
            },
          ],
          has_more: false,
        }),
      );
    });
    expect(screen.queryByText("旧账户流水")).not.toBeInTheDocument();
  });
});
