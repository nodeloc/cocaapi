import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import BillingGroupsAdmin from "./BillingGroupsAdmin";

vi.mock("@/app/(dashboard)/hooks/useAuthorized", () => ({
  default: () => ({ accessToken: "test-admin", userRole: "Admin", isViewOnly: false, isAuthorized: true }),
}));
const fetchMock = vi.fn<typeof fetch>();
const config = {
  group_source: "access_groups",
  revision: 3,
  updated_by: "admin",
  updated_at: "2026-11-02T00:00:00Z",
  user_groups: [
    { id: "default", name: "普通组", models: ["test-model"] },
    { id: "vip", name: "VIP", models: [] },
  ],
  model_groups: [
    { id: "default", name: "普通模型组", models: [] },
    { id: "premium", name: "高级模型组", models: ["test-model"] },
  ],
  rules: [{ user_group_id: "default", model_group_id: "default", multiplier: "1", enabled: true }],
};
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const request = input as Request;
    expect(request.headers.get("Authorization")).toBe("Bearer test-admin");
    if (request.url.includes("/catalog")) return Response.json({ models: ["test-model"] });
    if (request.url.includes("/members"))
      return Response.json({
        items: [
          {
            user_id: "customer-a",
            email: "member@example.com",
            enabled: true,
            group_id: "default",
            group_name: "普通组",
            version: 2,
          },
        ],
        has_more: false,
      });
    return Response.json(config);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it("saves model permissions on the same user group used by membership and pricing", async () => {
  const user = userEvent.setup();
  render(<BillingGroupsAdmin embedded />);
  const selectors = await screen.findAllByRole("combobox", { name: "空列表禁止访问模型" });
  await user.click(selectors[1]);
  await user.click(await screen.findByRole("option", { name: "test-model", exact: true }));
  await user.keyboard("{Escape}");
  fireEvent.change(screen.getByLabelText("配置变更原因"), { target: { value: "组权限测试" } });
  fetchMock.mockImplementationOnce(async (input) => {
    const request = input as Request;
    expect(request.method).toBe("PUT");
    expect(await request.json()).toMatchObject({
      user_groups: [{ id: "default", models: ["test-model"] }, { id: "vip", models: ["test-model"] }],
      rules: config.rules,
      reason: "组权限测试",
    });
    return Response.json({ ...config, revision: config.revision + 1 });
  });
  fireEvent.click(screen.getByRole("button", { name: "保存分组配置" }));
  expect(await screen.findByRole("status")).toHaveTextContent("分组配置已保存");
});

it("saves multiplier and deny settings with version and reason using the native administration page", async () => {
  render(<BillingGroupsAdmin embedded />);
  const row = await screen.findByRole("row", { name: /普通组.*普通模型组.*1/ });
  fireEvent.click(within(row).getByRole("button", { name: "编辑" }));
  fireEvent.change(screen.getByLabelText("调用倍率"), { target: { value: "0.8" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "允许调用" }));
  fireEvent.click(screen.getByRole("button", { name: "应用规则" }));
  fireEvent.change(screen.getByLabelText("配置变更原因"), { target: { value: "倍率验收" } });
  fetchMock.mockImplementationOnce(async (input) => {
    const request = input as Request;
    expect(request.method).toBe("PUT");
    expect(await request.json()).toEqual({
      group_source: config.group_source,
      revision: 3,
      user_groups: config.user_groups,
      model_groups: config.model_groups,
      rules: [{ user_group_id: "default", model_group_id: "default", multiplier: "0.8", enabled: false }],
      reason: "倍率验收",
    });
    return Response.json({ ...config, revision: 4 });
  });
  fireEvent.click(screen.getByRole("button", { name: "保存分组配置" }));
  expect(await screen.findByRole("status")).toHaveTextContent("分组配置已保存");
});

it("assigns an existing customer with their membership version and explains conflicting changes", async () => {
  render(<BillingGroupsAdmin />);
  fireEvent.click(await screen.findByRole("button", { name: "调整分组" }));
  fireEvent.change(screen.getByLabelText("归组原因"), { target: { value: "调整用户归组" } });
  fetchMock.mockImplementationOnce(async (input) => {
    const request = input as Request;
    expect(request.method).toBe("POST");
    expect(request.url).toContain("/members/customer-a");
    expect(await request.json()).toMatchObject({ group_id: "default", expected_version: 2, reason: "调整用户归组" });
    return Response.json({ detail: "billing_membership_conflict" }, { status: 409 });
  });
  fireEvent.click(screen.getByRole("button", { name: "保存用户分组" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("用户分组已被修改，请刷新后重试");
});
