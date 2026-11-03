import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_PATH } from "../../constants";

test.describe("Commerce navigation", () => {
  test.use({ storageState: ADMIN_STORAGE_PATH });

  test("keeps the document when moving between commerce tabs", async ({ page }) => {
    await page.goto("/ui/commerce/settings/");
    const origin = await page.evaluate(() => performance.timeOrigin);
    await page.getByRole("tab", { name: /^(充值订单|Top-up Orders)$/i }).click();
    await expect(page).toHaveURL(/\/ui\/commerce\/orders\/?$/);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
    await page.getByRole("tab", { name: /^(兑换码|Redemption Codes)$/i }).click();
    await expect(page).toHaveURL(/\/ui\/commerce\/redemptions\/?$/);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
    await page.getByRole("tab", { name: /^(用户组|User Groups)$/i }).click();
    await expect(page).toHaveURL(/\/ui\/access-groups\/?\?groupTab=billing$/);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
    await page.getByRole("tab", { name: /^(资源权限|Resource Permissions)$/i }).click();
    await expect(page.getByRole("button", { name: /^(创建访问组|Create Access Group)$/i })).toBeVisible();
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  });
});
