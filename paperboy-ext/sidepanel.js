import { convertHtmlToMarkdown, parseHtmlToDocument } from "./lib/convert.mjs";
import markdownit from "markdown-it";
import { cleanOcrText, collectParagraphsFromTesseractBlocks } from "@proticom/paperboy-converter/ocr-text";
import { createPreviewController } from "./lib/preview.mjs";

/* global PAPERBOY_CONVERTER_VERSION */ // banner in sidepanel.bundle.js from build.js
const CONVERTER_VERSION = PAPERBOY_CONVERTER_VERSION;

const MESSAGE_TYPES = {
  REQUEST_PAGE_DATA: "paperboy:request-page-data",
  START_PICKER: "paperboy:start-picker",
  REGION_PICKED: "paperboy:region-picked",
  PICKER_CANCELLED: "paperboy:picker-cancelled",
};

const dom = {
  refreshButton: document.getElementById("refresh-btn"),
  refreshButtonLabel: document.getElementById("refresh-btn-label"),
  copyButton: document.getElementById("copy-btn"),
  copyButtonLabel: document.getElementById("copy-btn-label"),
  copyMenuToggle: document.getElementById("copy-btn-menu-toggle"),
  copyMenu: document.getElementById("copy-btn-menu"),
  pickButton: document.getElementById("pick-btn"),
  pickButtonLabel: document.getElementById("pick-btn-label"),
  ocrButton: document.getElementById("ocr-btn"),
  ocrButtonLabel: document.getElementById("ocr-btn-label"),
  output: document.getElementById("markdown-output"),
  preview: document.getElementById("preview-output"),
  loadImagesButton: document.getElementById("load-images-btn"),
  metaText: document.getElementById("meta-text"),
  converterVersionLine: document.getElementById("converter-version-line"),
  viewToggle: document.getElementById("view-toggle"),
};

const copyIconMarkup = `
  <svg class="copy-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
`;

const checkIconMarkup = `
  <svg class="copy-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
`;

const state = {
  markdown: "",
  title: "",
  isLoading: false,
  view: "source",
  ocrEnabled: false,
  lastPayload: null,
};

const PREFS_KEY = "paperboy:prefs";

async function loadPrefs() {
  try {
    const result = await chrome.storage.local.get(PREFS_KEY);
    return result?.[PREFS_KEY] || {};
  } catch {
    return {};
  }
}

function savePrefs(updates) {
  chrome.storage.local.get(PREFS_KEY).then((result) => {
    const current = result?.[PREFS_KEY] || {};
    chrome.storage.local
      .set({ [PREFS_KEY]: { ...current, ...updates } })
      .catch(() => {});
  }, () => {});
}

let tesseractWorkerPromise = null;

async function getTesseractWorker() {
  if (!tesseractWorkerPromise) {
    if (typeof Tesseract === "undefined") {
      throw new Error(
        "Tesseract.js not loaded. lib/tesseract/tesseract.min.js missing?",
      );
    }
    tesseractWorkerPromise = Tesseract.createWorker("eng", 1, {
      workerPath: chrome.runtime.getURL("lib/tesseract/worker.min.js"),
      // Core (the WASM glue .js + .wasm binary) must be local: tesseract
      // loads the glue via importScripts() inside the worker, and MV3 CSP
      // pins script-src to 'self', so a CDN URL gets blocked.
      corePath: chrome.runtime.getURL("lib/tesseract/"),
      // Bundled English data keeps OCR offline, including its first run.
      langPath: chrome.runtime.getURL("lib/tesseract/lang"),
      gzip: true,
      cacheMethod: "none",
      // See workerBlobURL comment in tesseract docs: default true wraps
      // workerPath in a blob URL which can't importScripts back to our
      // extension origin under MV3 CSP. False keeps the direct extension URL.
      workerBlobURL: false,
    });
  }
  return tesseractWorkerPromise;
}

