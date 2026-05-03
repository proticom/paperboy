import { createTurndownService } from "@proticom/paperboy-converter/turndown";
import markdownit from "markdown-it";

/* global PAPERBOY_CONVERTER_VERSION */ // banner in sidepanel.bundle.js from build.js
const CONVERTER_VERSION = PAPERBOY_CONVERTER_VERSION;

const MESSAGE_TYPES = {
  REQUEST_PAGE_DATA: "paperboy:request-page-data",
};

const dom = {
  refreshButton: document.getElementById("refresh-btn"),
  refreshButtonLabel: document.getElementById("refresh-btn-label"),
  copyButton: document.getElementById("copy-btn"),
  copyButtonLabel: document.getElementById("copy-btn-label"),
  output: document.getElementById("markdown-output"),
  preview: document.getElementById("preview-output"),
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
  isLoading: false,
  view: "source",
};

const turndownService = createTurndownService();
const md = markdownit({ html: false, linkify: true, typographer: true });

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
  dom.copyButton.disabled = isLoading || !state.markdown;
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

function parseHtmlToDocument(html, url) {
  const parser = new DOMParser();
  const documentClone = parser.parseFromString(html, "text/html");

  if (documentClone.head && url) {
    const base = documentClone.createElement("base");
    base.href = url;
    documentClone.head.prepend(base);
  }

  return documentClone;
}

function convertHtmlToMarkdown(payload) {
  const documentClone = parseHtmlToDocument(payload.html, payload.url);
  const reader = new Readability(documentClone, {
    charThreshold: 40,
    keepClasses: false,
    nbTopCandidates: 5,
  });
  const article = reader.parse();

  let contentHtml = article?.content ?? "";
  if (!contentHtml.trim()) {
    contentHtml = documentClone.body?.innerHTML ?? "";
  }

  if (!contentHtml.trim()) {
    throw new Error(
      "No readable content was found. Try another page or scroll the page first.",
    );
  }

  const markdownBody = turndownService.turndown(contentHtml).trim();
  const title = article?.title || payload.title || "Untitled page";

  const markdownLines = [`# ${title}`];

  if (payload.url) {
    markdownLines.push("", `Source: ${payload.url}`);
  }

  if (article?.byline) {
    markdownLines.push("", `Byline: ${article.byline}`);
  }

  markdownLines.push("", markdownBody || "_No markdown generated._");

  return {
    markdown: `${markdownLines.join("\n").trim()}\n`,
    title,
    length: article?.length ?? markdownBody.length,
  };
}

function renderMarkdown(markdownResult, capturedAt) {
  state.markdown = markdownResult.markdown;
  dom.output.textContent = markdownResult.markdown;
  dom.preview.innerHTML = md.render(markdownResult.markdown);
  dom.copyButton.disabled = false;

  const capturedTime = new Date(capturedAt).toLocaleTimeString();
  setStatus(
    `Extracted ${markdownResult.length.toLocaleString()} characters at ${capturedTime}.`,
    "success",
  );
}

function renderError(error) {
  state.markdown = "";
  dom.output.textContent = `Error: ${error.message}`;
  dom.preview.innerHTML = "";
  dom.copyButton.disabled = true;
  setStatus("Could not convert this page.", "error");
}

function setViewMode(view) {
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
  dom.preview.hidden = showSource;
}

async function extractCurrentPage() {
  setLoading(true);
  setStatus("Reading current tab...", "loading");

  try {
    const response = await requestPageData();
    if (!response?.ok || !response.data?.html) {
      throw new Error(response?.error || "No page content returned.");
    }

    const markdownResult = convertHtmlToMarkdown(response.data);
    renderMarkdown(markdownResult, response.data.capturedAt);
  } catch (error) {
    renderError(error instanceof Error ? error : new Error(String(error)));
  } finally {
    setLoading(false);
  }
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

dom.refreshButton.addEventListener("click", () => {
  extractCurrentPage();
});

dom.copyButton.addEventListener("click", () => {
  copyMarkdown();
});

dom.viewToggle.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view]");
  if (!button) return;
  setViewMode(button.dataset.view);
});

if (dom.converterVersionLine) {
  dom.converterVersionLine.textContent = `Converter ${CONVERTER_VERSION}`;
}

extractCurrentPage();
