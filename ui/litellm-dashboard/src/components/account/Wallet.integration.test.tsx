import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountWallet from "./AccountWallet";
import CommerceAdmin from "./CommerceAdmin";
import { OrdersTable } from "./WalletTables";
const push = vi.fn();
const replace = vi.fn();
const assign = vi.fn();

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
  it("removes payment when the link expires while the order table stays open", async () => {
    vi.useFakeTimers();
    const now = new Date("2030-01-01T00:00:00Z");
    vi.setSystemTime(now);
    const onCheckout = vi.fn();
    const onRefresh = vi.fn();
    const order = {
      id: "expires-on-screen",
      user_id: "user-a",
      credit_units: "1000000000",
      network: "alipay" as const,
      asset: "CNY" as const,
      provider: "goepay",
      status: "pending" as const,
      amount_usdt: null,
      payment_amount: "7.00",
      checkout_url: "https://payments.example.test/checkout/test",
      external_id: "external-test",
      expires_at: null,
      checkout_expires_at: new Date(now.getTime() + 1_000).toISOString(),
      paid_at: null,
      review_reason: null,
      created_at: now.toISOString(),
    };
    render(
      <OrdersTable
        orders={{ items: [order], has_more: false }}
        busy={false}
        checkout
        onRefresh={onRefresh}
        onCheckout={onCheckout}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "去支付" }));
    expect(onCheckout).toHaveBeenCalledWith(order.id);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001);
    });
    expect(screen.queryByRole("button", { name: "去支付" })).not.toBeInTheDocument();
    expect(screen.getByText("已过期", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查单" }));
    expect(onRefresh).toHaveBeenCalledWith(order.id);
  });

  it("uses the current clock when pending orders arrive after the table sat idle", async () => {
    vi.useFakeTimers();
    const now = new Date("2030-01-01T00:00:00Z");
    vi.setSystemTime(now);
    const onCheckout = vi.fn();
    const onRefresh = vi.fn();
    const view = render(
      <OrdersTable orders={empty} busy={false} checkout onRefresh={onRefresh} onCheckout={onCheckout} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const order = {
      id: "arrived-after-idle",
      user_id: "user-a",
      credit_units: "1000000000",
      network: "alipay" as const,
      asset: "CNY" as const,
      provider: "goepay",
      status: "pending" as const,
      amount_usdt: null,
      payment_amount: "7.00",
      checkout_url: "https://payments.example.test/checkout/test",
      external_id: "external-test",
      expires_at: null,
      checkout_expires_at: new Date(Date.now() + 1_000).toISOString(),
      paid_at: null,
      review_reason: null,
      created_at: now.toISOString(),
    };
    view.rerender(
      <OrdersTable
        orders={{ items: [order], has_more: false }}
        busy={false}
        checkout
        onRefresh={onRefresh}
        onCheckout={onCheckout}
      />,
    );
    expect(screen.getByRole("button", { name: "去支付" })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001);
    });
    expect(screen.queryByRole("button", { name: "去支付" })).not.toBeInTheDocument();
    expect(screen.getByText("已过期", { exact: true })).toBeInTheDocument();
  });

  it.each(["paid", "expired"] as const)(
    "checks an existing order and avoids redirecting when it is %s",
    async (status) => {
      const pending = {
        id: "checked-before-paying",
        user_id: "user-a",
        credit_units: "1000000000",
        network: "alipay",
        asset: "CNY",
        provider: "goepay",
        status: "pending",
        amount_usdt: null,
        payment_amount: "7.00",
        checkout_url: "https://payments.example.test/checkout/test",
        external_id: "external-test",
        expires_at: null,
        checkout_expires_at: new Date(Date.now() + 60_000).toISOString(),
        paid_at: null,
        review_reason: null,
        created_at: new Date().toISOString(),
      };
      let checked = false;
      fetchMock.mockImplementation(async (input) => {
        const request = input as Request;
        const updated = { ...pending, status };
        if (request.method === "POST") {
          expect(new URL(request.url).pathname).toBe(`/account/api/v1/recharge-orders/${pending.id}/refresh`);
          expect(request.headers.get("X-CSRF-Token")).toBe("customer-csrf");
          checked = true;
          return Response.json(updated);
        }
        if (request.url.endsWith("/me"))
          return Response.json({ user_id: "user-a", email_verified: true, csrf_token: "customer-csrf" });
        if (request.url.endsWith("/payment-methods")) return Response.json({ enabled: true, networks: [] });
        if (new URL(request.url).pathname.endsWith("/recharge-orders"))
          return Response.json({ items: [checked ? updated : pending], has_more: false });
        return Response.json(wallet);
      });
      render(<AccountWallet ordersOnly />);
      fireEvent.click(await screen.findByRole("button", { name: "去支付" }));
      expect(await screen.findByRole("status")).toHaveTextContent(
        status === "paid" ? "充值已到账" : "支付链接已过期或不可用",
      );
      expect(assign).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "去支付" })).not.toBeInTheDocument();
    },
  );

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
        return Response.json({
          id: "pending-cny-order",
          status: "pending",
          asset: "CNY",
          payment_amount: "71.24",
          checkout_url: "https://payments.example.test/checkout/test",
          checkout_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      return Response.json(request.url.includes("transactions") ? empty : wallet);
    });
    render(<AccountWallet />);
    const submit = await screen.findByRole("button", { name: "去支付" });
    expect(screen.getByText(/人民币/)).toBeVisible();
    fireEvent.click(submit);
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("https://payments.example.test/checkout/test"));
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
    expect(screen.getByRole("tab", { name: "用户", exact: true })).toHaveAttribute("href", "/ui/users/?userTab=wallets");
  });

  it("embeds wallet management without a second finance navigation and links the same user's permissions", async () => {
    fetchMock.mockResolvedValue(Response.json({ items: [{ ...wallet, email: "customer@example.test" }], has_more: false }));
    render(<CommerceAdmin embedded />);
    expect(await screen.findByText("customer@example.test")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "用户权限" })).toHaveAttribute("href", "/ui/users?user=user-a");
    expect(screen.queryByRole("tablist", { name: "账户管理导航" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看与调整" }));
    expect(screen.getByRole("heading", { name: "余额调整" })).toBeInTheDocument();
  });
  beforeEach(() => {
    fetchMock.mockReset();
    assign.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { ...window.location, assign });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

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
    expect(screen.queryByRole("button", { name: "去支付" })).not.toBeInTheDocument();
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