async function fetchImageBytes(src) {
  if (!src) return null;
  let url = src;
  if (src.startsWith("//")) url = `https:${src}`;
  if (url.startsWith("data:")) {
    const response = await fetch(url);
    return response.blob();
  }
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.blob();
}

function escapeBlockquote(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

const md = markdownit({ html: false, linkify: true, typographer: true });
const preview = createPreviewController({
  container: dom.preview,
  loadButton: dom.loadImagesButton,
  md,
  fetch: (url, options) => fetch(url, options),
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
});

function setStatus(text, status = "idle") {
  dom.metaText.textContent = text;
  dom.metaText.dataset.state = status;
}

function setCopyButtonIcon(iconMarkup) {
  const previousIcon = dom.copyButton.querySelector(".copy-icon");
  if (previousIcon) {
    previousIcon.remove();
  }
  dom.copyButton.insertAdjacentHTML("afterbegin", iconMarkup);
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  dom.refreshButton.disabled = isLoading;
  dom.pickButton.disabled = isLoading;
  dom.ocrButton.disabled = isLoading;
  const noOutput = isLoading || !state.markdown;
  dom.copyButton.disabled = noOutput;
  dom.copyMenuToggle.disabled = noOutput;
  dom.refreshButtonLabel.textContent = isLoading ? "Reading..." : "Re-extract";
}

function requestPageData() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: MESSAGE_TYPES.REQUEST_PAGE_DATA },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      },
    );
  });
}

function renderMarkdown(markdownResult, capturedAt) {
  state.markdown = markdownResult.markdown;
  state.title = markdownResult.title || "";
  dom.output.textContent = markdownResult.markdown;
  preview.setMarkdown(markdownResult.markdown);
  dom.copyButton.disabled = false;
  dom.copyMenuToggle.disabled = false;

  const capturedTime = new Date(capturedAt).toLocaleTimeString();
  setStatus(
    `Extracted ${markdownResult.length.toLocaleString()} characters at ${capturedTime}.`,
    "success",
  );
}

// Collect every <img> in the source HTML, OCR it via tesseract, then splice a
// blockquote of the OCR text under the image's markdown line. Sequential to
// reuse one worker; updates the meta line per image.
async function annotateMarkdownWithOcr(markdown, payload) {
  const documentClone = parseHtmlToDocument(payload.html, payload.url);
  const images = [...documentClone.querySelectorAll("img")];
  if (!images.length) {
    return { markdown, count: 0 };
  }

  const worker = await getTesseractWorker();
  let annotated = markdown;
  let count = 0;

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const src = img.getAttribute("src") || img.currentSrc;
    if (!src) continue;
    const alt = (img.getAttribute("alt") || "").replace(/\n/g, " ").trim();

    setStatus(`OCR ${i + 1}/${images.length}: ${src.slice(0, 60)}…`, "loading");
    try {
      const blob = await fetchImageBytes(src);
      if (!blob) continue;
      const { data } = await worker.recognize(blob, {}, { text: true, blocks: true });
      const { text, hasText } = cleanOcrText({
        text: data?.text ?? "",
        words: [],
        paragraphs: collectParagraphsFromTesseractBlocks(data?.blocks),
      });
      if (!hasText) continue;

      // Find the image's markdown line in the output. turndown emits ![alt](src)
      // or sometimes just the src as a fallback. Prefer alt+src match.
      const block = `\n\n${escapeBlockquote(`OCR: ${text}`)}\n`;
      const escAlt = alt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escSrcTail = src.split("/").pop()?.split("?")[0] || "";
      const escTail = escSrcTail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const candidates = [
        new RegExp(`!\\[${escAlt}\\]\\([^)]*${escTail}[^)]*\\)`, "i"),
        new RegExp(`!\\[[^\\]]*\\]\\([^)]*${escTail}[^)]*\\)`, "i"),
      ];
      let matched = false;
      for (const re of candidates) {
        if (re.test(annotated)) {
          annotated = annotated.replace(re, (m) => `${m}${block}`);
          matched = true;
          count += 1;
          break;
        }
      }
      // If turndown dropped the image, append OCR at the end of the document
      // so the text isn't lost.
      if (!matched) {
        annotated += block;
        count += 1;
      }
    } catch (err) {
      console.warn("OCR failed for", src, err);
    }
  }

  return { markdown: annotated, count };
}

