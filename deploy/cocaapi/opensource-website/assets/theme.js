(function () {
  "use strict";
  document.documentElement.classList.add("js");
  try {
    const saved = localStorage.getItem("cocaapi-opensource-theme");
    const choice =
      saved === "light" || saved === "dark" || saved === "system"
        ? saved
        : "dark";
    document.documentElement.dataset.themeChoice = choice;
    document.documentElement.dataset.theme =
      choice === "system"
        ? matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark"
        : choice;
  } catch {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themeChoice = "dark";
  }
})();
