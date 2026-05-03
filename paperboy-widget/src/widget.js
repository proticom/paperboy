import { createTurndownService } from "./turndown-config";
import { PAPERBOY_WIDGET_STYLE } from "./styles";

const VIEW_WEB = "web";
const VIEW_MD = "md";
const STORAGE_KEY = "paperboy-view";
const COLLAPSED_KEY = "paperboy-collapsed";

if (window.__paperboyWidgetLoaded) {
  console.warn("Paperboy widget is already running on this page.");
} else {
  window.__paperboyWidgetLoaded = true;
  initializeWidget();
}

function initializeWidget() {
  injectStyles();

  const scriptTag = getCurrentScriptTag();
  const selector = scriptTag?.dataset.selector ?? "";
  const defaultView = scriptTag?.dataset.defaultView === VIEW_MD ? VIEW_MD : null;
  const turndownService = createTurndownService();
  const state = {
    markdown: "",
    hiddenNodeDisplayMap: new Map(),
    previousFocus: null,
  };

  const ui = buildUi();
  const targetNodes = findTargetNodes(selector, ui);

  if (targetNodes.length === 0) {
    ui.message.textContent =
      "Paperboy could not find page content. Add data-selector=\"#your-content\" to the script tag.";
    ui.mdButton.disabled = true;
  }

  ui.webButton.addEventListener("click", () => {
    setView(VIEW_WEB, { ui, state, targetNodes, turndownService });
  });

  ui.mdButton.addEventListener("click", () => {
    setView(VIEW_MD, { ui, state, targetNodes, turndownService });
  });

  ui.copyButton.addEventListener("click", async () => {
    if (!state.markdown) {
      return;
    }

    try {
      await navigator.clipboard.writeText(state.markdown);
      ui.copyLabel.textContent = "Copied";
      setCopyButtonIcon(ui.copyButton, getCheckIconSvg());
      ui.message.textContent = "Markdown copied to clipboard.";

      setTimeout(() => {
        ui.copyLabel.textContent = "Copy";
        setCopyButtonIcon(ui.copyButton, getCopyIconSvg());
      }, 2000);
    } catch (_error) {
      ui.message.textContent = "Copy failed. You can still select and copy manually.";
    }
  });

  ui.minimizeButton.addEventListener("click", () => {
    collapseToggle(ui);
  });

  ui.restoreButton.addEventListener("click", () => {
    restoreToggle(ui);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ui.overlay.style.display === "block") {
      setView(VIEW_WEB, { ui, state, targetNodes, turndownService });
    }
  });

  ui.overlay.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") {
      return;
    }
    trapFocus(event, ui);
  });

  if (readCollapsed()) {
    collapseToggle(ui);
  }

  const savedView = readSavedView();
  const initialView = defaultView || savedView || VIEW_WEB;
  setView(initialView, { ui, state, targetNodes, turndownService });
}

function injectStyles() {
  if (document.getElementById("paperboy-widget-style")) {
    return;
  }

  const styleTag = document.createElement("style");
  styleTag.id = "paperboy-widget-style";
  styleTag.textContent = PAPERBOY_WIDGET_STYLE;
  document.head.appendChild(styleTag);
}

function getCurrentScriptTag() {
  if (document.currentScript instanceof HTMLScriptElement) {
    return document.currentScript;
  }

  const scripts = Array.from(document.querySelectorAll("script[src]"));
  return (
    scripts.find((script) => script.src.includes("paperboy-widget")) || null
  );
}

