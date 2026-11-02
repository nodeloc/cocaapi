import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const base = new URL(process.argv[2] || "https://cocaapi.com");
const application = new URL(process.argv[3] || "https://demo.cocaapi.com");
const get = async (path, origin = base) => {
  const target = new URL(path, origin);
  assert.equal(
    target.origin,
    origin.origin,
    "Smoke check must stay on its configured origin",
  );
  return fetch(target, {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
};
const homepage = await get("/");
assert.equal(
  homepage.status,
  200,
  "Homepage must render without a login redirect",
);
assert(homepage.headers.get("cache-control")?.includes("no-cache"));
assert(homepage.headers.get("cache-control")?.includes("no-transform"));
assert(
  homepage.headers
    .get("content-security-policy")
    ?.includes("script-src 'self'"),
);
assert.equal(homepage.headers.get("x-content-type-options"), "nosniff");
assert.doesNotMatch(
  homepage.headers.get("set-cookie") || "",
  /(?:^|,\s*)(?:__Host-)?coca_session=/,
  "Public HTML must not create a customer login session",
);
const html = await homepage.text();
assert(html.includes('lang="zh-CN"'));
assert(html.includes("Model") && html.includes("Infrastructure"));
assert(html.includes("https://cocaapi.com/site/brand/og-image-1200x630.png"));
assert(html.includes('name="twitter:card" content="summary_large_image"'));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(
  digest(html),
  digest(await readFile(new URL("../website/index.html", import.meta.url))),
);

const assets = [
  [
    "/site/brand/android-chrome-192x192.png",
    "image/png",
    "site/brand/android-chrome-192x192.png",
  ],
  [
    "/site/brand/android-chrome-512x512.png",
    "image/png",
    "site/brand/android-chrome-512x512.png",
  ],
  [
    "/site/brand/app-icon-gradient.svg",
    "image/svg+xml",
    "site/brand/app-icon-gradient.svg",
  ],
  [
    "/site/brand/apple-touch-icon.png",
    "image/png",
    "site/brand/apple-touch-icon.png",
  ],
  [
    "/site/brand/cocaapi-logo-horizontal-black.svg",
    "image/svg+xml",
    "site/brand/cocaapi-logo-horizontal-black.svg",
  ],
  [
    "/site/brand/cocaapi-logo-horizontal-white.svg",
    "image/svg+xml",
    "site/brand/cocaapi-logo-horizontal-white.svg",
  ],
  [
    "/site/brand/cocaapi-mark-black.svg",
    "image/svg+xml",
    "site/brand/cocaapi-mark-black.svg",
  ],
  [
    "/site/brand/cocaapi-mark-white.svg",
    "image/svg+xml",
    "site/brand/cocaapi-mark-white.svg",
  ],
  ["/site/brand/favicon-16.png", "image/png", "site/brand/favicon-16.png"],
  ["/site/brand/favicon-32.png", "image/png", "site/brand/favicon-32.png"],
  ["/site/brand/favicon.ico", "image/", "site/brand/favicon.ico"],
  ["/site/brand/favicon.svg", "image/svg+xml", "site/brand/favicon.svg"],
  [
    "/site/brand/og-image-1200x630.png",
    "image/png",
    "site/brand/og-image-1200x630.png",
  ],
  ["/site/brand/manifest.json", "application/json", "site/brand/manifest.json"],
  ["/site/website.css?v=20261102-3", "text/css", "site/website.css"],
  ["/site/website.js?v=20261102-3", "javascript", "site/website.js"],
  ["/site/theme.js?v=20261102-3", "javascript", "site/theme.js"],
  ["/site/icon.svg?v=20261102-3", "image/svg+xml", "site/icon.svg"],
  [
    "/site/fonts/geist-latin.woff2",
    "font/woff2",
    "site/fonts/geist-latin.woff2",
  ],
  [
    "/site/fonts/geist-mono-latin.woff2",
    "font/woff2",
    "site/fonts/geist-mono-latin.woff2",
  ],
  ["/site/fonts/OFL.txt", "text/plain", "site/fonts/OFL.txt"],
];
for (const [path, mime, file] of assets) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert(response.headers.get("content-type")?.includes(mime), path);
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=86400",
    path,
  );
  assert.equal(
    digest(Buffer.from(await response.arrayBuffer())),
    digest(await readFile(new URL("../website/" + file, import.meta.url))),
    path,
  );
}
for (const path of ["/robots.txt", "/sitemap.xml"]) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.equal(
    digest(Buffer.from(await response.arrayBuffer())),
    digest(await readFile(new URL("../website" + path, import.meta.url))),
    path,
  );
  if (path === "/sitemap.xml")
    assert(response.headers.get("cache-control")?.includes("no-cache"));
}
for (const path of ["/site/not-found.js", "/site/.env"])
  assert.equal((await get(path)).status, 404, path);

const customerPages = [
  "login",
  "register",
  "home",
  "keys",
  "models",
  "playground",
  "usage",
  "wallet",
  "orders",
  "docs",
  "security",
  "profile",
  "logs",
  "limits",
];
for (const name of customerPages) {
  const path = "/account/" + name + "/";
  const response = await get(path, application);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get("cache-control"), "no-store", path);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer", path);
  assert.notEqual(
    response.headers.get("content-security-policy"),
    homepage.headers.get("content-security-policy"),
    "Website CSP must stay scoped to the public site",
  );
}
for (const path of [
  "/account/api/v1/me",
  "/account/api/v1/wallet",
  "/account/api/v1/gateway/keys",
  "/commerce/admin/v1/wallets",
  "/commerce/admin/v1/login-settings",
  "/v1/models",
])
  assert.equal((await get(path, application)).status, 401, path);
const login = await get("/ui/login/", application);
assert.equal(login.status, 200);
const scriptPaths = [
  ...(await login.text()).matchAll(/<script[^>]+src="([^"]+)"/g),
]
  .slice(0, 3)
  .map((match) => match[1]);
assert(scriptPaths.length > 0, "Original admin scripts must still be present");
for (const path of scriptPaths)
  assert.equal((await get(path, application)).status, 200, path);
assert.equal((await get("/health/readiness", application)).status, 200);
for (const path of ["/account/login/", "/ui/login/", "/v1/models"]) {
  const legacy = await get(path);
  assert.equal(legacy.status, 308, path);
  assert.equal(
    legacy.headers.get("location"),
    new URL(path, application).href,
    path,
  );
  assert.equal(legacy.headers.get("cache-control"), "no-store", path);
}
console.log(
  JSON.stringify({
    origin: base.origin,
    application: application.origin,
    homepage: "verified",
    assets: assets.length,
    sourceHashes: "match",
    customerPages: customerPages.length,
    protectedReads: 6,
    admin: "verified",
    privateHeaders: "preserved",
    readiness: "healthy",
  }),
);