function renderError(error) {
  state.markdown = "";
  state.title = "";
  dom.output.textContent = `Error: ${error.message}`;
  preview.reset();
  dom.copyButton.disabled = true;
  dom.copyMenuToggle.disabled = true;
  setStatus("Could not convert this page.", "error");
}

function setViewMode(view, { persist = true } = {}) {
  if (view !== "source" && view !== "preview") return;
  state.view = view;

  const buttons = dom.viewToggle.querySelectorAll("button[data-view]");
  let activeIndex = 0;
  buttons.forEach((button, index) => {
    const isActive = button.dataset.view === view;
    button.classList.toggle("active", isActive);
    if (isActive) activeIndex = index;
  });
  dom.viewToggle.style.setProperty("--active-index", String(activeIndex));

  const showSource = view === "source";
  dom.output.hidden = !showSource;
  if (showSource) preview.hide();
  else preview.show();

  if (persist) savePrefs({ view });
}

async function extractCurrentPage() {
  setLoading(true);
  setStatus("Reading current tab...", "loading");

  try {
    const response = await requestPageData();
    if (!response?.ok || !response.data?.html) {
      throw new Error(response?.error || "No page content returned.");
    }

    state.lastPayload = response.data;
    const markdownResult = convertHtmlToMarkdown(response.data);
    renderMarkdown(markdownResult, response.data.capturedAt);

    if (state.ocrEnabled) {
      const { markdown: annotated, count } = await annotateMarkdownWithOcr(
        markdownResult.markdown,
        response.data,
      );
      if (count > 0) {
        renderMarkdown(
          { ...markdownResult, markdown: annotated, length: annotated.length },
          response.data.capturedAt,
        );
        setStatus(`Extracted with OCR for ${count} image(s).`, "success");
      }
    }
  } catch (error) {
    renderError(error instanceof Error ? error : new Error(String(error)));
  } finally {
    setLoading(false);
  }
}

function setOcrEnabled(enabled, { persist = true } = {}) {
  state.ocrEnabled = enabled;
  dom.ocrButton.classList.toggle("active", enabled);
  dom.ocrButton.setAttribute("aria-pressed", enabled ? "true" : "false");
  if (persist) savePrefs({ ocrEnabled: enabled });
}

function startRegionPicker() {
  if (state.isLoading) return;
  setStatus(
    "Switch to the page tab. Hover a region, click to pick. Tab expands, Esc cancels.",
    "loading",
  );
  chrome.runtime.sendMessage(
    { type: MESSAGE_TYPES.START_PICKER },
    (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        const error =
          chrome.runtime.lastError?.message ||
          response?.error ||
          "Could not start the region picker.";
        setStatus(error, "error");
      }
    },
  );
}

async function copyMarkdown() {
  if (!state.markdown) {
    return;
  }

  try {
    await navigator.clipboard.writeText(state.markdown);
    dom.copyButtonLabel.textContent = "Copied";
    setCopyButtonIcon(checkIconMarkup);
    setStatus("Markdown copied to clipboard.", "success");

    setTimeout(() => {
      dom.copyButtonLabel.textContent = "Copy";
      setCopyButtonIcon(copyIconMarkup);
    }, 2000);
  } catch (error) {
    setStatus("Clipboard access failed. Copy manually.", "error");
  }
}