function buildUi() {
  const toggle = document.createElement("div");
  toggle.className = "pbw-toggle";
  toggle.dataset.active = "1";
  toggle.setAttribute("role", "toolbar");
  toggle.setAttribute("aria-label", "Paperboy view toggle");

  const pill = document.createElement("div");
  pill.className = "pbw-toggle-pill";
  pill.setAttribute("aria-hidden", "true");

  const webButton = document.createElement("button");
  webButton.className = "pbw-toggle-btn pbw-active";
  webButton.type = "button";
  webButton.title = "Web view";
  webButton.setAttribute("aria-label", "Web view");
  webButton.setAttribute("aria-pressed", "true");
  webButton.innerHTML = getWebIconSvg();

  const mdButton = document.createElement("button");
  mdButton.className = "pbw-toggle-btn";
  mdButton.type = "button";
  mdButton.title = "Markdown view";
  mdButton.setAttribute("aria-label", "Markdown view");
  mdButton.setAttribute("aria-pressed", "false");
  mdButton.innerHTML = getMarkdownIconSvg();

  const minimizeButton = document.createElement("button");
  minimizeButton.className = "pbw-minimize-btn";
  minimizeButton.type = "button";
  minimizeButton.title = "Minimize Paperboy";
  minimizeButton.setAttribute("aria-label", "Minimize Paperboy");
  minimizeButton.innerHTML = getChevronRightSvg();

  toggle.append(pill, webButton, mdButton, minimizeButton);

  const restoreButton = document.createElement("button");
  restoreButton.className = "pbw-restore-btn";
  restoreButton.type = "button";
  restoreButton.title = "Show Paperboy";
  restoreButton.setAttribute("aria-label", "Show Paperboy");
  restoreButton.innerHTML = getMarkdownIconSvg();

  const overlay = document.createElement("div");
  overlay.className = "pbw-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Markdown view");
  overlay.setAttribute("aria-modal", "true");

  const message = document.createElement("p");
  message.className = "pbw-msg";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.textContent = "Ready.";

  const panel = document.createElement("div");
  panel.className = "pbw-panel";

  const copyButton = document.createElement("button");
  copyButton.className = "pbw-copy-btn";
  copyButton.type = "button";
  copyButton.innerHTML = `${getCopyIconSvg()}<span class="pbw-copy-label">Copy</span>`;
  copyButton.setAttribute("aria-label", "Copy markdown");

  const output = document.createElement("pre");
  output.className = "pbw-output";
  output.setAttribute("tabindex", "0");
  output.setAttribute("role", "region");
  output.setAttribute("aria-label", "Markdown output");
  output.textContent = "Markdown will appear here.";

  panel.append(copyButton, output);
  overlay.append(message, panel);
  document.body.append(toggle, restoreButton, overlay);

  const copyLabel = copyButton.querySelector(".pbw-copy-label");

  return {
    toggle,
    webButton,
    mdButton,
    minimizeButton,
    restoreButton,
    overlay,
    message,
    copyButton,
    copyLabel,
    output,
  };
}

function findTargetNodes(selector, ui) {
  if (selector) {
    const selectedNode = document.querySelector(selector);
    return selectedNode ? [selectedNode] : [];
  }

  const mainNode = document.querySelector("main");
  if (mainNode) {
    return [mainNode];
  }

  const articleNode = document.querySelector("article");
  if (articleNode) {
    return [articleNode];
  }

  const headerNode = document.querySelector("header");
  const footerNode = document.querySelector("footer");

  if (
    headerNode &&
    footerNode &&
    headerNode.compareDocumentPosition(footerNode) & Node.DOCUMENT_POSITION_FOLLOWING
  ) {
    const betweenNodes = [];
    let pointer = headerNode.nextElementSibling;

    while (pointer && pointer !== footerNode) {
      if (
        pointer !== ui.toggle &&
        pointer !== ui.overlay &&
        pointer !== ui.restoreButton
      ) {
        betweenNodes.push(pointer);
      }
      pointer = pointer.nextElementSibling;
    }

    if (betweenNodes.length > 0) {
      return betweenNodes;
    }
  }

  return Array.from(document.body.children).filter((node) => {
    return (
      node !== ui.toggle &&
      node !== ui.overlay &&
      node !== ui.restoreButton &&
      node.tagName !== "SCRIPT"
    );
  });
}

