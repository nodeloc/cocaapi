import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ReferralSettings from "./ReferralSettings";

vi.mock("@/app/(dashboard)/hooks/useAuthorized", () => ({
  default: () => ({ accessToken: "native-admin", userRole: "Admin", isViewOnly: false, isAuthorized: true }),
}));
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it("shows disabled activity and saves both configured rewards using native admin auth", async () => {
  const current = { revision: 2, enabled: false, inviter_units: "0", invitee_units: "0", updated_at: null };
  fetchMock.mockImplementation(async (input) => {
    const request = input as Request;
    expect(request.headers.get("Authorization")).toBe("Bearer native-admin");
    if (request.method === "PUT") {
      expect(await request.json()).toEqual({
        revision: 2,
        enabled: true,
        inviter_amount_usd: "1.00",
        invitee_amount_usd: "2.00",
      });
      return Response.json({
        ...current,
        revision: 3,
        enabled: true,
        inviter_units: "1000000000",
        invitee_units: "2000000000",
      });
    }
    return Response.json(request.url.includes("referral-settings") ? current : { items: [], has_more: false });
  });
  render(<ReferralSettings />);
  const enabled = await screen.findByRole("checkbox", { name: "启用邀请有礼" });
  expect(enabled).not.toBeChecked();
  fireEvent.change(screen.getByLabelText("邀请人奖励（USD）"), { target: { value: "1.00" } });
  fireEvent.change(screen.getByLabelText("受邀人奖励（USD）"), { target: { value: "2.00" } });
  fireEvent.click(enabled);
  fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
  expect(await screen.findByRole("status")).toHaveTextContent("邀请有礼设置已保存");
});
