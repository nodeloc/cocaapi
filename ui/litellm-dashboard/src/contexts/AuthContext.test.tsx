import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import { getCookie } from "@/utils/cookieUtils";
import { getUiConfig } from "@/components/networking";

vi.mock("next/navigation", () => ({ usePathname: () => "/account/keys/" }));
vi.mock("@/utils/cookieUtils", () => ({ getCookie: vi.fn(), clearTokenCookies: vi.fn() }));
vi.mock("@/components/networking", () => ({ getUiConfig: vi.fn(), setGlobalLitellmHeaderName: vi.fn() }));

function Identity() {
  const auth = useAuth();
  return <output>{auth.authLoading ? "loading" : auth.accessToken ?? "customer-session-only"}</output>;
}

it("does not read or decode the administrator session on customer routes", async () => {
  vi.mocked(getCookie).mockReturnValue("administrator-cookie");
  render(
    <AuthProvider>
      <Identity />
    </AuthProvider>,
  );
  expect(await screen.findByText("customer-session-only")).toBeVisible();
  expect(getCookie).not.toHaveBeenCalled();
  expect(getUiConfig).not.toHaveBeenCalled();
});
