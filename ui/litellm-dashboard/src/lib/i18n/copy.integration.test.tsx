import { act, render } from "@testing-library/react";
import { expect, it } from "vitest";
import { LanguageProvider } from "./LanguageProvider";
import { localizedProperty, markUiCopy } from "./copy";
import { setUiLocale } from "./locale";

it("localizes marked presentation without changing object data, identifiers, serialization or unmarked user text", () => {
  render(
    <LanguageProvider>
      <span />
    </LanguageProvider>,
  );
  const original = { label: "Models", value: "model-id", title: "New conversation" };
  const serialized = JSON.stringify(original);
  const option = markUiCopy(original, { label: "Models", title: "New conversation" });
  act(() => setUiLocale("zh"));
  expect(localizedProperty(option, "label")).toBe("模型");
  expect(option.label).toBe("Models");
  expect(option.title).toBe("New conversation");
  expect(JSON.stringify(option)).toBe(serialized);
  expect(Object.getOwnPropertySymbols(option)).toEqual([]);
  expect(localizedProperty({ label: "Models" }, "label")).toBe("Models");
  const clone = markUiCopy({ ...option }, {}, [option]);
  expect(localizedProperty(clone, "label")).toBe("模型");
  const changed = markUiCopy({ ...option, label: "My Models" }, {}, [option]);
  expect(localizedProperty(changed, "label")).toBe("My Models");
  act(() => setUiLocale("en"));
  expect(localizedProperty(option, "label")).toBe("Models");
  expect(JSON.stringify(option)).toBe(serialized);
});
