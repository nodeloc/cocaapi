import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/../tests/test-utils";
import UserGroupsPage from "./UserGroupsPage";

const authorization = vi.hoisted(() => ({ userRole: "Admin", isAuthorized: true, isViewOnly: false }));
vi.mock("@/app/(dashboard)/hooks/useAuthorized", () => ({ default: () => authorization }));
vi.mock("./BillingGroupsAdmin", () => ({
  default: ({ onOpenGroup }: { onOpenGroup: (id: string) => void }) => (
    <section aria-label="Unified group configuration"><button onClick={() => onOpenGroup("default")}>Open default group</button></section>
  ),
}));
vi.mock("@/app/(dashboard)/access-groups/_components/AccessGroupsPage", () => ({
  AccessGroupsPage: () => <section aria-label="Read-only groups">Canonical resource groups</section>,
}));
vi.mock("@/app/(dashboard)/access-groups/_components/AccessGroupsDetailsPage", () => ({
  AccessGroupDetail: ({ accessGroupId, onBack }: { accessGroupId: string; onBack: () => void }) => (
    <section aria-label="Group resources"><p>{accessGroupId}</p><button onClick={onBack}>Back to groups</button></section>
  ),
}));

beforeEach(() => {
  authorization.userRole = "Admin";
  authorization.isAuthorized = true;
  authorization.isViewOnly = false;
});

it("opens the same group ID for resource and pricing administration", () => {
  renderWithProviders(<UserGroupsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Open default group" }));
  expect(screen.getByRole("region", { name: "Group resources" })).toHaveTextContent("default");
  fireEvent.click(screen.getByRole("button", { name: "Back to groups" }));
  expect(screen.getByRole("region", { name: "Unified group configuration" })).toBeVisible();
});

it("opens a canonical group from its deep link", () => {
  renderWithProviders(<UserGroupsPage />, { searchParams: "?group=default" });
  expect(screen.getByRole("region", { name: "Group resources" })).toHaveTextContent("default");
});

it("does not mount write-enabled configuration for view-only admins", () => {
  authorization.userRole = "proxy_admin_viewer";
  authorization.isViewOnly = true;
  renderWithProviders(<UserGroupsPage />, { searchParams: "?groupTab=billing" });
  expect(screen.getByRole("region", { name: "Read-only groups" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Open default group" })).not.toBeInTheDocument();
});