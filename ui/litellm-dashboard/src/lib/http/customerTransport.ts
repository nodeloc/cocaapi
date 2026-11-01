import type { CustomerNativeIdentity } from "@/components/account/native/CustomerNativeContext";

export interface CustomerTransport extends CustomerNativeIdentity {
  request: (request: Request) => Promise<Response>;
}

let current: CustomerTransport | null = null;
export const getCustomerTransport = () => current;
export function registerCustomerTransport(transport: CustomerTransport) {
  current = transport;
  return () => {
    if (current === transport) current = null;
  };
}

const publicReads = new Set([
  "/litellm/.well-known/litellm-ui-config",
  "/public/litellm_model_cost_map",
  "/public/litellm_blog_posts",
]);

export const dashboardFetch: typeof fetch = (input, init) => {
  if (!current) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if ([...headers.values()].some((value) => value.startsWith("Bearer customer-ui:"))) {
      return Promise.resolve(Response.json({ detail: "authentication_required" }, { status: 401 }));
    }
    return globalThis.fetch(input, init);
  }
  const base = globalThis.location?.origin ?? "http://localhost";
  const request = new Request(typeof input === "string" ? new URL(input, base) : input, init);
  const url = new URL(request.url);
  if (
    url.origin === base &&
    (url.pathname.startsWith("/account/api/") || (request.method === "GET" && publicReads.has(url.pathname)))
  ) {
    if (current) {
      const safe = new Request(request);
      for (const [name, value] of safe.headers) if (value.startsWith("Bearer ")) safe.headers.delete(name);
      return globalThis.fetch(safe);
    }
    return globalThis.fetch(request);
  }
  if (url.origin !== base)
    return Promise.resolve(Response.json({ detail: "customer_operation_unavailable" }, { status: 403 }));
  return current.request(request);
};
