/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../../../tests/test-utils";
import ViewUserDashboard from "./view_users";

const userListCall = vi.fn();
const groupFetch = vi.fn<typeof fetch>();

// Mock the networking module
vi.mock("@/components/networking", () => ({
  userListCall: (...args: unknown[]) => userListCall(...args),
  userDeleteCall: vi.fn().mockResolvedValue({}),
  getPossibleUserRoles: vi.fn().mockResolvedValue({
    Admin: { ui_label: "Admin" },
    User: { ui_label: "User" },
  }),
  modelAvailableCall: vi.fn().mockResolvedValue({ data: [] }),
  invitationCreateCall: vi.fn().mockResolvedValue({}),
  userUpdateUserCall: vi.fn().mockResolvedValue({}),
  getProxyBaseUrl: vi.fn().mockReturnValue("http://localhost:4000"),
  getProxyUISettings: vi.fn().mockResolvedValue({
    PROXY_BASE_URL: null,
    PROXY_LOGOUT_URL: null,
    DEFAULT_TEAM_DISABLED: false,
    SSO_ENABLED: false,
  }),
}));

// The detail view has its own test; stub it so this file covers the parent's swap.
vi.mock("./view_users/user_info_view", () => ({
  default: function UserInfoViewMock({ userId, startInEditMode }: { userId: string; startInEditMode?: boolean }) {
    return <div data-testid="user-info-view">{`detail:${userId}:${String(Boolean(startInEditMode))}`}</div>;
  },
}));

vi.mock("./default-user-settings/DefaultUserSettingsForm", () => ({
  DefaultUserSettingsForm: function DefaultUserSettingsFormMock() {
    const [value, setValue] = React.useState("");
    return (
      <section aria-label="Default user settings panel">
        <label>
          Default setting
          <input value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
      </section>
    );
  },
}));

const makeUser = (userId: string, email: string) => ({
  user_id: userId,
  user_email: email,
  user_alias: null,
  user_role: "Admin",
  spend: 100.5,
  max_budget: null,
  models: [],
  key_count: 2,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  sso_user_id: null,
  budget_duration: null,
});

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

const defaultProps = {
  accessToken: "test-token",
  token: "test-token",
  userRole: "Admin",
  isViewOnly: false,
  userID: "admin-user-id",
  teams: [],
};

const renderDashboard = (overrides: Partial<typeof defaultProps> = {}) =>
  renderWithProviders(
    <QueryClientProvider client={createQueryClient()}>
      <ViewUserDashboard {...defaultProps} {...overrides} />
    </QueryClientProvider>,
  );

