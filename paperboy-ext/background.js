const MESSAGE_TYPES = {
  REQUEST_PAGE_DATA: "paperboy:request-page-data",
  START_PICKER: "paperboy:start-picker",
  REGION_PICKED: "paperboy:region-picked",
  PICKER_CANCELLED: "paperboy:picker-cancelled",
};

async function configureSidePanelBehavior() {
  try {
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true,
    });
  } catch (error) {
    console.error("Failed to configure side panel behavior:", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanelBehavior();
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanelBehavior();
});

// Runs in the page context, no closure access. Returns a plain object.
function capturePageInPage() {
  return {
    html: document.documentElement?.outerHTML ?? "",
    title: document.title ?? "",
    url: window.location.href,
    lang: document.documentElement?.lang ?? "",
    capturedAt: new Date().toISOString(),
  };
}

// Runs in the page context. Renders a hover overlay and frame-picker logic.
// On click, sends the selected element's outerHTML back to the extension via
// chrome.runtime.sendMessage. Escape cancels; Tab escalates to the parent frame.
function startPickerInPage() {
  if (window.__paperboyPickerActive) return;
  window.__paperboyPickerActive = true;

  const PICKED = "paperboy:region-picked";
  const CANCELLED = "paperboy:picker-cancelled";

  const FRAME_ROLES = new Set([
    "main",
    "article",
    "complementary",
    "contentinfo",
    "banner",
    "navigation",
    "region",
    "form",
    "search",
  ]);
  const FRAME_TAGS = new Set([
    "MAIN",
    "ARTICLE",
    "SECTION",
    "ASIDE",
    "NAV",
    "HEADER",
    "FOOTER",
    "FORM",
  ]);

  function isFrame(el) {
    if (!el || el.nodeType !== 1) return false;
    if (FRAME_TAGS.has(el.tagName)) return true;
    const role = el.getAttribute && el.getAttribute("role");
    if (role && FRAME_ROLES.has(role)) return true;
    const cs = window.getComputedStyle(el);
    if (
      cs.overflowY === "auto" ||
      cs.overflowY === "scroll" ||
      cs.overflowX === "auto" ||
      cs.overflowX === "scroll"
    ) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 200) return true;
    }
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.width > vw * 0.4 && rect.height > vh * 0.3) return true;
    return false;
  }

  function findFrame(start) {
    let node = start;
    while (node && node !== document.body && node !== document.documentElement) {
      if (isFrame(node)) return node;
      node = node.parentElement;
    }
    return document.body;
  }

  function findParentFrame(start) {
    let node = start?.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      if (isFrame(node)) return node;
      node = node.parentElement;
    }
    return document.body;
  }

  const overlay = document.createElement("div");
  overlay.style.cssText = [
    "position: fixed",
    "pointer-events: none",
    "z-index: 2147483646",
    "outline: 2px solid #1f4fd6",
    "outline-offset: -2px",
    "background: rgba(31, 79, 214, 0.12)",
    "transition: all 80ms ease-out",
    "display: none",
  ].join(";");

  const label = document.createElement("div");
  label.style.cssText = [
    "position: fixed",
    "z-index: 2147483647",
    "background: #1f4fd6",
    "color: white",
    "font: 12px/1.4 -apple-system, system-ui, sans-serif",
    "padding: 4px 8px",
    "border-radius: 4px",
    "pointer-events: none",
    "max-width: 300px",
    "white-space: nowrap",
    "overflow: hidden",
    "text-overflow: ellipsis",
    "display: none",
  ].join(";");

  const banner = document.createElement("div");
  banner.style.cssText = [
    "position: fixed",
    "top: 16px",
    "left: 50%",
    "transform: translateX(-50%)",
    "z-index: 2147483647",
    "background: #101010",
    "color: white",
    "font: 13px/1.4 -apple-system, system-ui, sans-serif",
    "padding: 8px 14px",
    "border-radius: 999px",
    "pointer-events: none",
    "box-shadow: 0 4px 16px rgba(0,0,0,0.25)",
  ].join(";");
  banner.textContent =
    "Paperboy: hover a region · click to pick · Tab to expand · Esc to cancel";

  document.documentElement.appendChild(overlay);
  document.documentElement.appendChild(label);
  document.documentElement.appendChild(banner);

  let currentFrame = null;

  function describe(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls =
      el.className && typeof el.className === "string"
        ? `.${el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`
        : "";
    const role = el.getAttribute("role")
      ? ` [role=${el.getAttribute("role")}]`
      : "";
    return `${tag}${id}${cls}${role}`;
  }

  function highlight(el) {
    if (!el) {
      overlay.style.display = "none";
      label.style.display = "none";
      currentFrame = null;
      return;
    }
    const rect = el.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    label.style.display = "block";
    label.textContent = describe(el);
    const labelTop = rect.top - 26 < 0 ? rect.top + 4 : rect.top - 26;
    label.style.top = `${labelTop}px`;
    label.style.left = `${Math.max(rect.left, 4)}px`;
    currentFrame = el;
  }

  function onMouseMove(event) {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || target === overlay || target === label || target === banner) {
      return;
    }
    const frame = findFrame(target);
    if (frame !== currentFrame) {
      highlight(frame);
    }
  }

  function teardown() {
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();
    label.remove();
    banner.remove();
    window.__paperboyPickerActive = false;
  }

  function onClick(event) {
    if (!currentFrame) return;
    event.preventDefault();
    event.stopPropagation();
    const html = currentFrame.outerHTML || "";
    teardown();
    chrome.runtime.sendMessage({
      type: PICKED,
      data: {
        html,
        title: document.title || "",
        url: window.location.href,
        lang: document.documentElement?.lang || "",
        capturedAt: new Date().toISOString(),
      },
    });
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      teardown();
      chrome.runtime.sendMessage({ type: CANCELLED });
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const parent = findParentFrame(currentFrame);
      highlight(parent);
    }
  }

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
}

