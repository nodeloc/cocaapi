async function verifyBranding(page) {
  const origin = new URL(page.url()).origin;
  const pages = [
    "/account/login/",
    "/account/register/",
    "/account/forgot-password/",
    "/account/reset-password/",
    "/account/verify/",
    "/ui/login/",
  ];
  for (const path of pages) {
    await page.goto(new URL(path, origin).href);
    const logos = page.locator('img[alt="CocaAPI"]:visible');
    await logos.first().waitFor();
    const images = await logos.evaluateAll((nodes) =>
      nodes.map((node) => {
        const bounds = node.getBoundingClientRect();
        return {
          source: node.currentSrc,
          loaded: node.complete && node.naturalWidth > 0,
          width: bounds.width,
          ratio: bounds.width / bounds.height,
          originalRatio: node.naturalWidth / node.naturalHeight,
        };
      }),
    );
    for (const image of images) {
      if (!image.loaded || image.width < 100)
        throw new Error("Logo is missing or too small: " + path);
      if (Math.abs(image.ratio / image.originalRatio - 1) > 0.03)
        throw new Error("Logo proportions changed: " + path);
      if (new URL(image.source).origin !== origin)
        throw new Error(
          "Logo belongs to a different application origin: " + path,
        );
    }
  }
  return {
    origin,
    pages: pages.length,
    logosLoaded: true,
    originalProportions: true,
  };
}
