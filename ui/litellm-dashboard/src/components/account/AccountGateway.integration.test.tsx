import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AccountGatewayKeys from "./AccountGatewayKeys";
import AccountGatewayCatalog from "./AccountGatewayCatalog";
import AccountGatewayDocs from "./AccountGatewayDocs";
import { renderWithProviders } from "../../../tests/test-utils";
import { switchToWorkerUrl } from "@/components/networking";

const replace = vi.fn();
const router = { replace };
vi.unmock("@/app/(dashboard)/hooks/useAuthorized");
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/account/keys/" }));
const fetchMock = vi.fn<typeof fetch>();
const allowedRequests =
  /^\/account\/api\/v1\/|^\/litellm\/\.well-known\/litellm-ui-config$|^\/public\/(litellm_model_cost_map|litellm_blog_posts)$/;
const profile = {
  user_id: "customer-a",
  email: "customer@example.com",
  email_verified: true,
  has_password: true,
  csrf_token: "customer-csrf",
  bindings: [],
  reauthentication_required: false,
};
const access = {
  models: ["granted-model"],
  max_budget_usd: 20,
  spend_usd: 1,
  rpm_limit: 10,
  tpm_limit: 1000,
  budget_reset_at: null,
  can_create_key: true,
  key_creation_reason: null,
};

beforeEach(() => {
  replace.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input) => {
    const request = input as Request;
    expect(new URL(request.url).pathname).toMatch(allowedRequests);
    if (request.url.endsWith("/me")) return Response.json(profile);
    if (request.url.endsWith("/access")) return Response.json(access);
    return Response.json({ items: [], has_more: false });
  });
});
afterEach(() => {
  for (const [input] of fetchMock.mock.calls) {
    const request = input as Request;
    expect(new URL(request.url).pathname).toMatch(allowedRequests);
    expect(request.headers.has("Authorization")).toBe(false);
  }
  switchToWorkerUrl(null);
  vi.unstubAllGlobals();
});

it("uses the existing Virtual Keys dashboard and original create-key dialog", async () => {
  switchToWorkerUrl("https://admin-worker.example");
  renderWithProviders(<AccountGatewayKeys />);
  expect(await screen.findByRole("heading", { name: "Virtual Keys", exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Create New Key/ }));
  expect(await screen.findByRole("dialog", { name: "Create New Key", exact: true })).toBeVisible();
  expect(localStorage.getItem("litellm_worker_url")).toBe("https://admin-worker.example");
});

it("submits the original create-key dialog through customer CSRF", async () => {
  fetchMock.mockImplementation(async (input) => {
    const request = input as Request;
    expect(new URL(request.url).pathname).toMatch(allowedRequests);
    if (request.url.endsWith("/me")) return Response.json(profile);
    if (request.url.endsWith("/access")) return Response.json(access);
    if (request.method === "POST") {
      expect(request.headers.get("X-CSRF-Token")).toBe("customer-csrf");
      expect(request.headers.has("Authorization")).toBe(false);
      expect(await request.json()).toEqual({ name: "my application", duration: "30d", expires_in_days: 30 });
      return Response.json({ key: "sk-one-time-customer-secret" }, { status: 201 });
    }
    return Response.json({ items: [], has_more: false });
  });
  renderWithProviders(<AccountGatewayKeys />);
  fireEvent.click(await screen.findByRole("button", { name: /Create New Key/ }));
  const dialog = await screen.findByRole("dialog", { name: "Create New Key" });
  fireEvent.change(within(dialog).getByRole("textbox", { name: /Key Name/ }), { target: { value: "my application" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create Key", exact: true }));
  expect(await screen.findByText("sk-one-time-customer-secret", { exact: true })).toBeVisible();
  expect(screen.queryByText("Key Ownership")).not.toBeInTheDocument();
});

it("opens original model details with redacted customer data", async () => {
  renderWithProviders(<AccountGatewayCatalog />, { searchParams: "model=granted-model" });
  expect(await screen.findByRole("heading", { name: "Public Model Name: granted-model", exact: true })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Test Connection", exact: true })).not.toBeInTheDocument();
});

it("shows the current application origin in customer API examples instead of an administrator worker", async () => {
  switchToWorkerUrl("https://admin-worker.example");
  renderWithProviders(<AccountGatewayDocs />);
  const panel = await screen.findByRole("tabpanel", { name: "OpenAI Python SDK" });
  expect(panel).toHaveTextContent(`base_url="${window.location.origin}/v1"`);
  expect(panel).not.toHaveTextContent("https://admin-worker.example");
});