// Translate Chrome's terse scripting errors into something a user can act on.
// Covers managed-policy blocks (Comet, Brave, Edge, Chrome Enterprise...),
// chrome:// and Web Store pages, other extensions' pages, and file:// URLs.
// Anything we don't recognize falls through with the raw error message so
// genuinely useful info isn't hidden.
function friendlyExtractionError(rawMessage) {
  if (!rawMessage) return "Could not read this page.";
  const msg = String(rawMessage).toLowerCase();

  if (
    msg.includes("extensionssettings policy") ||
    msg.includes("extensionsettings policy") ||
    msg.includes("blocked by extension policy") ||
    msg.includes("blocked by enterprise policy")
  ) {
    return (
      "This browser blocks Paperboy on this site by policy. " +
      "Try the page in regular Chrome, or check chrome://policy " +
      "(or your browser's equivalent) for the active rule."
    );
  }

  if (
    msg.includes("chrome web store") ||
    msg.includes("extensions gallery") ||
    msg.includes("cannot be scripted")
  ) {
    return (
      "This browser doesn't allow extensions to read this page " +
      "(Web Store or a built-in browser page). Open a regular web " +
      "page and try again."
    );
  }

  if (msg.includes("chrome-extension://")) {
    return "Paperboy can't read other extensions' pages.";
  }

  if (
    msg.includes("cannot access a chrome url") ||
    msg.includes("the extension manifest must request permission to access " +
      "this host") ||
    msg.includes("chrome://")
  ) {
    return (
      "This browser locks chrome:// (and similar internal) pages away " +
      "from all extensions. Open a regular web page and try again."
    );
  }

  if (
    msg.includes("file urls") ||
    msg.includes("file://") ||
    msg.includes("local file")
  ) {
    return (
      "Reading local files needs 'Allow access to file URLs' enabled. " +
      "chrome://extensions → Paperboy → Details → toggle it on."
    );
  }

  if (
    msg.includes("cannot access contents of the page") ||
    msg.includes("must request permission to access the respective host")
  ) {
    return (
      "Click the Paperboy icon in the toolbar to grant access to this " +
      "page, then try again."
    );
  }

  return rawMessage;
}

async function captureActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return {
      ok: false,
      error: "No active tab found. Open a normal web page and try again.",
    };
  }

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: capturePageInPage,
    });

    if (!injection?.result) {
      return { ok: false, error: "No content returned from this tab." };
    }

    return { ok: true, data: injection.result };
  } catch (error) {
    return {
      ok: false,
      error: friendlyExtractionError(error?.message),
    };
  }
}

async function startPickerOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return {
      ok: false,
      error: "No active tab found. Open a normal web page and try again.",
    };
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: startPickerInPage,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: friendlyExtractionError(error?.message),
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.REQUEST_PAGE_DATA) {
    captureActiveTab().then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE_TYPES.START_PICKER) {
    startPickerOnActiveTab().then(sendResponse);
    return true;
  }
  // REGION_PICKED and PICKER_CANCELLED come from the page; the side panel
  // listens directly via chrome.runtime.onMessage, so no relay needed here.
  return false;
});
