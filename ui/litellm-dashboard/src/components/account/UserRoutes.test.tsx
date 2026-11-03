import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CommercePage from "@/app/(dashboard)/commerce/page";
import OrganizationsPage from "@/app/(dashboard)/organizations/page";

const replace = vi.fn();
const router = { replace };

vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("consolidated user routes", () => {
  beforeEach(() => replace.mockReset());

  it("redirects legacy wallet bookmarks to the Users wallet tab", () => {
    render(<CommercePage />);
    expect(replace).toHaveBeenCalledWith("/ui/users?userTab=wallets");
  });

  it("redirects the unavailable organization screen to Users", () => {
    render(<OrganizationsPage />);
    expect(replace).toHaveBeenCalledWith("/ui/users");
  });
});
