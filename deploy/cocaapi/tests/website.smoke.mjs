import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const base = new URL(process.argv[2] || "https://cocaapi.com");
const get = async (path) => {
  const target = new URL(path, base);
  assert.equal(
    target.origin,
    base.origin,
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
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(
  digest(html),
  digest(await readFile(new URL("../website/index.html", import.meta.url))),
);

const assets = [
  ["/site/website.css?v=20261102-1", "text/css", "site/website.css"],
  ["/site/website.js?v=20261102-1", "javascript", "site/website.js"],
  ["/site/theme.js?v=20261102-1", "javascript", "site/theme.js"],
  ["/site/icon.svg", "image/svg+xml", "site/icon.svg"],
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
  const response = await get(path);
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
  assert.equal((await get(path)).status, 401, path);
const login = await get("/ui/login/");
assert.equal(login.status, 200);
const scriptPaths = [
  ...(await login.text()).matchAll(/<script[^>]+src="([^"]+)"/g),
]
  .slice(0, 3)
  .map((match) => match[1]);
assert(scriptPaths.length > 0, "Original admin scripts must still be present");
for (const path of scriptPaths)
  assert.equal((await get(path)).status, 200, path);
assert.equal((await get("/health/readiness")).status, 200);
console.log(
  JSON.stringify({
    origin: base.origin,
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
