async function verifyWebsite(page, options = {}) {
  const origin = new URL(page.url()).origin;
  const capture = async (name, fullPage = false) => {
    if (options.screenshotDirectory)
      await page.screenshot({
        path: options.screenshotDirectory + "/" + name,
        fullPage,
      });
  };
  const errors = [];
  const failed = [];
  const external = [];
  const ensure = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      failed.push(response.status() + " " + response.url());
  });
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== origin) external.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => localStorage.removeItem("cocaapi-website-theme"));
  await page.goto(origin + "/");
  ensure(
    (await page.locator("h1").textContent()).includes("Infrastructure"),
    "Hero is missing",
  );
  const anchors = await page
    .locator('a[href^="#"]')
    .evaluateAll((items) =>
      items
        .map((item) => item.getAttribute("href"))
        .filter((href) => !document.getElementById(href.slice(1))),
    );
  ensure(anchors.length === 0, "Broken anchors: " + anchors);
  const expected = [
    "/account/login/",
    "/account/register/",
    "/account/keys/",
    "/account/models/",
    "/account/playground/",
    "/account/wallet/",
    "/account/usage/",
    "/account/docs/",
  ];
  const destinations = await page
    .locator("a")
    .evaluateAll((items) => items.map((item) => item.getAttribute("href")));
  ensure(
    expected.every((href) => destinations.includes(href)),
    "Missing customer link",
  );
  await page.getByRole("button", { name: "切换到浅色模式" }).click();
  ensure(
    (await page.locator("html").getAttribute("data-theme")) === "light",
    "Light theme failed",
  );
  await page.reload();
  ensure(
    (await page.locator("html").getAttribute("data-theme")) === "light",
    "Theme preference did not persist",
  );
  await capture("website-desktop-light.png");
  await page.getByRole("button", { name: "切换到深色模式" }).click();
  await page.getByRole("tab", { name: "Python", exact: true }).click();
  ensure(
    (await page.locator("#code-example").textContent()).includes(
      'base_url="https://cocaapi.com/v1"',
    ),
    "Python sample did not switch",
  );
  await page
    .getByRole("tab", { name: "Python", exact: true })
    .press("ArrowRight");
  ensure(
    (await page
      .getByRole("tab", { name: "Node.js", exact: true })
      .getAttribute("aria-selected")) === "true",
    "Keyboard tab selection failed",
  );
  ensure(
    (await page.locator("#code-example").textContent()).includes(
      "process.env.COCAAPI_API_KEY",
    ),
    "Node sample did not switch",
  );
  await page.getByRole("tab", { name: "Node.js", exact: true }).press("Home");
  ensure(
    (await page
      .getByRole("tab", { name: "cURL", exact: true })
      .getAttribute("aria-selected")) === "true",
    "Home key did not select first tab",
  );
  await page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await page.getByRole("button", { name: "复制代码" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "已复制到剪贴板" })
    .waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  ensure(
    copied.replace(/\r\n/g, "\n") ===
      (await page.locator("#code-example").textContent()).replace(
        /\r\n/g,
        "\n",
      ),
    "Clipboard content differs from selected example",
  );
  await page.locator("summary").filter({ hasText: "为什么有余额" }).click();
  ensure(
    (await page.locator("details[open]").count()) === 1,
    "FAQ did not expand",
  );
  const checks = [];
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["dark", "light"]) {
      if ((await page.locator("html").getAttribute("data-theme")) !== theme)
        await page.locator(".theme-toggle").click();
      const metrics = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      ensure(
        metrics.document <= metrics.viewport,
        JSON.stringify({ width, theme, metrics }),
      );
      checks.push({ width, theme, overflow: false });
    }
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "打开导航菜单" }).click();
  ensure(
    await page.getByRole("navigation", { name: "主导航" }).isVisible(),
    "Mobile menu not visible",
  );
  await page.getByRole("button", { name: "关闭导航菜单" }).press("Escape");
  ensure(
    (await page
      .getByRole("button", { name: "打开导航菜单" })
      .getAttribute("aria-expanded")) === "false",
    "Escape did not close menu",
  );
  await page.getByRole("button", { name: "打开导航菜单" }).click();
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "计费方式" })
    .click();
  ensure(
    new URL(page.url()).hash === "#billing",
    "Mobile anchor did not navigate",
  );
  ensure(
    (await page.locator(".menu-toggle").getAttribute("aria-expanded")) ===
      "false",
    "Navigation did not close menu",
  );
  await page.locator(".wordmark").first().click();
  await page.getByRole("heading", { level: 1 }).waitFor();
  await capture("website-mobile-light.png", true);
  await page.getByRole("button", { name: "切换到深色模式" }).click();
  await capture("website-mobile-dark.png", true);
  const nojs = await page
    .context()
    .browser()
    .newContext({
      javaScriptEnabled: false,
      viewport: { width: 375, height: 812 },
    });
  try {
    const plain = await nojs.newPage();
    await plain.goto(origin + "/");
    ensure(
      await plain.getByRole("heading", { level: 1 }).isVisible(),
      "No-JS content missing",
    );
    ensure(
      await plain.getByRole("navigation", { name: "主导航" }).isVisible(),
      "No-JS navigation missing",
    );
    ensure(
      await plain
        .locator("body")
        .evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      "No-JS mobile overflow",
    );
    await plain.locator("summary").first().click();
    ensure(
      (await plain.locator("details[open]").count()) === 1,
      "No-JS FAQ failed",
    );
    ensure(
      await plain.getByRole("tab", { name: "Python", exact: true }).isHidden(),
      "Inactive no-JS code tab is visible",
    );
  } finally {
    await nojs.close();
  }
  ensure(errors.length === 0, "Browser errors: " + errors.join("; "));
  ensure(failed.length === 0, "Failed requests: " + failed.join("; "));
  ensure(external.length === 0, "External requests: " + external.join("; "));
  return {
    checks,
    links: "valid",
    theme: "persisted",
    code: "three samples and keyboard verified",
    clipboard: "verified",
    mobileMenu: "verified",
    faq: "verified",
    noJavaScript: "verified",
    errors,
    failed,
    external,
  };
}
