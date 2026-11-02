import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const base = new URL(process.argv[2] || "https://demo.cocaapi.com");
const source = new URL(
  "../../../ui/litellm-dashboard/public/assets/cocaapi/",
  import.meta.url,
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const get = (path) =>
  fetch(new URL(path, base), {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
const compare = async (path, filename, mime) => {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert(response.headers.get("content-type")?.includes(mime), path);
  assert.equal(
    digest(Buffer.from(await response.arrayBuffer())),
    digest(await readFile(new URL(filename, source))),
    path,
  );
};

const assets = await readdir(source);
for (const name of assets)
  await compare(
    "/ui/assets/cocaapi/" + name,
    name,
    name.endsWith(".svg") ? "image/svg+xml" : "image/png",
  );

for (const dark of [false, true]) {
  for (const compact of [false, true]) {
    const query = new URLSearchParams({
      theme: dark ? "dark" : "light",
      variant: compact ? "monogram" : "full",
      v: "cocaapi-20261102",
    });
    const filename = `cocaapi-${compact ? "mark" : "logo-horizontal"}-${dark ? "white" : "black"}.png`;
    await compare("/get_image?" + query, filename, "image/png");
  }
}
await compare("/get_favicon?v=cocaapi-20261102", "favicon-32.png", "image/png");

const pages = [
  "/account/login/",
  "/account/register/",
  "/account/forgot-password/",
  "/account/reset-password/",
  "/account/verify/",
  "/account/profile/",
  "/account/wallet/",
  "/ui/login/",
];
for (const path of pages) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert(html.includes("CocaAPI"), path);
  assert(/<script[^>]+src=/.test(html), path);
  assert(html.includes("/get_favicon?v=cocaapi-20261102"), path);
  if (path.startsWith("/account/")) {
    assert.equal(response.headers.get("cache-control"), "no-store", path);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer", path);
  }
}
for (const path of [
  "/account/api/v1/me",
  "/account/api/v1/wallet",
  "/commerce/admin/v1/login-settings",
  "/v1/models",
])
  assert.equal((await get(path)).status, 401, path);
assert.equal((await get("/health/readiness")).status, 200);
console.log(
  JSON.stringify({
    origin: base.origin,
    assets: assets.length,
    nativeLogoVariants: 4,
    favicon: "matches",
    pages: pages.length,
    protectedReads: 4,
    readiness: "healthy",
  }),
);