describe("ViewUserDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    groupFetch.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.url.includes("/transactions")) return Response.json({ items: [], has_more: false });
      if (request.url.endsWith("/wallets/lookup")) {
        const value = (await request.json()) as { user_ids: string[] };
        return Response.json({
          items: value.user_ids
            .filter((id) => id !== "system-user")
            .map((user_id) => ({
              user_id,
              email: "test@example.com",
              available_units: "12340000000",
              reserved_units: "0",
              credited_units: "15000000000",
              debited_units: "2660000000",
              debt_units: "0",
              currency: "USD",
            })),
          has_more: false,
        });
      }
      if (request.url.endsWith("/lookup")) {
        const value = (await request.json()) as { user_ids: string[] };
        return Response.json({
          items: value.user_ids
            .filter((id) => id !== "system-user")
            .map((id) => ({
              user_id: id,
              email: "test@example.com",
              enabled: true,
              group_id: "default",
              group_name: "普通组",
              version: 2,
            })),
          has_more: false,
        });
      }
      return Response.json({
        user_groups: [
          { id: "default", name: "普通组" },
          { id: "vip", name: "VIP" },
        ],
      });
    });
    vi.stubGlobal("fetch", groupFetch);
    userListCall.mockResolvedValue({
      users: [makeUser("user-1", "test@example.com")],
      total: 1,
      page: 1,
      page_size: 25,
      total_pages: 1,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows identity, group and balance in one selectable directory and keeps its state after closing the wallet", async () => {
    const user = userEvent.setup();
    renderDashboard();
    expect(await screen.findByRole("button", { name: "余额与流水 test@example.com" })).toHaveTextContent("$12.34");
    expect(screen.getByText("普通组", { exact: true })).toBeInTheDocument();
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.queryByRole("tab", { name: "用户余额" })).not.toBeInTheDocument();
    const search = screen.getByPlaceholderText("Search by email or ID…");
    fireEvent.change(search, { target: { value: "test@example.com" } });
    await waitFor(() => expect(userListCall.mock.calls.at(-1)?.[11]).toBe("test@example.com"));
    await user.click(screen.getByTestId("toggle-user-selection"));
    await user.click(screen.getByRole("checkbox", { name: "Select test@example.com", exact: true }));
    await user.click(screen.getByRole("button", { name: "余额与流水 test@example.com" }));
    expect(await screen.findByRole("dialog", { name: "余额与流水" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close", exact: true }));
    expect(search).toHaveValue("test@example.com");
    expect(screen.getByRole("checkbox", { name: "Select test@example.com", exact: true })).toBeChecked();
  });

  it("should render the ViewUserDashboard component", async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Users")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Default User Settings").length).toBeGreaterThan(0);
  });

  it("shows the canonical group and saves a single user assignment with its version", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "调整用户组 test@example.com" }));
    await user.click(await screen.findByRole("combobox", { name: "目标用户组" }));
    await user.click(await screen.findByRole("option", { name: "VIP", exact: true }));
    fireEvent.change(screen.getByLabelText("调整原因"), { target: { value: "用户列表归组" } });
    groupFetch.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.url.endsWith("/batch"))
        expect(await request.json()).toEqual({
          group_id: "vip",
          reason: "用户列表归组",
          members: [{ user_id: "user-1", expected_version: 2 }],
        });
      return Response.json({
        items: [
          {
            user_id: "user-1",
            email: "test@example.com",
            enabled: true,
            group_id: "vip",
            group_name: "VIP",
            version: 3,
          },
        ],
        has_more: false,
      });
    });
    await user.click(screen.getByRole("button", { name: "保存用户组" }));
    expect(await screen.findByText("VIP", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("bulk assigns registered users and explicitly excludes selected system accounts", async () => {
    const user = userEvent.setup();
    userListCall.mockResolvedValue({
      users: [
        makeUser("user-1", "a@example.com"),
        makeUser("user-2", "b@example.com"),
        makeUser("system-user", "system@example.com"),
      ],
      total: 3,
      page: 1,
      page_size: 25,
      total_pages: 1,
    });
    renderDashboard();
    expect(await screen.findByText("系统账户")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select Users", exact: true }));
    await user.click(screen.getByRole("checkbox", { name: "Select all rows", exact: true }));
    await user.click(screen.getByRole("button", { name: "批量调整用户组", exact: true }));
    expect(await screen.findByText("已跳过 1 个系统账户")).toBeInTheDocument();
    await user.click(await screen.findByRole("combobox", { name: "目标用户组" }));
    await user.click(await screen.findByRole("option", { name: "VIP", exact: true }));
    fireEvent.change(screen.getByLabelText("调整原因"), { target: { value: "批量升级" } });
    groupFetch.mockImplementation(async (input) => {
      const request = input as Request;
      if (request.url.endsWith("/batch"))
        expect(await request.json()).toEqual({
          group_id: "vip",
          reason: "批量升级",
          members: [
            { user_id: "user-1", expected_version: 2 },
            { user_id: "user-2", expected_version: 2 },
          ],
        });
      return Response.json({
        items: ["user-1", "user-2"].map((id) => ({
          user_id: id,
          email: "test@example.com",
          enabled: true,
          group_id: "vip",
          group_name: "VIP",
          version: 3,
        })),
        has_more: false,
      });
    });
    await user.click(screen.getByRole("button", { name: "保存用户组" }));
    expect(await screen.findAllByText("VIP", { exact: true })).toHaveLength(2);
    expect(screen.getByText("系统账户")).toBeInTheDocument();
  });

  it("switches between the users table and default settings tabs for proxy admins", async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(await screen.findByText("test@example.com")).toBeInTheDocument();

    const usersTab = screen.getByRole("tab", { name: "Users" });
    const settingsTab = screen.getByRole("tab", { name: "Default User Settings" });
    expect(usersTab).toHaveAttribute("aria-selected", "true");

    await user.click(settingsTab);

    expect(settingsTab).toHaveAttribute("aria-selected", "true");
    expect(usersTab).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("region", { name: "Default user settings panel" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Default setting" }), { target: { value: "unsaved change" } });

    await user.click(usersTab);

    expect(usersTab).toHaveAttribute("aria-selected", "true");
    expect(settingsTab).toHaveAttribute("aria-selected", "false");

    await user.click(settingsTab);

    expect(screen.getByRole("textbox", { name: "Default setting" })).toHaveValue("unsaved change");
  });

  it("opens legacy wallet bookmarks in the unified directory", async () => {
    renderWithProviders(
      <QueryClientProvider client={createQueryClient()}>
        <ViewUserDashboard {...defaultProps} />
      </QueryClientProvider>,
      { searchParams: "?userTab=wallets" },
    );
    expect(await screen.findByRole("button", { name: "余额与流水 test@example.com" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "用户余额" })).not.toBeInTheDocument();
  });

  it("does not expose wallet management to a view-only admin through a deep link", async () => {
    renderWithProviders(
      <QueryClientProvider client={createQueryClient()}>
        <ViewUserDashboard {...defaultProps} isViewOnly />
      </QueryClientProvider>,
      { searchParams: "?userTab=wallets" },
    );
    expect(await screen.findByText("test@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "用户余额" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "User balances" })).not.toBeInTheDocument();
    expect(await screen.findByText("普通组", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /调整用户组/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("toggle-user-selection")).not.toBeInTheDocument();
    expect(groupFetch.mock.calls.some(([input]) => (input as Request).url.includes("/wallets/"))).toBe(false);
  });

  it("shows unavailable instead of a zero balance when financial lookup fails", async () => {
    const initialNetwork = groupFetch.getMockImplementation();
    groupFetch.mockImplementation(async (input, init) => {
      if ((input as Request).url.endsWith("/wallets/lookup"))
        return Response.json({ detail: "unavailable" }, { status: 503 });
      return initialNetwork!(input, init);
    });
    renderDashboard();
    expect(await screen.findByText("暂不可用", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "余额与流水 test@example.com" })).not.toBeInTheDocument();
    expect(screen.queryByText("$0.00", { exact: true })).not.toBeInTheDocument();
  });

  it("shows a disabled customer as inactive even when the native user has no SCIM status", async () => {
    const initialNetwork = groupFetch.getMockImplementation();
    groupFetch.mockImplementation(async (input, init) => {
      if ((input as Request).url.endsWith("/members/lookup"))
        return Response.json({
          items: [
            {
              user_id: "user-1",
              email: "test@example.com",
              enabled: false,
              group_id: "default",
              group_name: "普通组",
              version: 2,
            },
          ],
          has_more: false,
        });
      return initialNetwork!(input, init);
    });
    renderDashboard();
    expect(await screen.findByText("Inactive", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Active", { exact: true })).not.toBeInTheDocument();
  });

  it("renders invite and bulk invite as toolbar actions alongside the other admin controls", async () => {
    renderDashboard();

    const inviteButton = await screen.findByRole("button", { name: /\+ invite user/i });
    const bulkInviteButton = screen.getByRole("button", { name: /\+ bulk invite users/i });
    const toolbar = screen.getByTestId("toggle-user-selection").parentElement;

    expect(inviteButton.parentElement).toBe(toolbar);
    expect(bulkInviteButton.parentElement).toBe(toolbar);
  });

  it("shows the users table without admin controls for non-proxy admins", async () => {
    renderDashboard({ userRole: "Internal User" });

    expect(await screen.findByText("test@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toggle-user-selection")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+ invite user/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+ bulk invite users/i })).not.toBeInTheDocument();
  });

  it("keeps actions unavailable while the user list is loading", () => {
    userListCall.mockReturnValue(new Promise(() => undefined));

    renderDashboard();

    expect(screen.getByText("Loading users…")).toBeInTheDocument();
    expect(screen.queryByTestId("toggle-user-selection")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bulk-edit-users")).not.toBeInTheDocument();
  });

  it("should show delete modal after choosing delete from the row actions menu", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });

    expect(screen.queryByText("Delete User?")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("user-actions-user-1"));
    await user.click(await screen.findByTestId("user-action-delete"));

    await waitFor(() => {
      expect(screen.getByText("Delete User?")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Are you sure you want to delete this user? This action cannot be undone."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("user-1").length).toBeGreaterThan(0);
  });

  it("should swap to the detail view when the identity cell is clicked", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /user-1/ }));

    expect(await screen.findByTestId("user-info-view")).toHaveTextContent("detail:user-1:false");
    expect(screen.queryByText("test@example.com")).not.toBeInTheDocument();
  });

  it("should open the detail view in edit mode from the row actions menu", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("user-actions-user-1"));
    await user.click(await screen.findByTestId("user-action-edit"));

    expect(await screen.findByTestId("user-info-view")).toHaveTextContent("detail:user-1:true");
  });

  describe("bulk edit selection", () => {
    beforeEach(() => {
      userListCall.mockResolvedValue({
        users: [makeUser("user-1", "ada@example.com"), makeUser("user-2", "grace@example.com")],
        total: 2,
        page: 1,
        page_size: 25,
        total_pages: 1,
      });
    });

    it("reveals selection checkboxes only while selection mode is on", async () => {
      const user = userEvent.setup();
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText("ada@example.com")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("datatable-select-all")).not.toBeInTheDocument();

      await user.click(screen.getByTestId("toggle-user-selection"));
      expect(screen.getByTestId("datatable-select-all")).toBeInTheDocument();

      await user.click(screen.getByTestId("toggle-user-selection"));
      expect(screen.queryByTestId("datatable-select-all")).not.toBeInTheDocument();
    });

    it("counts the selected rows in the bulk edit button and enables it once a row is picked", async () => {
      const user = userEvent.setup();
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText("ada@example.com")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("toggle-user-selection"));

      const bulkEdit = screen.getByTestId("bulk-edit-users");
      expect(bulkEdit).toHaveTextContent("Bulk Edit (0 selected)");
      expect(bulkEdit).toBeDisabled();

      await user.click(screen.getByTestId("datatable-select-row-user-2"));
      expect(screen.getByTestId("bulk-edit-users")).toHaveTextContent("Bulk Edit (1 selected)");
      expect(screen.getByTestId("bulk-edit-users")).toBeEnabled();

      await user.click(screen.getByTestId("datatable-select-all"));
      expect(screen.getByTestId("bulk-edit-users")).toHaveTextContent("Bulk Edit (2 selected)");
    });

    it("clears the selection when selection mode is cancelled", async () => {
      const user = userEvent.setup();
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText("ada@example.com")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("toggle-user-selection"));
      await user.click(screen.getByTestId("datatable-select-row-user-1"));
      expect(screen.getByTestId("bulk-edit-users")).toHaveTextContent("Bulk Edit (1 selected)");

      await user.click(screen.getByTestId("toggle-user-selection"));
      await user.click(screen.getByTestId("toggle-user-selection"));

      expect(screen.getByTestId("bulk-edit-users")).toHaveTextContent("Bulk Edit (0 selected)");
    });
  });

  describe("server-side query wiring", () => {
    it("requests page 1 with the default created_at desc sort", async () => {
      renderDashboard();

      await waitFor(() => {
        expect(userListCall).toHaveBeenCalled();
      });

      const [, userIds, page, pageSize, , , , , sortBy, sortOrder] = userListCall.mock.calls[0];
      expect(userIds).toBeNull();
      expect(page).toBe(1);
      expect(pageSize).toBe(25);
      expect(sortBy).toBe("created_at");
      expect(sortOrder).toBe("desc");
    });

    it("sends the clicked column as sort_by and resets to the first page", async () => {
      const user = userEvent.setup();
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText("test@example.com")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("sort-header-user_email"));

      await waitFor(() => {
        const latest = userListCall.mock.calls[userListCall.mock.calls.length - 1];
        expect(latest[8]).toBe("user_email");
        expect(latest[9]).toBe("asc");
        expect(latest[2]).toBe(1);
      });
    });

    it("sends the toolbar search as the combined search param instead of user_email", async () => {
      const user = userEvent.setup();
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText("test@example.com")).toBeInTheDocument();
      });

      const searchedUserId = "a6f5c02b-0163-45ce-815f-f88d10e95686";
      await user.type(screen.getByPlaceholderText("Search by email or ID…"), searchedUserId);

      await waitFor(() => {
        const latest = userListCall.mock.calls[userListCall.mock.calls.length - 1];
        expect(latest[11]).toBe(searchedUserId);
      });
      const latest = userListCall.mock.calls[userListCall.mock.calls.length - 1];
      expect(latest[1]).toBeNull();
      expect(latest[4]).toBeNull();
      expect(latest[2]).toBe(1);
    });

    it("replaces the previous rows with the loading state while the search request is pending", async () => {
      renderDashboard();
      expect(await screen.findByText("test@example.com")).toBeInTheDocument();

      userListCall.mockReturnValue(new Promise(() => undefined));
      fireEvent.change(screen.getByPlaceholderText("Search by email or ID…"), { target: { value: "zzznomatch" } });

      expect(await screen.findByText("Loading users…")).toBeInTheDocument();
      expect(screen.queryByText("test@example.com")).not.toBeInTheDocument();
    });
  });
});
