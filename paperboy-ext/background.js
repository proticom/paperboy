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

// Runs in the page context, no closure access. Auto-scrolls the dominant
// scroll container so lazy-loaded content (images, infinite-scroll lists,
// chat backlog) is in the DOM before serialization. Caps at 20 iterations
// or 30 seconds to handle pages with truly infinite scroll.
async function capturePageInPage() {
  await (async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const docEl = document.scrollingElement || document.documentElement;
    if (!docEl) return;

    function isScrollable(el) {
      if (el === docEl) return el.scrollHeight > el.clientHeight + 10;
      const cs = window.getComputedStyle(el);
      const oy = cs.overflowY;
      if (oy !== "auto" && oy !== "scroll") return false;
      const rect = el.getBoundingClientRect();
      if (rect.height < window.innerHeight * 0.3) return false;
      return el.scrollHeight > el.clientHeight + 10;
    }

    const scrollables = [docEl];
    for (const el of document.querySelectorAll("*")) {
      if (isScrollable(el)) scrollables.push(el);
    }

    scrollables.sort((a, b) => {
      const aArea =
        a === docEl
          ? window.innerWidth * window.innerHeight
          : (() => {
              const r = a.getBoundingClientRect();
              return r.width * r.height;
            })();
      const bArea =
        b === docEl
          ? window.innerWidth * window.innerHeight
          : (() => {
              const r = b.getBoundingClientRect();
              return r.width * r.height;
            })();
      return bArea - aArea;
    });

    const target = scrollables[0];
    const originalScroll = target.scrollTop;
    const startTime = Date.now();
    const MAX_TIME_MS = 30000;
    const MAX_ITERATIONS = 20;
    const SETTLE_MS = 500;

    target.scrollTop = 0;
    await sleep(SETTLE_MS);

    let stable = 0;
    let prevHeight = target.scrollHeight;
    let prevTop = target.scrollTop;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      if (Date.now() - startTime > MAX_TIME_MS) break;
      target.scrollTop = Math.min(
        target.scrollTop + target.clientHeight * 0.8,
        target.scrollHeight,
      );
      await sleep(SETTLE_MS);
      const newHeight = target.scrollHeight;
      const newTop = target.scrollTop;
      if (newHeight === prevHeight && newTop === prevTop) {
        stable += 1;
        if (stable >= 2) break;
      } else {
        stable = 0;
        prevHeight = newHeight;
        prevTop = newTop;
      }
      if (newTop + target.clientHeight >= newHeight - 10) break;
    }

    target.scrollTop = originalScroll;
    await sleep(100);
  })().catch(() => {
    /* swallow scroll errors; capture whatever's in the DOM */
  });

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
    "Paperboy: click to add region · click again to remove · Tab expand · Enter or Done to finish · Esc cancels";

  const doneBadge = document.createElement("button");
  doneBadge.type = "button";
  doneBadge.style.cssText = [
    "position: fixed",
    "top: 16px",
    "right: 16px",
    "z-index: 2147483647",
    "background: #2ea043",
    "color: white",
    "font: 13px/1.4 -apple-system, system-ui, sans-serif",
    "padding: 8px 14px",
    "border: 0",
    "border-radius: 999px",
    "cursor: pointer",
    "box-shadow: 0 4px 16px rgba(0,0,0,0.25)",
    "display: none",
  ].join(";");

  document.documentElement.appendChild(overlay);
  document.documentElement.appendChild(label);
  document.documentElement.appendChild(banner);
  document.documentElement.appendChild(doneBadge);

  let currentFrame = null;
  const pickedElements = [];
  const pickedOverlays = new Map();

  function makePickedOverlay(el) {
    const o = document.createElement("div");
    const rect = el.getBoundingClientRect();
    o.style.cssText = [
      "position: fixed",
      "pointer-events: none",
      "z-index: 2147483645",
      "outline: 2px solid #2ea043",
      "outline-offset: -2px",
      "background: rgba(46, 160, 67, 0.10)",
      `left: ${rect.left}px`,
      `top: ${rect.top}px`,
      `width: ${rect.width}px`,
      `height: ${rect.height}px`,
    ].join(";");
    document.documentElement.appendChild(o);
    return o;
  }

  function refreshPickedOverlays() {
    for (const [el, o] of pickedOverlays.entries()) {
      const rect = el.getBoundingClientRect();
      o.style.left = `${rect.left}px`;
      o.style.top = `${rect.top}px`;
      o.style.width = `${rect.width}px`;
      o.style.height = `${rect.height}px`;
    }
  }

  function updateDoneBadge() {
    if (pickedElements.length === 0) {
      doneBadge.style.display = "none";
      return;
    }
    doneBadge.style.display = "block";
    const n = pickedElements.length;
    doneBadge.textContent = `Done · ${n} region${n === 1 ? "" : "s"} (Enter)`;
  }

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
    if (
      !target ||
      target === overlay ||
      target === label ||
      target === banner ||
      target === doneBadge
    ) {
      return;
    }
    const frame = findFrame(target);
    if (frame !== currentFrame) {
      highlight(frame);
    }
  }

  function onScrollOrResize() {
    if (currentFrame) highlight(currentFrame);
    refreshPickedOverlays();
  }

  function teardown() {
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", onScrollOrResize, true);
    window.removeEventListener("resize", onScrollOrResize, true);
    doneBadge.removeEventListener("click", finalize);
    overlay.remove();
    label.remove();
    banner.remove();
    doneBadge.remove();
    for (const o of pickedOverlays.values()) o.remove();
    pickedOverlays.clear();
    window.__paperboyPickerActive = false;
  }

  function finalize() {
    if (pickedElements.length === 0) return;
    // Sort by DOM order so combined output reads top-to-bottom.
    const sorted = [...pickedElements].sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    const html = sorted.map((el) => el.outerHTML || "").join("\n");
    teardown();
    chrome.runtime.sendMessage({
      type: PICKED,
      data: {
        html,
        title: document.title || "",
        url: window.location.href,
        lang: document.documentElement?.lang || "",
        capturedAt: new Date().toISOString(),
        regionCount: sorted.length,
      },
    });
  }

  function onClick(event) {
    if (!currentFrame) return;
    if (event.target === doneBadge) return; // doneBadge has its own handler
    event.preventDefault();
    event.stopPropagation();
    const idx = pickedElements.indexOf(currentFrame);
    if (idx >= 0) {
      pickedElements.splice(idx, 1);
      const o = pickedOverlays.get(currentFrame);
      if (o) {
        o.remove();
        pickedOverlays.delete(currentFrame);
      }
    } else {
      pickedElements.push(currentFrame);
      pickedOverlays.set(currentFrame, makePickedOverlay(currentFrame));
    }
    updateDoneBadge();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      teardown();
      chrome.runtime.sendMessage({ type: CANCELLED });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      finalize();
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
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize, true);
  doneBadge.addEventListener("click", finalize);
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
