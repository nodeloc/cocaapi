import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/../tests/test-utils";
import UserGroupsPage from "./UserGroupsPage";

const authorization = vi.hoisted(() => ({ userRole: "Admin", isAuthorized: true, isViewOnly: false }));
vi.mock("@/app/(dashboard)/hooks/useAuthorized", () => ({ default: () => authorization }));
vi.mock("./BillingGroupsAdmin", () => ({
  default: () => <section aria-label="Billing groups"><input aria-label="Draft group name" defaultValue="" /></section>,
}));
vi.mock("@/app/(dashboard)/access-groups/_components/AccessGroupsPage", () => ({
  AccessGroupsPage: () => <section aria-label="Resource permissions">Key and team permissions</section>,
}));

beforeEach(() => {
  authorization.userRole = "Admin";
  authorization.isAuthorized = true;
  authorization.isViewOnly = false;
});

it("keeps billing drafts while switching between billing and resource permission tabs", () => {
  renderWithProviders(<UserGroupsPage />);
  fireEvent.change(screen.getByRole("textbox", { name: "Draft group name" }), { target: { value: "VIP" } });
  fireEvent.click(screen.getByRole("tab", { name: "资源权限" }));
  expect(screen.getByRole("region", { name: "Resource permissions" })).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "分组与倍率" }));
  expect(screen.getByRole("textbox", { name: "Draft group name" })).toHaveValue("VIP");
});

it("opens the resource permissions tab from a deep link", () => {
  renderWithProviders(<UserGroupsPage />, { searchParams: "?groupTab=permissions" });
  expect(screen.getByRole("region", { name: "Resource permissions" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "资源权限" })).toHaveAttribute("aria-selected", "true");
});

it("does not mount billing management for view-only admins even through a billing deep link", () => {
  authorization.userRole = "proxy_admin_viewer";
  authorization.isViewOnly = true;
  renderWithProviders(<UserGroupsPage />, { searchParams: "?groupTab=billing" });
  expect(screen.getByRole("region", { name: "Resource permissions" })).toBeVisible();
  expect(screen.queryByRole("tab", { name: "分组与倍率" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Draft group name" })).not.toBeInTheDocument();
});
