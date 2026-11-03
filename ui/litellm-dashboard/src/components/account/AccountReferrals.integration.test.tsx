import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AccountReferrals from "./AccountReferrals";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/account/referrals/" }));
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it("creates a stable invitation link with customer CSRF and shows disabled campaign without promising a reward", async () => {
  let created = false;
  const code = "valid-referral-code-12345";
  const link = `https://example.com/account/register/?ref=${code}`;
  fetchMock.mockImplementation(async (input) => {
    const request = input as Request;
    if (request.url.endsWith("/me"))
      return Response.json({ user_id: "user-a", email_verified: true, csrf_token: "customer-csrf" });
    if (request.method === "POST") {
      expect(request.headers.get("X-CSRF-Token")).toBe("customer-csrf");
      expect(request.headers.has("Authorization")).toBe(false);
      created = true;
      return Response.json({ code, created_at: "2030-01-01T00:00:00Z" });
    }
    return Response.json({
      enabled: false,
      inviter_units: "0",
      invitee_units: "0",
      eligible: true,
      invite_code: created ? code : null,
      invite_url: created ? link : null,
      invited_count: 0,
      earned_units: "0",
      signup_bonus_units: "0",
      items: [],
      has_more: false,
    });
  });
  render(<AccountReferrals />);
  fireEvent.click(await screen.findByRole("button", { name: "生成邀请链接" }));
  expect(await screen.findByDisplayValue(link)).toHaveAttribute("readonly");
  expect(screen.getByText("邀请奖励活动暂未开启，当前新注册不发放奖励。")).toBeInTheDocument();
  expect(screen.queryByText(/奖励已到账/)).not.toBeInTheDocument();
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  fireEvent.click(screen.getByRole("button", { name: "复制链接" }));
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
});

it("ignores a slower page response after returning to the first page", async () => {
  let finishNext: (value: Response) => void = () => {
    throw new Error("No deferred request");
  };
  const pending = new Promise<Response>((resolve) => {
    finishNext = resolve;
  });
  const row = (label: string) => ({
    id: label,
    invitee_label: label,
    state: "inactive",
    inviter_units: "0",
    invitee_units: "0",
    created_at: "2030-01-01T00:00:00Z",
    rewarded_at: null,
  });
  const base = {
    enabled: false,
    inviter_units: "0",
    invitee_units: "0",
    eligible: true,
    invite_code: null,
    invite_url: null,
    invited_count: 26,
    earned_units: "0",
    signup_bonus_units: "0",
    has_more: true,
  };
  fetchMock.mockImplementation(async (input) => {
    const request = input as Request;
    if (request.url.endsWith("/me"))
      return Response.json({ user_id: "user-a", email_verified: true, csrf_token: "customer-csrf" });
    if (new URL(request.url).searchParams.get("offset") === "25") return pending;
    return Response.json({ ...base, items: [row("first-page-user")] });
  });
  render(<AccountReferrals />);
  await screen.findByText("first-page-user");
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await vi.waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([request]) => new URL((request as Request).url).searchParams.get("offset") === "25"),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "上一页" }));
  await act(async () => {
    finishNext(Response.json({ ...base, items: [row("second-page-user")] }));
  });
  expect(screen.getByText("first-page-user")).toBeInTheDocument();
  expect(screen.queryByText("second-page-user")).not.toBeInTheDocument();
});
