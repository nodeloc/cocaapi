import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chooseSelectOption, renderWithProviders } from "@/../tests/test-utils";
import UserGroupChangeDialog from "./UserGroupChangeDialog";

const fetchMock = vi.fn<typeof fetch>();
const members = [
  { user_id: "user-a", email: "a@example.com", enabled: true, group_id: "default", group_name: "普通组", version: 3 },
  { user_id: "user-b", email: "b@example.com", enabled: true, group_id: "default", group_name: "普通组", version: 7 },
];
const groups = {
  user_groups: [
    { id: "default", name: "普通组" },
    { id: "vip", name: "VIP" },
  ],
};
const onClose = vi.fn();
const onSaved = vi.fn();

beforeEach(() => {
  onClose.mockReset();
  onSaved.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const request = input as Request;
    expect(request.headers.get("Authorization")).toBe("Bearer test-admin");
    return Response.json(request.url.endsWith("/lookup") ? { items: members, has_more: false } : groups);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it("submits all selected members with their captured versions in one batch", async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <UserGroupChangeDialog token="test-admin" userIds={["user-a", "user-b"]} onClose={onClose} onSaved={onSaved} />,
  );
  await chooseSelectOption(user, await screen.findByRole("combobox", { name: "目标用户组" }), "VIP");
  fireEvent.change(screen.getByLabelText("调整原因"), { target: { value: "升级用户组" } });
  fetchMock.mockImplementationOnce(async (input) => {
    const request = input as Request;
    expect(request.url).toContain("/members/batch");
    expect(await request.json()).toEqual({
      group_id: "vip",
      reason: "升级用户组",
      members: [
        { user_id: "user-a", expected_version: 3 },
        { user_id: "user-b", expected_version: 7 },
      ],
    });
    return Response.json({
      items: members.map((member) => ({ ...member, group_id: "vip", group_name: "VIP", version: member.version + 1 })),
      has_more: false,
    });
  });
  await user.click(screen.getByRole("button", { name: "保存用户组" }));
  expect(onSaved).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

it("keeps a conflicting batch open and requires a refresh without retrying automatically", async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <UserGroupChangeDialog token="test-admin" userIds={["user-a", "user-b"]} onClose={onClose} onSaved={onSaved} />,
  );
  await screen.findByRole("combobox", { name: "目标用户组" });
  fireEvent.change(screen.getByLabelText("调整原因"), { target: { value: "冲突验证" } });
  fetchMock.mockResolvedValueOnce(Response.json({ detail: "billing_membership_conflict" }, { status: 409 }));
  await user.click(screen.getByRole("button", { name: "保存用户组" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("本次未调整任何用户");
  expect(onSaved).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "重新载入" })).toBeEnabled();
});

it("does not submit when a selected account disappeared before the dialog loaded", async () => {
  fetchMock.mockImplementation(async (input) =>
    Response.json(
      (input as Request).url.endsWith("/lookup") ? { items: members.slice(0, 1), has_more: false } : groups,
    ),
  );
  renderWithProviders(
    <UserGroupChangeDialog token="test-admin" userIds={["user-a", "user-b"]} onClose={onClose} onSaved={onSaved} />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("部分账户已不存在");
  expect(screen.getByRole("button", { name: "保存用户组" })).toBeDisabled();
});
