const order = { preview: 0, editor: 1, split: 2, system: 0, light: 1, dark: 2 };

export function initUiState({ onViewModeChange }) {
  const root = document.documentElement;
  const toolbar = document.querySelector("[data-toolbar]");
  const content = document.querySelector(".content-area");
  const themeToggle = document.querySelector(".theme-toggle");
  const viewToggle = document.querySelector(".view-toggle");
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let viewMode = content.dataset.viewMode || "editor";

  const syncPill = (el, value) => {
    el.dataset.active = String(order[value]);
    el.style.setProperty("--active-index", order[value]);
  };

  const setActive = (selector, attr, value) => {
    document.querySelectorAll(selector).forEach((button) => button.classList.toggle("active", button.dataset[attr] === value));
  };

  const setTheme = (theme) => {
    root.dataset.theme = theme;
    localStorage.setItem("paperboy-theme", theme);
    setActive("[data-theme-btn]", "themeBtn", theme);
    syncPill(themeToggle, theme);
  };

  const setViewMode = (mode) => {
    viewMode = mode;
    content.dataset.viewMode = mode;
    toolbar.hidden = mode === "preview";
    setActive("[data-view]", "view", mode);
    syncPill(viewToggle, mode);
    onViewModeChange(mode);
  };

  themeToggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme-btn]");
    if (button) setTheme(button.dataset.themeBtn);
  });

  viewToggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (button) setViewMode(button.dataset.view);
  });

  media.addEventListener("change", () => {
    if (root.dataset.theme === "system") setTheme("system");
  });

  setTheme(root.dataset.theme || "system");
  setViewMode(viewMode);
  return { setTheme, setViewMode, getViewMode: () => viewMode };
}

