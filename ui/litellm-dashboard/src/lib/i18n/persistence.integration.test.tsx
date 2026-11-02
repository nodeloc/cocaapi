import { act, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "./LanguageProvider";
import { LocalizedText } from "./LocalizedText";
import { setUiLocale } from "./locale";

function Page() {
  return (
    <LanguageProvider>
      <h1>
        <LocalizedText text="Models" />
      </h1>
    </LanguageProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.cookie = "coca_locale=; Max-Age=0; Path=/";
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.cookie = "coca_locale=; Max-Age=0; Path=/";
});

it("restores a cookie preference after the application is mounted again", () => {
  const first = render(<Page />);
  act(() => setUiLocale("en"));
  first.unmount();
  localStorage.clear();
  render(<Page />);
  expect(screen.getByRole("heading")).toHaveTextContent("Models");
});

it("keeps the UI usable when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  render(<Page />);
  expect(screen.getByRole("heading")).toHaveTextContent("模型");
  act(() => setUiLocale("en"));
  expect(screen.getByRole("heading")).toHaveTextContent("Models");
});

it("hydrates the static export with a saved language without hydration errors", async () => {
  document.cookie = "coca_locale=en; Path=/";
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Page />);
  document.body.append(container);
  const errors: unknown[] = [];
  let root: Root | undefined;
  await act(async () => {
    root = hydrateRoot(container, <Page />, { onRecoverableError: (error) => errors.push(error) });
  });
  await waitFor(() => expect(screen.getByRole("heading")).toHaveTextContent("Models"));
  expect(errors).toEqual([]);
  act(() => root?.unmount());
  container.remove();
});
