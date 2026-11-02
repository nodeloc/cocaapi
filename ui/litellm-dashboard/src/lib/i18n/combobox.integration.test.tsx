import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SearchSelect } from "@/components/shared/SearchSelect";
import { MultiSelect } from "@/components/shared/MultiSelect";
import { LanguageProvider } from "./LanguageProvider";
import { markUiCopy } from "./copy";
import { setUiLocale } from "./locale";

const options = [markUiCopy({ value: "model-id", label: "Models" }, { label: "Models" })];

it("searches and selects the displayed label while returning the original option value", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  render(
    <LanguageProvider>
      <SearchSelect options={options} value={null} onValueChange={changed} aria-label="Search" />
    </LanguageProvider>,
  );
  act(() => setUiLocale("zh"));
  await user.type(screen.getByRole("combobox"), "模型");
  await user.click(await screen.findByRole("option", { name: "模型" }));
  expect(changed).toHaveBeenCalledWith("model-id");
  expect(options[0]).toEqual({ value: "model-id", label: "Models" });
});

it("shows the selected SearchSelect label in the current language", () => {
  render(
    <LanguageProvider>
      <SearchSelect options={options} value="model-id" onValueChange={() => {}} aria-label="Search" />
    </LanguageProvider>,
  );
  act(() => setUiLocale("zh"));
  expect(screen.getByRole("combobox")).toHaveValue("模型");
  act(() => setUiLocale("en"));
  expect(screen.getByRole("combobox")).toHaveValue("Models");
});

it("finds multiselect options by the label displayed to the user", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  render(
    <LanguageProvider>
      <MultiSelect options={options} onValueChange={changed} />
    </LanguageProvider>,
  );
  act(() => setUiLocale("zh"));
  await user.type(screen.getByRole("combobox"), "模型");
  await user.click(await screen.findByRole("option", { name: "模型" }));
  expect(changed).toHaveBeenCalledWith(["model-id"]);
});
