import { act, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { useTheme } from "next-themes";
import ThemeToggle from "./ThemeToggle";

vi.mock("next-themes", () => ({ useTheme: vi.fn() }));

it("hydrates a saved dark theme without replacing the server markup", async () => {
  const setTheme = vi.fn();
  vi.mocked(useTheme).mockReturnValue({ themes: ["light", "dark"], setTheme });
  const container = document.createElement("div");
  container.innerHTML = renderToString(<ThemeToggle />);
  document.body.append(container);
  vi.mocked(useTheme).mockReturnValue({ themes: ["light", "dark"], setTheme, resolvedTheme: "dark" });
  const onRecoverableError = vi.fn();
  const root = await act(async () => hydrateRoot(container, <ThemeToggle />, { onRecoverableError }));
  try {
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(within(container).getByRole("button")).toHaveAccessibleName("Switch to light mode");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
