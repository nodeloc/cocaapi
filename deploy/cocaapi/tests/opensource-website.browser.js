async function verifyOpenSourceWebsite(page, options = {}) {
  page.setDefaultTimeout(5000);
  const ensure = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  ensure(
    (await page.locator("h1").textContent())?.includes("模型基础设施"),
    "Open-source landing page is missing",
  );
  const origin = new URL(page.url()).origin;
  const location = page.url();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "浅色主题", exact: true }).click();
  await page.reload();
  ensure(
    (await page.locator("html").getAttribute("data-theme")) === "light",
    "Theme was not saved",
  );
  await page.getByRole("button", { name: "深色主题", exact: true }).click();
  await page.getByRole("tab", { name: "Python", exact: true }).click();
  ensure(
    (await page.locator("#api-code").textContent()).includes("OpenAI("),
    "Python example did not switch",
  );
  await page
    .getByRole("tab", { name: "Python", exact: true })
    .press("ArrowRight");
  ensure(
    (await page
      .getByRole("tab", { name: "Node.js", exact: true })
      .getAttribute("aria-selected")) === "true",
    "Arrow navigation failed",
  );
  ensure(
    (await page.locator("#api-code").textContent()).includes(
      "process.env.COCAAPI_API_KEY",
    ),
    "Node.js example is incorrect",
  );
  await page.getByRole("tab", { name: "Node.js", exact: true }).press("Home");
  ensure(
    (await page.locator("#api-code").textContent()).includes(
      "/v1/chat/completions",
    ),
    "Home did not select cURL",
  );
  await page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await page
    .getByRole("button", { name: "复制 API 示例", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.getElementById("copy-status").textContent.includes("已复制"),
  );
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  ensure(
    clipboard.replace(/\r\n/g, "\n") ===
      (await page.locator("#api-code").textContent()),
    "Copied code differs from the visible example",
  );
  ensure(
    (await page.locator("#copy-status").textContent()).includes("已复制"),
    "Copy feedback is missing",
  );
  const brokenAnchors = await page
    .locator('a[href^="#"]')
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href"))
        .filter((href) => !document.getElementById(href.slice(1))),
    );
  ensure(
    brokenAnchors.length === 0,
    "Broken internal links: " + brokenAnchors.join(", "),
  );
  for (const theme of ["light", "dark"]) {
    await page
      .getByRole("button", {
        name: theme === "dark" ? "深色主题" : "浅色主题",
        exact: true,
      })
      .click();
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      ensure(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Horizontal overflow at " + width + " in " + theme,
      );
      ensure(await page.locator("h1").isVisible(), "Heading is hidden");
    }
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  ensure(
    (await page
      .getByRole("button", { name: "关闭导航", exact: true })
      .getAttribute("aria-expanded")) === "true",
    "Mobile menu did not open",
  );
  await page.keyboard.press("Escape");
  ensure(
    (await page
      .getByRole("button", { name: "打开导航", exact: true })
      .getAttribute("aria-expanded")) === "false",
    "Escape did not close the menu",
  );
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page
    .locator("#navigation")
    .getByRole("link", { name: "快速开始", exact: true })
    .click();
  ensure(
    (await page
      .getByRole("button", { name: "打开导航", exact: true })
      .getAttribute("aria-expanded")) === "false",
    "Menu did not close after navigation",
  );
  await page
    .getByText("CocaAPI 和 LiteLLM 是什么关系？", { exact: true })
    .click();
  ensure(
    (await page.locator("details").first().getAttribute("open")) !== null,
    "FAQ did not expand",
  );
  const noScript = await page
    .context()
    .browser()
    .newContext({
      javaScriptEnabled: false,
      viewport: { width: 375, height: 812 },
    });
  const staticPage = await noScript.newPage();
  await staticPage.goto(location);
  ensure(
    await staticPage.locator("h1").isVisible(),
    "Content requires JavaScript",
  );
  ensure(
    await staticPage.locator("#navigation").isVisible(),
    "Navigation requires JavaScript",
  );
  ensure(
    (await staticPage.locator("#api-code").textContent()).includes(
      "/v1/chat/completions",
    ),
    "Default example requires JavaScript",
  );
  ensure(
    (await staticPage.locator("[data-js-only]:visible").count()) === 0,
    "Nonfunctional controls shown without JavaScript",
  );
  await noScript.close();
  const unavailableStorage = await page.context().browser().newContext();
  await unavailableStorage.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Unavailable", "SecurityError");
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      get() {
        return undefined;
      },
    });
  });
  const fallbackPage = await unavailableStorage.newPage();
  await fallbackPage.goto(location);
  await fallbackPage
    .getByRole("button", { name: "浅色主题", exact: true })
    .click();
  ensure(
    (await fallbackPage.locator("html").getAttribute("data-theme")) === "light",
    "Theme fails when storage is blocked",
  );
  await fallbackPage
    .getByRole("button", { name: "复制 API 示例", exact: true })
    .click();
  ensure(
    (await fallbackPage.locator("#copy-status").textContent()).includes(
      "手动复制",
    ),
    "Clipboard fallback is missing",
  );
  await unavailableStorage.close();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(location);
  if (options.screenshotDirectory) {
    await page.screenshot({
      path: options.screenshotDirectory + "/opensource-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({
      path: options.screenshotDirectory + "/opensource-mobile.png",
      fullPage: true,
    });
  }
  return {
    themes: 2,
    viewportWidths: 5,
    clipboard: "passed",
    keyboard: "passed",
    noJavaScript: "passed",
    unavailableStorage: "passed",
  };
}
