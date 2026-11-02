import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Layout from "@/app/account/layout";
import CustomerNativePage from "./native/CustomerNativePage";
import { useCustomerNative } from "./native/CustomerNativeContext";
import { dashboardFetch, getCustomerTransport } from "@/lib/http/customerTransport";
import { renderWithProviders } from "../../../tests/test-utils";
import { getProxyBaseUrl, switchToWorkerUrl } from "@/components/networking";

const replace = vi.fn();
let pathname = "/account/home/";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => pathname }));
const fetchMock = vi.fn<typeof fetch>();
const profile = {
  user_id: "customer-a",
  email: "customer-a@example.com",
  email_verified: true,
  has_password: true,
  csrf_token: "customer-csrf",
  bindings: [],
  reauthentication_required: false,
};

function Probe() {
  const identity = useCustomerNative();
  const client = useQueryClient();
  const { data } = useQuery({ queryKey: ["private-page"], queryFn: () => "empty", enabled: false });
  return (
    <>
      <p>{identity?.profile.email}</p>
      <p>{data ?? "empty"}</p>
      <button onClick={() => client.setQueryData(["private-page"], "saved page data")}>Save page data</button>
      <button
        onClick={() => {
          void dashboardFetch("/key/list");
        }}
      >
        Load keys
      </button>
      <input aria-label="Page draft" defaultValue="" />
    </>
  );
}
const page = (key: string) => (
  <Layout>
    <CustomerNativePage key={key} title={key}>
      <Probe />
    </CustomerNativePage>
  </Layout>
);

beforeEach(() => {
  pathname = "/account/home/";
  replace.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => Response.json(profile));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  switchToWorkerUrl(null);
  vi.unstubAllGlobals();
});

it("keeps the account session and page cache when changing customer pages", async () => {
  const view = renderWithProviders(page("first"));
  await screen.findByRole("button", { name: "Save page data" });
  fireEvent.click(screen.getByRole("button", { name: "Save page data" }));
  expect(await screen.findByText("saved page data")).toBeVisible();
  pathname = "/account/models/";
  view.rerender(page("second"));
  await screen.findByRole("button", { name: "Save page data" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.getByText("saved page data")).toBeVisible();
});

it("clears private page data when focus detects a different account", async () => {
  renderWithProviders(page("first"));
  fireEvent.click(await screen.findByRole("button", { name: "Save page data" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Page draft" }), { target: { value: "private draft" } });
  fetchMock.mockImplementation(async () =>
    Response.json({ ...profile, user_id: "customer-b", email: "customer-b@example.com" }),
  );
  fireEvent.focus(window);
  expect(await screen.findByText("customer-b@example.com", { selector: "p" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Page draft" })).toHaveValue("");
  expect(screen.queryByText("saved page data")).not.toBeInTheDocument();
  expect(getCustomerTransport()?.marker).toBe("customer-ui:customer-b");
});

it("removes the private screen and transport when a session expires", async () => {
  renderWithProviders(page("first"));
  await screen.findByRole("button", { name: "Save page data" });
  fetchMock.mockImplementation(async () => Response.json({ detail: "authentication_required" }, { status: 401 }));
  fireEvent.focus(window);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/account/login/"));
  expect(screen.queryByRole("button", { name: "Save page data" })).not.toBeInTheDocument();
  expect(getCustomerTransport()).toBeNull();
});

it("ends an expired session when a native page request returns unauthorized without losing focus", async () => {
  renderWithProviders(page("first"));
  await screen.findByRole("button", { name: "Load keys" });
  fetchMock.mockImplementation(async () => Response.json({ detail: "authentication_required" }, { status: 401 }));
  fireEvent.click(screen.getByRole("button", { name: "Load keys" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/account/login/"));
  expect(screen.queryByRole("button", { name: "Load keys" })).not.toBeInTheDocument();
  expect(getCustomerTransport()).toBeNull();
});

it("releases private state when entering a public authentication page", async () => {
  const view = renderWithProviders(page("first"));
  await screen.findByRole("button", { name: "Save page data" });
  pathname = "/account/login/";
  view.rerender(
    <Layout>
      <p>Public sign in</p>
    </Layout>,
  );
  expect(screen.getByText("Public sign in")).toBeVisible();
  expect(getCustomerTransport()).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("rechecks the cookie session before interpreting a native request authorization error as logout", async () => {
  renderWithProviders(page("first"));
  await screen.findByRole("button", { name: "Load keys" });
  fetchMock.mockImplementation(async (input) =>
    (input as Request).url.endsWith("/me")
      ? Response.json(profile)
      : Response.json({ detail: "invalid_api_key" }, { status: 401 }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Load keys" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(screen.getByRole("button", { name: "Load keys" })).toBeVisible();
  expect(getCustomerTransport()?.profile.user_id).toBe(profile.user_id);
  expect(replace).not.toHaveBeenCalled();
});

it("restores the administrator API origin when leaving the customer layout", async () => {
  switchToWorkerUrl("https://admin-worker.example");
  const view = renderWithProviders(page("first"));
  await screen.findByRole("button", { name: "Load keys" });
  expect(getProxyBaseUrl()).toBe(window.location.origin);
  view.unmount();
  expect(getCustomerTransport()).toBeNull();
  expect(getProxyBaseUrl()).toBe("https://admin-worker.example");
});