function slugifyForFilename(text) {
  const base = (text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "paperboy";
}

function downloadMarkdown() {
  if (!state.markdown) {
    return;
  }

  const filename = `${slugifyForFilename(state.title)}.md`;
  const blob = new Blob([state.markdown], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the browser has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  setStatus(`Downloaded ${filename}.`, "success");
}

function setCopyMenuOpen(open) {
  dom.copyMenu.hidden = !open;
  dom.copyMenuToggle.setAttribute("aria-expanded", open ? "true" : "false");
}

dom.refreshButton.addEventListener("click", () => {
  extractCurrentPage();
});

dom.copyButton.addEventListener("click", () => {
  copyMarkdown();
});

dom.copyMenuToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  setCopyMenuOpen(dom.copyMenu.hidden);
});

dom.copyMenu.addEventListener("click", (event) => {
  const item = event.target.closest("button[data-action]");
  if (!item) return;
  setCopyMenuOpen(false);
  if (item.dataset.action === "copy") {
    copyMarkdown();
  } else if (item.dataset.action === "download") {
    downloadMarkdown();
  }
});

document.addEventListener("click", (event) => {
  if (dom.copyMenu.hidden) return;
  if (
    event.target === dom.copyMenuToggle ||
    dom.copyMenu.contains(event.target)
  ) {
    return;
  }
  setCopyMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !dom.copyMenu.hidden) {
    setCopyMenuOpen(false);
    dom.copyMenuToggle.focus();
  }
});

dom.pickButton.addEventListener("click", () => {
  startRegionPicker();
});

dom.ocrButton.addEventListener("click", () => {
  setOcrEnabled(!state.ocrEnabled);
  if (state.ocrEnabled && state.lastPayload) {
    // Run OCR against the most recent extraction without re-fetching the page.
    (async () => {
      setLoading(true);
      try {
        const markdownResult = convertHtmlToMarkdown(state.lastPayload);
        const { markdown: annotated, count } = await annotateMarkdownWithOcr(
          markdownResult.markdown,
          state.lastPayload,
        );
        if (count > 0) {
          renderMarkdown(
            { ...markdownResult, markdown: annotated, length: annotated.length },
            state.lastPayload.capturedAt,
          );
          setStatus(`Annotated ${count} image(s) with OCR.`, "success");
        } else {
          setStatus("No images found to OCR on this page.", "idle");
        }
      } catch (err) {
        renderError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    })();
  }
});

dom.viewToggle.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view]");
  if (!button) return;
  setViewMode(button.dataset.view);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MESSAGE_TYPES.REGION_PICKED && message.data?.html) {
    const pickerPayload = { ...message.data, fromPicker: true };
    state.lastPayload = pickerPayload;
    setLoading(true);
    setStatus("Converting selected region...", "loading");
    (async () => {
      try {
        const markdownResult = convertHtmlToMarkdown(pickerPayload);
        renderMarkdown(markdownResult, message.data.capturedAt);

        if (state.ocrEnabled) {
          const { markdown: annotated, count } = await annotateMarkdownWithOcr(
            markdownResult.markdown,
            pickerPayload,
          );
          if (count > 0) {
            renderMarkdown(
              { ...markdownResult, markdown: annotated, length: annotated.length },
              message.data.capturedAt,
            );
            setStatus(
              `Picked region with OCR for ${count} image(s).`,
              "success",
            );
          }
        }
      } catch (error) {
        renderError(
          error instanceof Error ? error : new Error(String(error)),
        );
      } finally {
        setLoading(false);
      }
    })();
    return;
  }
  if (message?.type === MESSAGE_TYPES.PICKER_CANCELLED) {
    setStatus("Region picker cancelled.", "idle");
    return;
  }
});

if (dom.converterVersionLine) {
  dom.converterVersionLine.textContent = `Converter ${CONVERTER_VERSION}`;
}

// Apply persisted user prefs before the first extract so they don't see a
// flash of defaults.
loadPrefs().then((prefs) => {
  if (prefs.view === "preview") setViewMode("preview", { persist: false });
  if (prefs.ocrEnabled === true) setOcrEnabled(true, { persist: false });
  extractCurrentPage();
});
