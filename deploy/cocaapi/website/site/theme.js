(function () {
  "use strict";
  try {
    const saved = localStorage.getItem("cocaapi-website-theme");
    if (saved === "light" || saved === "dark")
      document.documentElement.dataset.theme = saved;
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();