function setView(viewMode, context) {
  const { ui, state, targetNodes, turndownService } = context;
  const isMarkdown = viewMode === VIEW_MD;

  ui.toggle.dataset.active = isMarkdown ? "2" : "1";
  ui.webButton.classList.toggle("pbw-active", !isMarkdown);
  ui.mdButton.classList.toggle("pbw-active", isMarkdown);
  ui.webButton.setAttribute("aria-pressed", String(!isMarkdown));
  ui.mdButton.setAttribute("aria-pressed", String(isMarkdown));

  if (isMarkdown) {
    try {
      const markdown = generateMarkdown(targetNodes, turndownService);
      state.markdown = markdown;
      ui.output.textContent = markdown;
      ui.message.textContent = `Converted ${targetNodes.length} content block(s).`;
      hideTargetNodes(targetNodes, state.hiddenNodeDisplayMap);
      ui.overlay.style.display = "block";

      state.previousFocus = document.activeElement;
      ui.copyButton.focus();

      saveView(VIEW_MD);
    } catch (error) {
      state.markdown = "";
      ui.output.textContent = `Error: ${error.message}`;
      ui.message.textContent = "Could not convert this page. Try a specific data-selector.";
      ui.overlay.style.display = "block";
    }
  } else {
    restoreTargetNodes(state.hiddenNodeDisplayMap);
    ui.overlay.style.display = "none";

    if (state.previousFocus && typeof state.previousFocus.focus === "function") {
      state.previousFocus.focus();
      state.previousFocus = null;
    }

    saveView(VIEW_WEB);
  }
}

function generateMarkdown(targetNodes, turndownService) {
  if (targetNodes.length === 0) {
    throw new Error("No target content was found.");
  }

  const html = targetNodes.map((node) => node.outerHTML).join("\n\n");
  const bodyMarkdown = turndownService.turndown(html).trim();

  const markdownLines = [
    `# ${document.title || "Untitled page"}`,
    "",
    `Source: ${window.location.href}`,
    "",
    bodyMarkdown || "_No markdown generated._",
  ];

  return `${markdownLines.join("\n").trim()}\n`;
}

function hideTargetNodes(targetNodes, displayMap) {
  displayMap.clear();
  targetNodes.forEach((node) => {
    displayMap.set(node, node.style.display);
    node.style.display = "none";
  });
}

function restoreTargetNodes(displayMap) {
  displayMap.forEach((displayValue, node) => {
    node.style.display = displayValue;
  });
  displayMap.clear();
}

function collapseToggle(ui) {
  ui.toggle.classList.add("pbw-collapsed");
  ui.restoreButton.classList.add("pbw-visible");
  saveCollapsed(true);
}

function restoreToggle(ui) {
  ui.toggle.classList.remove("pbw-collapsed");
  ui.restoreButton.classList.remove("pbw-visible");
  ui.webButton.focus();
  saveCollapsed(false);
}

function trapFocus(event, ui) {
  const focusable = ui.overlay.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) {
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setCopyButtonIcon(copyButton, svgMarkup) {
  const oldIcon = copyButton.querySelector("svg");
  if (oldIcon) {
    oldIcon.remove();
  }
  copyButton.insertAdjacentHTML("afterbegin", svgMarkup);
}

function readSavedView() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === VIEW_MD ? VIEW_MD : value === VIEW_WEB ? VIEW_WEB : null;
  } catch (_error) {
    return null;
  }
}

function saveView(viewMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, viewMode);
  } catch (_error) {
    // localStorage may be unavailable in some contexts.
  }
}

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch (_error) {
    return false;
  }
}

function saveCollapsed(collapsed) {
  try {
    if (collapsed) {
      window.localStorage.setItem(COLLAPSED_KEY, "true");
    } else {
      window.localStorage.removeItem(COLLAPSED_KEY);
    }
  } catch (_error) {
    // localStorage may be unavailable in some contexts.
  }
}

function getWebIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
}

function getMarkdownIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
}

function getCopyIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
}

function getCheckIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
}

function getChevronRightSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
}
