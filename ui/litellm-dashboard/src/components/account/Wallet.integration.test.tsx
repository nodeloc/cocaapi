import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountWallet from "./AccountWallet";
import CommerceAdmin from "./CommerceAdmin";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
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
  it("links administrators to login and registration settings", async () => {
    fetchMock.mockResolvedValue(Response.json(empty));
    render(<CommerceAdmin />);
    expect(await screen.findByRole("link", { name: "登录与注册" })).toHaveAttribute("href", "/ui/commerce/settings/");
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
    expect(await screen.findByText("$5.50")).toBeInTheDocument();
    expect(screen.getByText(/USDT 支付尚未开放/)).toBeInTheDocument();
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
