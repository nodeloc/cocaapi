import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { LanguageProvider } from "./LanguageProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LocalizedText } from "./LocalizedText";
import { getIntlLocale, setUiLocale } from "./locale";
import { translateMessage } from "./messages";
import { useUiLocale } from "./useUiLocale";

function FormProbe() {
  useUiLocale();
  const [value, setValue] = useState("Models <script>keep</script> %{0}");
  return (
    <>
      <LanguageSwitcher />
      <h1>
        <LocalizedText text="Models" />
      </h1>
      <label htmlFor="name">{translateMessage("Name")}</label>
      <input id="name" value={value} onChange={(event) => setValue(event.target.value)} />
      <output>{value}</output>
      <p>{getIntlLocale()}</p>
    </>
  );
}

beforeEach(() => {
  localStorage.removeItem("cocaapi.locale");
  document.cookie = "coca_locale=; Max-Age=0; Path=/";
});
afterEach(() => {
  localStorage.removeItem("cocaapi.locale");
  document.cookie = "coca_locale=; Max-Age=0; Path=/";
});

it("defaults to Chinese and changes labels without replacing inputs or user data", () => {
  render(
    <LanguageProvider>
      <FormProbe />
    </LanguageProvider>,
  );
  expect(screen.getByRole("heading")).toHaveTextContent("模型");
  const input = screen.getByLabelText("名称");
  fireEvent.change(input, { target: { value: "My custom model Home %{0}" } });
  act(() => setUiLocale("en"));
  expect(screen.getByRole("heading")).toHaveTextContent("Models");
  expect(screen.getByLabelText("Name")).toBe(input);
  expect(input).toHaveValue("My custom model Home %{0}");
  expect(screen.getByRole("status")).toHaveTextContent("My custom model Home %{0}");
  expect(document.documentElement).toHaveAttribute("lang", "en");
  expect(localStorage.getItem("cocaapi.locale")).toBe("en");
  expect(document.cookie).toContain("coca_locale=en");
});

it("restores a valid saved preference and synchronizes another tab's language", () => {
  localStorage.setItem("cocaapi.locale", "en");
  render(
    <LanguageProvider>
      <FormProbe />
    </LanguageProvider>,
  );
  expect(screen.getByRole("heading")).toHaveTextContent("Models");
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "cocaapi.locale", newValue: "zh" })));
  expect(screen.getByRole("heading")).toHaveTextContent("模型");
  expect(screen.getByText("zh-CN")).toBeInTheDocument();
});

it("ignores invalid preferences and replaces interpolation tokens only once", () => {
  localStorage.setItem("cocaapi.locale", "<script>bad</script>");
  render(
    <LanguageProvider>
      <FormProbe />
    </LanguageProvider>,
  );
  expect(screen.getByRole("heading")).toHaveTextContent("模型");
  expect(translateMessage("Created %{0} keys", ["Home %{1}<b>test</b>"])).toBe("已创建 Home %{1}<b>test</b> 个密钥");
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "cocaapi.locale", newValue: "fr" })));
  expect(screen.getByRole("heading")).toHaveTextContent("模型");
});

it("translates account status messages and interpolated account details in English", () => {
  render(
    <LanguageProvider>
      <FormProbe />
    </LanguageProvider>,
  );
  act(() => setUiLocale("en"));
  expect(translateMessage("已保存。")).toBe("Saved.");
  expect(translateMessage("已解除绑定。")).toBe("Account unlinked.");
  expect(translateMessage("%{0} 个第三方账号已绑定，%{1}", [2, translateMessage("已设置密码")])).toBe(
    "2 connected accounts, password set",
  );
  expect(translateMessage("__proto__")).toBe("__proto__");
  expect(translateMessage("Unknown customer name")).toBe("Unknown customer name");
});
