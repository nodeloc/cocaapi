import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders, testQueryClient } from "@/../tests/test-utils";
import UserWalletDialog, { type WalletAdjustmentRequests } from "./UserWalletDialog";

const network = vi.fn<typeof fetch>();
const wallet = {
  user_id: "user-a",
  email: "customer@example.test",
  available_units: "5500000000",
  reserved_units: "0",
  debt_units: "0",
  credited_units: "5500000000",
  debited_units: "0",
  currency: "USD",
};
const close = vi.fn();
const requests: WalletAdjustmentRequests = new Map();

beforeEach(() => {
  testQueryClient.clear();
  network.mockReset();
  close.mockReset();
  requests.clear();
  network.mockImplementation(async (input) => {
    const request = input as Request;
    expect(request.headers.get("Authorization")).toBe("Bearer native-admin");
    if (request.url.endsWith("/lookup")) {
      expect(await request.json()).toEqual({ user_ids: ["user-a"] });
      return Response.json({ items: [wallet], has_more: false });
    }
    return Response.json({ items: [], has_more: false });
  });
  vi.stubGlobal("fetch", network);
});
afterEach(() => vi.unstubAllGlobals());

it("adjusts the displayed account and retains the success if the subsequent ledger read fails", async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <UserWalletDialog token="native-admin" userId="user-a" email={wallet.email} onClose={close} requests={requests} />,
  );
  expect(await screen.findByText("$5.50", { exact: true })).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "调整余额", exact: true }));
  fireEvent.change(screen.getByLabelText("金额（USD）"), { target: { value: "2.50" } });
  fireEvent.change(screen.getByLabelText("调整原因"), { target: { value: "补发额度" } });
  let adjusted = false;
  network.mockImplementation(async (input) => {
    const request = input as Request;
    if (request.url.endsWith("/adjustments")) {
      expect(request.url).toContain("/user-a/adjustments");
      expect(request.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
      expect(await request.json()).toEqual({ amount_usd: "2.50", direction: "credit", reason: "补发额度" });
      adjusted = true;
      return Response.json({ id: "credit" });
    }
    if (request.url.endsWith("/lookup"))
      return Response.json({ items: [{ ...wallet, available_units: "8000000000" }], has_more: false });
    return adjusted
      ? Response.json({ detail: "unavailable" }, { status: 503 })
      : Response.json({ items: [], has_more: false });
  });
  await user.click(screen.getByRole("button", { name: "确认调整", exact: true }));
  expect(await screen.findByRole("status")).toHaveTextContent("余额已调整");
  expect(screen.getByLabelText("金额（USD）")).toHaveValue("");
  expect(screen.getByRole("button", { name: "确认调整", exact: true })).toBeDisabled();
  expect(await screen.findByText("$8.00", { exact: true })).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "余额流水", exact: true }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("余额已调整");
});

it("restores an ambiguous adjustment after closing and reopening and retries with the original key", async () => {
  const user = userEvent.setup();
  const view = renderWithProviders(
    <UserWalletDialog token="native-admin" userId="user-a" email={wallet.email} onClose={close} requests={requests} />,
  );
  await screen.findByText("$5.50", { exact: true });
  await user.click(screen.getByRole("tab", { name: "调整余额", exact: true }));
  fireEvent.change(screen.getByLabelText("金额（USD）"), { target: { value: "1.00" } });
  fireEvent.change(screen.getByLabelText("调整原因"), { target: { value: "重试额度调整" } });
  const keys: string[] = [];
  network.mockImplementation(async (input) => {
    const request = input as Request;
    if (request.url.endsWith("/adjustments")) {
      keys.push(request.headers.get("Idempotency-Key") ?? "");
      throw new Error("Connection lost");
    }
    return Response.json({ items: [wallet], has_more: false });
  });
  await user.click(screen.getByRole("button", { name: "确认调整", exact: true }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Close", exact: true }));
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  renderWithProviders(
    <UserWalletDialog token="native-admin" userId="user-a" email={wallet.email} onClose={close} requests={requests} />,
  );
  await user.click(screen.getByRole("tab", { name: "调整余额", exact: true }));
  expect(screen.getByLabelText("金额（USD）")).toHaveValue("1.00");
  expect(screen.getByLabelText("调整原因")).toHaveValue("重试额度调整");
  await user.click(screen.getByRole("button", { name: "确认调整", exact: true }));
  await screen.findByRole("alert");
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  fireEvent.change(screen.getByLabelText("金额（USD）"), { target: { value: "2.00" } });
  await user.click(screen.getByRole("button", { name: "确认调整", exact: true }));
  await screen.findByRole("alert");
  expect(keys).toHaveLength(3);
  expect(keys[2]).not.toBe(keys[0]);
});
