import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import BudgetDurationDropdown, {
  NEVER_RESETS_BUDGET_DURATION,
} from "@/components/common_components/budget_duration_dropdown";
import { KeyTypeSelect } from "@/components/templates/KeyEditViewControls";
import { LanguageProvider } from "./LanguageProvider";
import { setUiLocale } from "./locale";
import { translateMessage } from "./messages";

it("updates selected record-option labels without changing their values or invoking a selection callback", () => {
  const changed = vi.fn();
  render(
    <LanguageProvider>
      <BudgetDurationDropdown showNeverResets value={NEVER_RESETS_BUDGET_DURATION} onChange={changed} />
    </LanguageProvider>,
  );
  act(() => setUiLocale("zh"));
  expect(screen.getByRole("combobox")).toHaveTextContent(translateMessage("Never resets"));
  act(() => setUiLocale("en"));
  expect(screen.getByRole("combobox")).toHaveTextContent("Never resets");
  expect(changed).not.toHaveBeenCalled();
});

it("updates labels projected into Select records while preserving the key type value", () => {
  const changed = vi.fn();
  render(
    <LanguageProvider>
      <KeyTypeSelect id="key-type" value="default" onChange={changed} />
    </LanguageProvider>,
  );
  act(() => setUiLocale("zh"));
  expect(screen.getByRole("combobox")).toHaveTextContent(translateMessage("Full Access"));
  act(() => setUiLocale("en"));
  expect(screen.getByRole("combobox")).toHaveTextContent("Full Access");
  expect(changed).not.toHaveBeenCalled();
});
