(function () {
  "use strict";

  const root = document.documentElement;
  const themeToggle = document.querySelector(".theme-toggle");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  function updateThemeControl() {
    const light = root.dataset.theme === "light";
    themeToggle.setAttribute(
      "aria-label",
      light ? "切换到深色模式" : "切换到浅色模式",
    );
    themeToggle.title = light ? "切换到深色模式" : "切换到浅色模式";
    themeColor.content = light ? "#ffffff" : "#000000";
  }
  themeToggle.hidden = false;
  updateThemeControl();
  themeToggle.addEventListener("click", function () {
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    updateThemeControl();
    try {
      localStorage.setItem("cocaapi-website-theme", root.dataset.theme);
    } catch {
      return;
    }
  });

  const menuToggle = document.querySelector(".menu-toggle");
  const navigation = document.getElementById("primary-nav");
  menuToggle.hidden = false;
  root.classList.add("has-navigation");
  function setMenu(open) {
    navigation.dataset.open = String(open);
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute(
      "aria-label",
      open ? "关闭导航菜单" : "打开导航菜单",
    );
  }
  menuToggle.addEventListener("click", function () {
    setMenu(menuToggle.getAttribute("aria-expanded") !== "true");
  });
  navigation.addEventListener("click", function (event) {
    if (event.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", function (event) {
    if (
      event.key === "Escape" &&
      menuToggle.getAttribute("aria-expanded") === "true"
    ) {
      setMenu(false);
      menuToggle.focus();
    }
  });
  document.addEventListener("click", function (event) {
    if (
      event.target instanceof Element &&
      !event.target.closest(".site-header")
    )
      setMenu(false);
  });
  matchMedia("(min-width: 901px)").addEventListener("change", function (event) {
    if (event.matches) setMenu(false);
  });

  const code = document.getElementById("code-example");
  const examples = Object.freeze({
    curl: code.textContent,
    python:
      'import os\nfrom openai import OpenAI\n\nclient = OpenAI(\n    api_key=os.environ["COCAAPI_API_KEY"],\n    base_url="https://cocaapi.com/v1",\n)\n\nresponse = client.chat.completions.create(\n    model="YOUR_MODEL_NAME",\n    messages=[{"role": "user", "content": "你好，CocaAPI"}],\n    max_tokens=128,\n)\nprint(response.choices[0].message.content)',
    node: 'import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: process.env.COCAAPI_API_KEY,\n  baseURL: "https://cocaapi.com/v1",\n});\n\nconst response = await client.chat.completions.create({\n  model: "YOUR_MODEL_NAME",\n  messages: [{ role: "user", content: "你好，CocaAPI" }],\n  max_tokens: 128,\n});\nconsole.log(response.choices[0].message.content);',
  });
  const tabs = Array.from(document.querySelectorAll("[data-language]"));
  const panel = document.getElementById("code-panel");
  const status = document.getElementById("copy-status");
  function selectTab(selected) {
    tabs.forEach(function (tab) {
      const active = tab === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    code.textContent = examples[selected.dataset.language];
    panel.setAttribute("aria-labelledby", selected.id);
    status.textContent = "";
  }
  tabs.forEach(function (tab, index) {
    tab.hidden = false;
    tab.addEventListener("click", function () {
      selectTab(tab);
    });
    tab.addEventListener("keydown", function (event) {
      const target =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : event.key === "ArrowRight"
              ? (index + 1) % tabs.length
              : event.key === "ArrowLeft"
                ? (index + tabs.length - 1) % tabs.length
                : null;
      if (target === null) return;
      event.preventDefault();
      selectTab(tabs[target]);
      tabs[target].focus();
    });
  });
  const copy = document.getElementById("copy-code");
  copy.hidden = false;
  copy.addEventListener("click", async function () {
    try {
      await navigator.clipboard.writeText(code.textContent);
      status.textContent = "已复制到剪贴板";
    } catch {
      status.textContent = "请选中示例代码后手动复制";
    }
  });
})();
