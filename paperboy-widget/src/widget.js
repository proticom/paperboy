import { createTurndownService } from "./turndown-config";
import { PAPERBOY_WIDGET_STYLE } from "./styles";

const VIEW_WEB = "web";
const VIEW_MD = "md";
const STORAGE_KEY = "paperboy-view";
const COLLAPSED_KEY = "paperboy-collapsed";

const TOGGLE_POSITIONS = {
  "bottom-right": { top: "auto", bottom: "16px", left: "auto", right: "16px" },
  "bottom-left":  { top: "auto", bottom: "16px", left: "16px", right: "auto" },
  "top-right":    { top: "16px", bottom: "auto", left: "auto", right: "16px" },
  "top-left":     { top: "16px", bottom: "auto", left: "16px", right: "auto" },
};

if (window.__paperboyWidgetLoaded) {
  console.warn("Paperboy widget is already running on this page.");
} else {
  window.__paperboyWidgetLoaded = true;
  initializeWidget();
}

function initializeWidget() {
  injectStyles();

  const scriptTag = getCurrentScriptTag();
  const config = readConfig(scriptTag);
  const turndownService = createTurndownService();
  const state = {
    markdown: "",
    hiddenNodeDisplayMap: new Map(),
    previousFocus: null,
  };

  const ui = buildUi(config);
  applyToggleStyles(ui.toggle, config);
  applyCopyPosition(ui.copyButton, config);
  applyInlineCopyPosition(ui.inlineCopyButton, config);
  applyMarkdownStyles(ui, config);

  const targetNodes = findTargetNodes(config.selector, ui);

  if (targetNodes.length === 0) {
    ui.message.textContent =
      "Paperboy could not find page content. Add data-selector=\"#your-content\" to the script tag.";
    ui.mdButton.disabled = true;
  }

  if (config.render === "inline" && targetNodes.length > 0) {
    // Mount the inline output panel immediately before the first target
    // so it occupies the same flow position. Hidden until markdown view.
    const firstTarget = targetNodes[0];
    firstTarget.parentNode?.insertBefore(ui.inline, firstTarget);
  }

  ui.webButton.addEventListener("click", () => {
    setView(VIEW_WEB, { ui, state, targetNodes, turndownService, config });
  });

  ui.mdButton.addEventListener("click", () => {
    setView(VIEW_MD, { ui, state, targetNodes, turndownService, config });
  });

  const copyHandler = async () => {
    if (!state.markdown) return;
    try {
      await navigator.clipboard.writeText(state.markdown);
      flashCopied(ui);
    } catch (_error) {
      ui.message.textContent =
        "Copy failed. You can still select and copy manually.";
    }
  };
  ui.copyButton.addEventListener("click", copyHandler);
  ui.inlineCopyButton.addEventListener("click", copyHandler);

  ui.minimizeButton.addEventListener("click", () => collapseToggle(ui));
  ui.restoreButton.addEventListener("click", () => restoreToggle(ui));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && config.render === "overlay" && ui.overlay.style.display === "block") {
      setView(VIEW_WEB, { ui, state, targetNodes, turndownService, config });
    }
  });

  ui.overlay.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    trapFocus(event, ui);
  });

  if (readCollapsed()) collapseToggle(ui);

  const savedView = readSavedView();
  const initialView = config.defaultView || savedView || VIEW_WEB;
  setView(initialView, { ui, state, targetNodes, turndownService, config });
}

function injectStyles() {
  if (document.getElementById("paperboy-widget-style")) return;
  const styleTag = document.createElement("style");
  styleTag.id = "paperboy-widget-style";
  styleTag.textContent = PAPERBOY_WIDGET_STYLE;
  document.head.appendChild(styleTag);
}

function getCurrentScriptTag() {
  if (document.currentScript instanceof HTMLScriptElement) {
    return document.currentScript;
  }
  // Fall back to last <script src*="paperboy-widget"> when document.currentScript
  // isn't available (e.g. when the script is injected dynamically).
  const candidates = document.querySelectorAll("script[src*='paperboy-widget']");
  return candidates[candidates.length - 1] || null;
}

