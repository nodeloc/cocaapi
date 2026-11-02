import { translate } from "./language.js?v=20261102-motion1";

(function () {
  "use strict";
  const root = document.documentElement;
  const chartObserver = new IntersectionObserver(
    (entries) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .forEach((entry) => {
          entry.target.classList.add("is-visible");
          chartObserver.unobserve(entry.target);
        });
    },
    { threshold: 0.2 },
  );
  chartObserver.observe(document.querySelector(".chart"));
  const themeButtons = document.querySelectorAll("[data-theme-choice]");
  const systemTheme = matchMedia("(prefers-color-scheme: light)");
  const updateTheme = (choice) => {
    root.dataset.themeChoice = choice;
    root.dataset.theme =
      choice === "system" ? (systemTheme.matches ? "light" : "dark") : choice;
    themeButtons.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.themeChoice === choice),
      ),
    );
  };
  themeButtons.forEach((button) =>
    button.addEventListener("click", () => {
      const choice = button.dataset.themeChoice;
      updateTheme(choice);
      try {
        localStorage.setItem("cocaapi-opensource-theme", choice);
      } catch {}
    }),
  );
  systemTheme.addEventListener("change", () => {
    if (root.dataset.themeChoice === "system") updateTheme("system");
  });
  updateTheme(root.dataset.themeChoice || "dark");

  const examples = Object.freeze({
    curl: document.getElementById("api-code").textContent,
    python:
      'import os\nfrom openai import OpenAI\n\nclient = OpenAI(\n    base_url="http://localhost:4000/v1",\n    api_key=os.environ["COCAAPI_API_KEY"],\n)\nresponse = client.chat.completions.create(\n    model="my-model",\n    messages=[{"role": "user", "content": "Hello, CocaAPI"}],\n)\nprint(response.choices[0].message.content)',
    node: 'import OpenAI from "openai";\n\nconst client = new OpenAI({\n  baseURL: "http://localhost:4000/v1",\n  apiKey: process.env.COCAAPI_API_KEY,\n});\nconst response = await client.chat.completions.create({\n  model: "my-model",\n  messages: [{ role: "user", content: "Hello, CocaAPI" }],\n});\nconsole.log(response.choices[0].message.content);',
  });
  const tabs = Array.from(document.querySelectorAll("[data-language]"));
  const selectTab = (selected) => {
    tabs.forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab === selected));
      tab.tabIndex = tab === selected ? 0 : -1;
    });
    document.getElementById("api-code").textContent =
      examples[selected.dataset.language];
    document
      .getElementById("api-panel")
      .setAttribute("aria-labelledby", selected.id);
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      const destination = {
        ArrowRight: tabs[(index + 1) % tabs.length],
        ArrowLeft: tabs[(index + tabs.length - 1) % tabs.length],
        Home: tabs[0],
        End: tabs[tabs.length - 1],
      }[event.key];
      if (!destination) return;
      event.preventDefault();
      selectTab(destination);
      destination.focus();
    });
  });

  const status = document.getElementById("copy-status");
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const code = document.getElementById(button.dataset.copy);
      try {
        await navigator.clipboard.writeText(code.textContent);
        status.textContent = translate("copySuccess");
      } catch {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent = translate("copyFallback");
      }
      setTimeout(() => {
        status.textContent = "";
      }, 4000);
    });
  });

  const menu = document.querySelector(".menu-button");
  const navigation = document.getElementById("navigation");
  const setMenu = (open) => {
    navigation.classList.toggle("is-open", open);
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", translate(open ? "closeMenu" : "openMenu"));
  };
  menu.addEventListener("click", () =>
    setMenu(menu.getAttribute("aria-expanded") !== "true"),
  );
  navigation
    .querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || menu.getAttribute("aria-expanded") !== "true")
      return;
    setMenu(false);
    menu.focus();
  });
  document.addEventListener("cocaapi:languagechange", () => {
    setMenu(menu.getAttribute("aria-expanded") === "true");
    status.textContent = "";
  });
  setMenu(false);
  matchMedia("(min-width: 1001px)").addEventListener("change", () =>
    setMenu(false),
  );
})();
