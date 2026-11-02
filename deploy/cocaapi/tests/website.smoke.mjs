import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { extname } from "node:path";

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
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const demoHomepage = await get("/", application);
assert.equal(
  demoHomepage.status,
  200,
  "Demo homepage must render without a login redirect",
);
assert.equal(
  digest(await demoHomepage.text()),
  digest(await readFile(new URL("../website/index.html", import.meta.url))),
  "Demo homepage must match the service website",
);
assert(demoHomepage.headers.get("cache-control")?.includes("no-transform"));
assert.equal(demoHomepage.headers.get("location"), null);
const website = new URL("../opensource-website/dist/", import.meta.url);
assert.equal(
  digest(html),
  digest(await readFile(new URL("index.html", website))),
  "Homepage must match the built open-source website",
);

const currentAssets = await readdir(new URL("assets/", website));
const assetVersion = new URL(
  html.match(/href="([^"]*assets\/website\.css[^"]*)"/)[1],
  base,
).search;
const assetMimeTypes = Object.freeze({
  ".css": "text/css",
  ".js": "javascript",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
});
for (const file of currentAssets) {
  const path = "/assets/" + file + assetVersion;
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert(
    response.headers
      .get("content-type")
      ?.includes(assetMimeTypes[extname(file)]),
    path,
  );
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=86400",
    path,
  );
  assert.equal(
    digest(Buffer.from(await response.arrayBuffer())),
    digest(await readFile(new URL("assets/" + file, website))),
    path,
  );
}

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
  const demoAsset = await get(path, application);
  assert.equal(demoAsset.status, 200, "Demo " + path);
  assert(demoAsset.headers.get("content-type")?.includes(mime), "Demo " + path);
  assert.equal(
    digest(Buffer.from(await demoAsset.arrayBuffer())),
    digest(await readFile(new URL("../website/" + file, import.meta.url))),
    "Demo " + path,
  );
}
for (const path of ["/robots.txt", "/sitemap.xml"]) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  assert.equal(
    digest(Buffer.from(await response.arrayBuffer())),
    digest(
      (
        await readFile(new URL("../website" + path, import.meta.url), "utf8")
      ).replaceAll(application.origin, base.origin),
    ),
    path,
  );
  if (path === "/sitemap.xml")
    assert(response.headers.get("cache-control")?.includes("no-cache"));
  const demoDocument = await get(path, application);
  assert.equal(demoDocument.status, 200, "Demo " + path);
  assert.equal(
    digest(await demoDocument.text()),
    digest(await readFile(new URL("../website" + path, import.meta.url))),
    "Demo " + path,
  );
}
for (const path of [
  "/site/not-found.js",
  "/site/.env",
  "/assets/not-found.js",
  "/assets/.env",
])
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
    demoHomepage: "verified",
    assets: currentAssets.length,
    legacyAssets: assets.length,
    sourceHashes: "match",
    customerPages: customerPages.length,
    protectedReads: 6,
    admin: "verified",
    privateHeaders: "preserved",
    readiness: "healthy",
  }),
);
