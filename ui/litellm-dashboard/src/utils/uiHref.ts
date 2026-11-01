import { serverRootPath } from "@/lib/serverRootPath";
import { getCustomerTransport } from "@/lib/http/customerTransport";

function uiBase(): string {
  // next dev serves the app at the root; only the proxy mounts the static export under /ui
  // (and optionally under server_root_path). Inlined at build time, so production is unaffected.
  if (process.env.NODE_ENV === "development") {
    return "";
  }
  const root = serverRootPath && serverRootPath !== "/" ? `/${serverRootPath.replace(/^\/+|\/+$/g, "")}` : "";
  return `${root}/ui`;
}

/** Absolute (same-origin) href for a dashboard route segment, e.g. "api-reference" -> "/ui/api-reference". */
export function uiHref(routeSegment: string): string {
  if (getCustomerTransport()) {
    const [path, query] = routeSegment.replace(/^\/+/, "").split("?");
    const routes: Readonly<Record<string, string>> = {
      home: "home",
      "api-keys": "keys",
      "models-and-endpoints": "models",
      playground: "playground",
      usage: "usage",
      logs: "logs",
      budgets: "limits",
      "api-reference": "docs",
    };
    return `/account/${routes[path] ?? "home"}/${query ? `?${query}` : ""}`;
  }
  return `${uiBase()}/${routeSegment.replace(/^\/+/, "")}`;
}

/** First route segment under the UI base, e.g. "/ui/api-reference/" -> "api-reference" and "/ui/" -> "". */
export function routeSegmentForPathname(pathname: string): string {
  const base = uiBase();
  const relative = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  return relative.replace(/^\/+/, "").split("/")[0];
}