function readConfig(scriptTag) {
  const ds = scriptTag?.dataset ?? {};
  const labels = (ds.labels ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const togglePosition = TOGGLE_POSITIONS[ds.togglePosition] ? ds.togglePosition : "bottom-right";
  const copyPosition = ["top-right", "top-left", "bottom-right", "bottom-left", "none"].includes(ds.copyPosition)
    ? ds.copyPosition
    : "top-right";
  return {
    selector: ds.selector ?? "",
    defaultView: ds.defaultView === VIEW_MD ? VIEW_MD : null,
    labels: labels.length === 2 ? labels : null,
    render: ds.render === "inline" ? "inline" : "overlay",
    togglePosition,
    copyPosition,
    mdFont: ds.mdFont ?? null,
    mdColor: ds.mdColor ?? null,
    mdBg: ds.mdBg ?? null,
    mdSyntax: ds.mdSyntax === "on",
  };
}

function buildUi(config) {
  const toggle = document.createElement("div");
  toggle.className = "pbw-toggle";
  if (config.labels) toggle.classList.add("pbw-labels");
  toggle.dataset.active = "1";
  toggle.setAttribute("role", "toolbar");
  toggle.setAttribute("aria-label", "Paperboy view toggle");

  const pill = document.createElement("div");
  pill.className = "pbw-toggle-pill";
  pill.setAttribute("aria-hidden", "true");

  const [webLabel, mdLabel] = config.labels ?? [null, null];

  const webButton = document.createElement("button");
  webButton.className = "pbw-toggle-btn pbw-active";
  webButton.type = "button";
  webButton.title = webLabel ?? "Web view";
  webButton.setAttribute("aria-label", webLabel ?? "Web view");
  webButton.setAttribute("aria-pressed", "true");
  webButton.innerHTML = `${getWebIconSvg()}${webLabel ? `<span>${escapeHtml(webLabel)}</span>` : ""}`;

  const mdButton = document.createElement("button");
  mdButton.className = "pbw-toggle-btn";
  mdButton.type = "button";
  mdButton.title = mdLabel ?? "Markdown view";
  mdButton.setAttribute("aria-label", mdLabel ?? "Markdown view");
  mdButton.setAttribute("aria-pressed", "false");
  mdButton.innerHTML = `${getMarkdownIconSvg()}${mdLabel ? `<span>${escapeHtml(mdLabel)}</span>` : ""}`;

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
  copyButton.setAttribute("aria-label", "Copy markdown");
  copyButton.innerHTML = `${getCopyIconSvg()}<span class="pbw-copy-label">Copy</span>`;

  const output = document.createElement("pre");
  output.className = "pbw-output";
  output.setAttribute("tabindex", "0");
  output.setAttribute("role", "region");
  output.setAttribute("aria-label", "Markdown output");
  output.textContent = "Markdown will appear here.";

  panel.append(copyButton, output);
  overlay.append(message, panel);
  document.body.append(toggle, restoreButton, overlay);

  // Inline rendering surface: hidden until markdown view in inline mode.
  // Built but never inserted into the DOM until a target is found.
  const inline = document.createElement("div");
  inline.className = "pbw-inline";
  const inlineCopyButton = document.createElement("button");
  inlineCopyButton.className = "pbw-copy-btn";
  inlineCopyButton.type = "button";
  inlineCopyButton.setAttribute("aria-label", "Copy markdown");
  inlineCopyButton.innerHTML = `${getCopyIconSvg()}<span class="pbw-copy-label">Copy</span>`;
  const inlineOutput = document.createElement("pre");
  inlineOutput.className = "pbw-output";
  inlineOutput.setAttribute("tabindex", "0");
  inlineOutput.setAttribute("role", "region");
  inlineOutput.setAttribute("aria-label", "Markdown output");
  inlineOutput.textContent = "Markdown will appear here.";
  inline.append(inlineCopyButton, inlineOutput);

  return {
    toggle,
    webButton,
    mdButton,
    minimizeButton,
    restoreButton,
    overlay,
    message,
    copyButton,
    output,
    inline,
    inlineCopyButton,
    inlineOutput,
  };
}

function applyToggleStyles(toggle, config) {
  const pos = TOGGLE_POSITIONS[config.togglePosition];
  if (!pos) return;
  toggle.style.setProperty("--pbw-toggle-top", pos.top);
  toggle.style.setProperty("--pbw-toggle-bottom", pos.bottom);
  toggle.style.setProperty("--pbw-toggle-left", pos.left);
  toggle.style.setProperty("--pbw-toggle-right", pos.right);
}

function applyCopyPosition(button, config) {
  button.dataset.position = config.copyPosition;
}

function applyInlineCopyPosition(button, config) {
  button.dataset.position = config.copyPosition;
}

function applyMarkdownStyles(ui, config) {
  const targets = [ui.overlay, ui.inline];
  for (const target of targets) {
    if (config.mdFont) target.style.setProperty("--pbw-md-font", config.mdFont);
    if (config.mdColor) target.style.setProperty("--pbw-md-color", config.mdColor);
    if (config.mdBg) target.style.setProperty("--pbw-md-bg", config.mdBg);
  }
}

function findTargetNodes(selector, ui) {
  if (selector) {
    const selectedNode = document.querySelector(selector);
    return selectedNode ? [selectedNode] : [];
  }

  const mainNode = document.querySelector("main");
  if (mainNode) return [mainNode];

  const articleNode = document.querySelector("article");
  if (articleNode) return [articleNode];

  const headerNode = document.querySelector("header");
  const footerNode = document.querySelector("footer");

  if (
    headerNode &&
    footerNode &&
    headerNode.compareDocumentPosition(footerNode) & Node.DOCUMENT_POSITION_FOLLOWING
  ) {
    const between = [];
    let pointer = headerNode.nextElementSibling;
    while (pointer && pointer !== footerNode) {
      if (
        pointer !== ui.toggle &&
        pointer !== ui.overlay &&
        pointer !== ui.restoreButton &&
        pointer !== ui.inline
      ) {
        between.push(pointer);
      }
      pointer = pointer.nextElementSibling;
    }
    if (between.length > 0) return between;
  }

  return Array.from(document.body.children).filter((node) => {
    return (
      node !== ui.toggle &&
      node !== ui.overlay &&
      node !== ui.restoreButton &&
      node !== ui.inline &&
      node.tagName !== "SCRIPT"
    );
  });
}

function setView(viewMode, context) {
  const { ui, state, targetNodes, turndownService, config } = context;
  const isMarkdown = viewMode === VIEW_MD;
  const useInline = config.render === "inline";

  ui.toggle.dataset.active = isMarkdown ? "2" : "1";
  ui.webButton.classList.toggle("pbw-active", !isMarkdown);
  ui.mdButton.classList.toggle("pbw-active", isMarkdown);
  ui.webButton.setAttribute("aria-pressed", String(!isMarkdown));
  ui.mdButton.setAttribute("aria-pressed", String(isMarkdown));

  if (isMarkdown) {
    try {
      const markdown = generateMarkdown(targetNodes, turndownService);
      state.markdown = markdown;
      const rendered = config.mdSyntax ? highlightMarkdown(markdown) : escapeHtml(markdown);
      if (useInline) {
        ui.inlineOutput.innerHTML = rendered;
        hideTargetNodes(targetNodes, state.hiddenNodeDisplayMap);
        ui.inline.classList.add("pbw-visible");
      } else {
        ui.output.innerHTML = rendered;
        ui.message.textContent = `Converted ${targetNodes.length} content block(s).`;
        hideTargetNodes(targetNodes, state.hiddenNodeDisplayMap);
        ui.overlay.style.display = "block";
        state.previousFocus = document.activeElement;
        ui.copyButton.focus();
      }
      saveView(VIEW_MD);
    } catch (error) {
      state.markdown = "";
      const message = `Could not convert this page. ${error?.message ?? ""}`.trim();
      if (useInline) {
        ui.inlineOutput.textContent = `Error: ${error.message}`;
        ui.inline.classList.add("pbw-visible");
      } else {
        ui.output.textContent = `Error: ${error.message}`;
        ui.message.textContent = message;
        ui.overlay.style.display = "block";
      }
    }
  } else {
    restoreTargetNodes(state.hiddenNodeDisplayMap);
    if (useInline) {
      ui.inline.classList.remove("pbw-visible");
    } else {
      ui.overlay.style.display = "none";
      if (state.previousFocus && typeof state.previousFocus.focus === "function") {
        state.previousFocus.focus();
        state.previousFocus = null;
      }
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
  if (focusable.length === 0) return;
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

function flashCopied(ui) {
  for (const btn of [ui.copyButton, ui.inlineCopyButton]) {
    btn.innerHTML = `${getCheckIconSvg()}<span class="pbw-copy-label">Copied</span>`;
  }
  setTimeout(() => {
    for (const btn of [ui.copyButton, ui.inlineCopyButton]) {
      btn.innerHTML = `${getCopyIconSvg()}<span class="pbw-copy-label">Copy</span>`;
    }
  }, 1800);
}

function readSavedView() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === VIEW_WEB || saved === VIEW_MD) return saved;
  } catch (_error) {}
  return null;
}

function saveView(viewMode) {
  try {
    localStorage.setItem(STORAGE_KEY, viewMode);
  } catch (_error) {}
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch (_error) {
    return false;
  }
}

function saveCollapsed(collapsed) {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch (_error) {}
}

// Lightweight regex-based markdown tokenizer for optional syntax coloring.
// Off by default; enabled via data-md-syntax="on". Tokens get class names
// the stylesheet picks up (.pbw-md-heading, etc.).
function highlightMarkdown(md) {
  return md
    .split("\n")
    .map((line) => {
      if (/^#{1,6}\s/.test(line)) {
        return `<span class="pbw-md-heading">${escapeHtml(line)}</span>`;
      }
      if (/^>\s?/.test(line)) {
        return `<span class="pbw-md-blockquote">${escapeHtml(line)}</span>`;
      }
      if (/^\s*```/.test(line)) {
        return `<span class="pbw-md-fence">${escapeHtml(line)}</span>`;
      }
      const bullet = line.match(/^(\s*)([-*+]|\d+\.)(\s+)(.*)$/);
      if (bullet) {
        const [, indent, marker, gap, rest] = bullet;
        return `${indent}<span class="pbw-md-bullet">${escapeHtml(marker)}</span>${gap}${highlightInline(rest)}`;
      }
      return highlightInline(line);
    })
    .join("\n");
}

function highlightInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<span class="pbw-md-code">`$1`</span>')
    .replace(/(\[[^\]]+\]\([^)]+\))/g, '<span class="pbw-md-link">$1</span>');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getWebIconSvg() {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
}

function getMarkdownIconSvg() {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
}

function getCopyIconSvg() {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
}

function getCheckIconSvg() {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
}

function getChevronRightSvg() {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`;
}
