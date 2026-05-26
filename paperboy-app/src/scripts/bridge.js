import { initEditor } from "./editor.js";
import { createPreview } from "./preview.js";
import { initSettings } from "./settings.js";
import { initUiState } from "./theme.js";
import {
  convertImportedFile,
  OPEN_DIALOG_FILTERS,
  shouldKeepOriginalPath,
  shouldReadAsText,
} from "./vendor/converter.js";

const tauri = window.__TAURI__ || {};
const invoke = tauri.core?.invoke?.bind(tauri.core);
const currentWindow = tauri.window?.getCurrentWindow?.() || tauri.webviewWindow?.getCurrentWebviewWindow?.();
const listen = currentWindow?.listen?.bind(currentWindow) || tauri.event?.listen?.bind(tauri.event);
const ask = tauri.dialog?.ask?.bind(tauri.dialog);
const openDialog = tauri.dialog?.open?.bind(tauri.dialog);
const saveDialog = tauri.dialog?.save?.bind(tauri.dialog);

const FULL_PATH_KEY = "paperboy-show-full-path";

function loadShowFullPathPreference() {
  try {
    return localStorage.getItem(FULL_PATH_KEY) === "1";
  } catch {
    return false;
  }
}

function persistShowFullPathPreference(value) {
  try {
    localStorage.setItem(FULL_PATH_KEY, value ? "1" : "0");
  } catch {}
}

const VIEW_MODE_KEY = "paperboy-app-view-mode";

function loadViewModePreference() {
  try {
    const mode = localStorage.getItem(VIEW_MODE_KEY);
    return mode === "editor" || mode === "preview" || mode === "split" ? mode : "editor";
  } catch {
    return "editor";
  }
}

function persistViewModePreference(mode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {}
}

const initialViewMode = loadViewModePreference();
const contentAreaEl = document.querySelector(".content-area");
if (contentAreaEl) {
  contentAreaEl.dataset.viewMode = initialViewMode;
}

// Per-tab fields live in the tabs array and get snapshot/restored when switching.
// "state" always reflects the currently active tab.
// showFullPath is app-wide (all tabs, all windows) via localStorage + native menu sync.
const state = { currentFile: null, sourceFile: null, content: "", savedContent: "", isDirty: false, showFullPath: loadShowFullPathPreference(), viewMode: initialViewMode, theme: document.documentElement.dataset.theme || "system" };

let nextTabId = 1;
const tabs = [];
let activeTabId = null;

const tabBarEl = document.querySelector("[data-tab-bar]");
const filenameEl = document.querySelector("[data-filename]");
const editorEl = document.querySelector("[data-editor]");
const filepathEl = document.querySelector("[data-filepath]");
const pathFooterEl = document.querySelector("[data-path-footer]");
const previewEl = document.querySelector("[data-preview]");
let toastEl = null;
let toastTimer = null;
const editor = initEditor(editorEl, document.querySelector("[data-toolbar]"));
const preview = createPreview(previewEl);
let ignoredScrollSource = null;
let ignoredScrollTimer;

const previewLater = debounce(() => {
  renderPreview();
}, 150);
const refreshEditorLayout = debounce(() => {
  editor.invalidateScrollLayout();
  if (state.viewMode === "split") {
    syncPreviewToEditor();
  }
}, 120);
const ui = initUiState({
  onViewModeChange(mode) {
    state.viewMode = mode;
    persistViewModePreference(mode);
    editor.invalidateScrollLayout();
    if (mode !== "editor") {
      renderPreview();
      if (mode === "split") syncPreviewToEditor();
    }
  }
});

editor.onChange((content) => {
  state.content = content;
  state.isDirty = content !== state.savedContent;
  // Keep preview HTML in sync on every edit so Split/Preview show current text when you switch views.
  previewLater();
  updateTitle();
  renderTabBar();
});
editor.onScroll(() => syncFromEditor());
preview.onScroll(() => syncFromPreview());

const settings = initSettings({ invoke });

initFindOverlay({ editor, textarea: editorEl, ui, getViewMode: () => state.viewMode });

createTab();
setupMenuListeners();
setupWindowDrag();
checkInitialFile();
// Cold-launch "Open With"/double-click: RunEvent::Opened already fired and
// buffered the path Rust-side before this script ran. Drain it now.
void drainPendingOpens();
void setupFileDrop();
void syncNativeMenuShowFullPath();
window.addEventListener("storage", (event) => {
  if (event.key !== FULL_PATH_KEY || event.newValue === null) return;
  state.showFullPath = event.newValue === "1";
  updatePathFooter();
  void syncNativeMenuShowFullPath();
});
window.addEventListener("resize", refreshEditorLayout);
window.addEventListener("beforeunload", (event) => {
  snapshotActiveTab();
  if (!tabs.some(t => t.isDirty)) return;
  event.preventDefault();
});

// --------------- Tab management ---------------

function snapshotActiveTab() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  tab.currentFile = state.currentFile;
  tab.sourceFile = state.sourceFile;
  tab.content = editor.getContent();
  tab.savedContent = state.savedContent;
  tab.isDirty = state.isDirty;
  tab.scrollTop = editorEl.scrollTop;
}

function restoreTab(tab) {
  state.currentFile = tab.currentFile;
  state.sourceFile = tab.sourceFile;
  state.content = tab.content;
  state.savedContent = tab.savedContent;
  state.isDirty = tab.isDirty;
  editor.setContent(tab.content, { silent: true });
  editorEl.scrollTop = tab.scrollTop;
  renderPreview({ content: tab.content, resetScroll: false });
  syncPreviewToEditor();
  updateTitle();
  updatePathFooter();
}

function createTab() {
  snapshotActiveTab();
  const tab = {
    id: nextTabId++,
    currentFile: null,
    sourceFile: null,
    content: "",
    savedContent: "",
    isDirty: false,
    scrollTop: 0
  };
  tabs.push(tab);
  activeTabId = tab.id;
  restoreTab(tab);
  renderTabBar();
  return tab;
}

function switchToTab(id) {
  if (id === activeTabId) return;
  snapshotActiveTab();
  activeTabId = id;
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  restoreTab(tab);
  renderTabBar();
}

async function closeCurrentTab() {
  await closeTabWithCheck(activeTabId);
}

async function closeTabWithCheck(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  if (id !== activeTabId) switchToTab(id);

  const dirty = id === activeTabId ? state.isDirty : tab.isDirty;
  if (dirty) {
    const name = tabDisplayName(tab);
    const saveFirst = ask
      ? await ask(`"${name}" has unsaved changes. Save before closing?`, { title: "Unsaved Changes", kind: "warning", okLabel: "Save", cancelLabel: "Don't Save" })
      : window.confirm(`"${name}" has unsaved changes. Save before closing?`);
    if (saveFirst) {
      const saved = await saveCurrent();
      if (!saved) return;
    } else {
      const discard = ask
        ? await ask("Discard unsaved changes?", { title: "Discard Changes", kind: "warning", okLabel: "Discard", cancelLabel: "Cancel" })
        : window.confirm("Discard unsaved changes?");
      if (!discard) return;
    }
  }

  const idx = tabs.findIndex(t => t.id === id);
  tabs.splice(idx, 1);

  // Closing the last tab: do not call window.close() (often blocked from the webview).
  // Replace with a fresh empty document so "Close Tab" always works.
  if (tabs.length === 0) {
    const fresh = {
      id: nextTabId++,
      currentFile: null,
      sourceFile: null,
      content: "",
      savedContent: "",
      isDirty: false,
      scrollTop: 0
    };
    tabs.push(fresh);
    activeTabId = fresh.id;
    restoreTab(fresh);
    renderTabBar();
    ui.setViewMode("editor");
    return;
  }

  const nextIdx = Math.min(idx, tabs.length - 1);
  activeTabId = tabs[nextIdx].id;
  restoreTab(tabs[nextIdx]);
  renderTabBar();
}

function tabDisplayName(tab) {
  const isActive = tab.id === activeTabId;
  const fp = isActive ? (state.currentFile || state.sourceFile) : (tab.currentFile || tab.sourceFile);
  return fp ? fp.split(/[\\/]/).pop() : "Untitled";
}

function renderTabBar() {
  tabBarEl.innerHTML = "";
  if (tabs.length <= 1) {
    tabBarEl.hidden = true;
    return;
  }
  tabBarEl.hidden = false;
  tabs.forEach(tab => {
    const isActive = tab.id === activeTabId;
    const name = tabDisplayName(tab);
    const dirty = isActive ? state.isDirty : tab.isDirty;

    const el = document.createElement("div");
    el.className = `tab${isActive ? " active" : ""}`;

    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = name + (dirty ? " *" : "");
    el.appendChild(label);

    const close = document.createElement("button");
    close.className = "tab-close";
    close.setAttribute("aria-label", "Close tab");
    close.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    el.appendChild(close);

    el.addEventListener("click", (e) => {
      if (e.target.closest(".tab-close")) return;
      switchToTab(tab.id);
    });
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTabWithCheck(tab.id);
    });

    tabBarEl.appendChild(el);
  });
}

// --------------- Menu listeners ---------------

async function setupMenuListeners() {
  if (!listen) return;
  const map = {
    "menu-new": () => { createTab(); ui.setViewMode("editor"); },
    "menu-new-window": () => openNewWindow(),
    "menu-open": () => maybeProceed(() => openFile("current")),
    "menu-open-tab": () => openFile("tab"),
    "menu-open-window": () => openFile("window"),
    "menu-save": () => saveCurrent(),
    "menu-save-as": () => saveAsCurrent(),
    "menu-close": () => closeCurrentTab(),
    "menu-view-full-path": () => void toggleFullPath(),
    "menu-view-preview": () => ui.setViewMode("preview"),
    "menu-view-editor": () => ui.setViewMode("editor"),
    "menu-view-split": () => ui.setViewMode("split"),
    "menu-settings": () => settings.open(),
    "menu-open-recent": (event) => {
      const path = typeof event?.payload === "string" ? event.payload : null;
      if (!path) return;
      void maybeProceed(() => loadFileIntoCurrentTab(path));
    },
    // Emitted by Rust on RunEvent::Opened — macOS "Open With → Paperboy",
    // double-click in Finder, or drag onto the Dock icon. The actual paths
    // are buffered Rust-side (a cold launch fires this before listeners
    // exist, so the ping itself can be missed); we drain them here, and also
    // once at startup so the cold-launch case isn't lost.
    "pending-open": () => void drainPendingOpens(),
  };
  await Promise.all(Object.entries(map).map(([name, fn]) => listen(name, fn)));
}

// Pull any "Open With" file paths macOS buffered for us and load them. The
// Rust drain is atomic, so calling this from both the startup one-shot and
// the `pending-open` ping never double-loads a file. An empty current tab is
// reused; otherwise we spawn a tab so unsaved work isn't clobbered.
async function drainPendingOpens() {
  if (!invoke) return;
  let paths;
  try {
    paths = await invoke("take_pending_open_paths");
  } catch (e) {
    console.error("Failed to read pending open paths", e);
    return;
  }
  for (const path of paths || []) {
    if (typeof path !== "string" || !path) continue;
    if (state.currentFile || state.isDirty) createTab();
    await loadFileIntoCurrentTab(path);
  }
}

async function maybeProceed(action) {
  if (!state.isDirty) return action();
  const saveFirst = ask ? await ask("You have unsaved changes. Do you want to save before continuing?", { title: "Unsaved Changes", kind: "warning", okLabel: "Save", cancelLabel: "Don't Save" }) : window.confirm("Save your changes before continuing?");
  if (saveFirst) {
    const saved = await saveCurrent();
    if (!saved) return;
    return action();
  }
  const discard = ask ? await ask("Discard unsaved changes?", { title: "Unsaved Changes", kind: "warning", okLabel: "Discard", cancelLabel: "Cancel" }) : window.confirm("Discard unsaved changes?");
  if (discard) return action();
}

// --------------- File operations ---------------

async function openFile(mode = "current") {
  if (!invoke || !openDialog) return;
  const path = await openDialog({ filters: OPEN_DIALOG_FILTERS, multiple: false });
  if (!path || Array.isArray(path)) return;

  if (mode === "window") {
    await openNewWindow(path);
    return;
  }
  if (mode === "tab") {
    createTab();
  }
  await loadFileIntoCurrentTab(path);
}

async function loadFileIntoCurrentTab(path) {
  try {
    const fileName = path.split(/[\\/]/).pop() || path;
    const nativeMarkdown = shouldKeepOriginalPath(path);
    if (!nativeMarkdown) {
      showToast(`Importing and converting ${fileName}...`);
    }

    let result;
    let targetPath = null;

    if (shouldReadAsText(path)) {
      const textFile = await invoke("read_file", { path });
      if (!textFile) return;
      result = await convertImportedFile({ path: textFile.path, text: textFile.content, invoke });
      if (shouldKeepOriginalPath(textFile.path)) {
        targetPath = textFile.path;
      }
    } else {
      const binaryFile = await invoke("read_file_bytes", { path });
      if (!binaryFile) return;
      result = await convertImportedFile({ path: binaryFile.path, base64: binaryFile.base64, invoke });
    }

    setDocument(targetPath, result.markdown, false, nativeMarkdown ? null : path);
    if (result.warnings.length > 0) {
      showToast(
        `Converted with warnings: ${result.warnings.join("; ")}`,
        "info"
      );
    }
    ui.setViewMode("preview");
    showToast(
      nativeMarkdown
        ? `Opened ${fileName}`
        : `Imported and converted ${fileName}`,
      "success"
    );
    if (invoke) {
      try {
        await invoke("push_recent_file", { path });
      } catch (e) {
        console.warn("Failed to update recent files list", e);
      }
    }
  } catch (error) {
    console.error("Failed to import file", error);
    showToast("Paperboy could not import this file.", "error");
  }
}

async function openNewWindow(filePath = null) {
  if (!invoke) return;
  try {
    await invoke("create_window", { filePath: filePath || null });
  } catch (error) {
    console.error("Failed to create window", error);
    showToast("Could not open a new window.", "error");
  }
}

async function checkInitialFile() {
  const params = new URLSearchParams(window.location.search);
  const fileParam = params.get("file");
  if (fileParam) {
    try {
      await loadFileIntoCurrentTab(atob(fileParam));
    } catch (e) {
      console.error("Failed to open initial file", e);
    }
  }
}

// --------------- Save ---------------

async function saveCurrent() {
  if (!invoke) return false;
  const content = editor.getContent();
  if (!state.currentFile) return saveAsCurrent();
  await invoke("save_file", { path: state.currentFile, content });
  setDocument(state.currentFile, content, true);
  return true;
}

async function saveAsCurrent() {
  if (!invoke || !saveDialog) return false;
  const content = editor.getContent();
  let defaultName = "untitled.md";
  if (state.currentFile) {
    defaultName = state.currentFile;
  } else if (state.sourceFile) {
    defaultName = state.sourceFile.split(/[\\/]/).pop().replace(/\.[^.]+$/, "") + ".md";
  }
  const path = await saveDialog({
    defaultPath: defaultName,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }]
  });
  if (!path) return false;
  await invoke("save_file", { path, content });
  setDocument(path, content, true);
  return true;
}

// --------------- Document state ---------------

function setDocument(path, content, saved, sourceFile = null) {
  state.currentFile = path;
  state.sourceFile = sourceFile;
  state.content = content;
  state.savedContent = saved ? content : content;
  state.isDirty = false;
  editor.setContent(content, { silent: true });
  renderPreview({ content, resetScroll: true });
  syncPreviewToEditor();
  updatePathFooter();
  updateTitle();
  renderTabBar();
}

function updateTitle() {
  const displayPath = state.currentFile || state.sourceFile;
  const name = displayPath ? displayPath.split(/[\\/]/).pop() : "";
  const dirty = state.isDirty ? " *" : "";
  const title = name ? `${name}${dirty} — Paperboy` : `Paperboy${dirty}`;
  filenameEl.textContent = name;
  filenameEl.hidden = !name;
  document.title = title;
  currentWindow?.setTitle?.(title);
}

function updatePathFooter() {
  const displayPath = state.currentFile || state.sourceFile;
  filepathEl.textContent = displayPath || "";
  pathFooterEl.hidden = !state.showFullPath;
}

async function syncNativeMenuShowFullPath() {
  if (!invoke) return;
  try {
    await invoke("set_full_path_menu_checked", { checked: state.showFullPath });
  } catch {}
}

async function toggleFullPath() {
  state.showFullPath = !state.showFullPath;
  persistShowFullPathPreference(state.showFullPath);
  updatePathFooter();
  await syncNativeMenuShowFullPath();
}

// --------------- Scroll sync ---------------

function syncFromEditor() {
  if (state.viewMode !== "split" || ignoredScrollSource === "editor") return;
  lockScroll("preview", () => syncPreviewToEditor());
}

function syncFromPreview() {
  if (state.viewMode !== "split" || ignoredScrollSource === "preview") return;
  lockScroll("editor", () => editor.scrollToSourceLine(preview.getTopSourceLine(editor.getLineCount())));
}

function syncPreviewToEditor() {
  if (state.viewMode !== "split") return;
  preview.scrollToSourceLine(editor.getTopSourceLine(), editor.getLineCount());
}

function renderPreview({ content = editor.getContent(), resetScroll = false } = {}) {
  lockScroll("preview", () => {
    preview.render(content, {
      anchorLine: editor.getTopSourceLine(),
      totalLines: editor.getLineCount(),
      resetScroll
    });
  });
}

function lockScroll(source, action) {
  ignoredScrollSource = source;
  action();
  clearTimeout(ignoredScrollTimer);
  ignoredScrollTimer = setTimeout(() => {
    ignoredScrollSource = null;
  }, 90);
}

// --------------- Find / replace overlay --------------------------------

function initFindOverlay({ editor, textarea, ui, getViewMode }) {
  const overlay = document.querySelector("[data-find-overlay]");
  if (!overlay || !textarea) return;

  const findInput = overlay.querySelector("[data-find-input]");
  const replaceInput = overlay.querySelector("[data-replace-input]");
  const countEl = overlay.querySelector("[data-find-count]");
  const prevBtn = overlay.querySelector("[data-find-prev]");
  const nextBtn = overlay.querySelector("[data-find-next]");
  const caseBtn = overlay.querySelector("[data-find-case]");
  const closeBtn = overlay.querySelector("[data-find-close]");
  const replaceOneBtn = overlay.querySelector("[data-replace-one]");
  const replaceAllBtn = overlay.querySelector("[data-replace-all]");
  const actionButtons = [prevBtn, nextBtn, replaceOneBtn, replaceAllBtn];

  const findState = {
    open: false,
    everOpened: false,
    caseSensitive: false,
    query: "",
    matches: [],
    cursor: -1,
    savedSelection: null,
  };

  let debounceTimer;

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function enumerateMatches(value, query, caseSensitive) {
    if (!query) return [];
    const flags = caseSensitive ? "g" : "gi";
    const re = new RegExp(escapeRegex(query), flags);
    const matches = [];
    for (const match of value.matchAll(re)) {
      matches.push({ start: match.index, end: match.index + match[0].length });
    }
    return matches;
  }

  function scrollMatchIntoView(start) {
    const lineStart = textarea.value.lastIndexOf("\n", start - 1) + 1;
    const before = textarea.value.slice(0, lineStart);
    const lineNumber = before.split("\n").length - 1;
    const lineHeight = Number.parseInt(getComputedStyle(textarea).lineHeight, 10) || 20;
    textarea.scrollTop = Math.max(0, (lineNumber - 2) * lineHeight);
  }

  function updateActionButtons() {
    const disabled = findState.matches.length === 0;
    for (const button of actionButtons) {
      if (button) button.disabled = disabled;
    }
    const total = findState.matches.length;
    const current = findState.cursor >= 0 ? findState.cursor + 1 : 0;
    countEl.textContent = total === 0 ? "0 of 0" : `${current} of ${total}`;
    overlay.classList.toggle("is-empty", Boolean(findState.query) && total === 0);
  }

  function selectMatch(index) {
    if (index < 0 || index >= findState.matches.length) return;
    findState.cursor = index;
    const { start, end } = findState.matches[index];
    textarea.setSelectionRange(start, end);
    scrollMatchIntoView(start);
    updateActionButtons();
  }

  function recompute({ selectFirst = true } = {}) {
    findState.query = findInput.value;
    findState.caseSensitive = caseBtn?.getAttribute("aria-pressed") === "true";
    findState.matches = enumerateMatches(
      textarea.value,
      findState.query,
      findState.caseSensitive
    );
    if (findState.matches.length === 0) {
      findState.cursor = -1;
    } else if (selectFirst && (findState.cursor < 0 || findState.cursor >= findState.matches.length)) {
      selectMatch(0);
    } else if (findState.cursor >= 0) {
      selectMatch(findState.cursor);
    }
    updateActionButtons();
  }

  function nextMatch(backward = false) {
    if (findState.matches.length === 0) return;
    let index = findState.cursor + (backward ? -1 : 1);
    if (index < 0) index = findState.matches.length - 1;
    if (index >= findState.matches.length) index = 0;
    selectMatch(index);
  }

  function openOverlay() {
    if (getViewMode() === "preview") {
      ui.setViewMode("editor");
    }
    findState.savedSelection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
    const selected = textarea.value.slice(
      findState.savedSelection.start,
      findState.savedSelection.end
    );
    if (selected && !selected.includes("\n")) {
      findInput.value = selected;
    }
    findState.open = true;
    findState.everOpened = true;
    overlay.hidden = false;
    recompute({ selectFirst: true });
    findInput.focus();
    findInput.select();
  }

  function closeOverlay() {
    findState.open = false;
    overlay.hidden = true;
    if (findState.savedSelection) {
      const { start, end } = findState.savedSelection;
      textarea.setSelectionRange(start, end);
      findState.savedSelection = null;
    }
    editor.focus();
  }

  function replaceOne() {
    if (findState.cursor < 0 || findState.matches.length === 0) return;
    const { start, end } = findState.matches[findState.cursor];
    const replacement = replaceInput.value;
    textarea.value =
      textarea.value.slice(0, start) + replacement + textarea.value.slice(end);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    recompute({ selectFirst: false });
    if (findState.matches.length > 0) nextMatch(false);
  }

  function replaceAll() {
    const query = findInput.value;
    if (!query) return;
    const flags = findState.caseSensitive ? "g" : "gi";
    const re = new RegExp(escapeRegex(query), flags);
    const matches = textarea.value.match(re) || [];
    const count = matches.length;
    if (count === 0) return;
    textarea.value = textarea.value.replace(re, replaceInput.value);
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    showToast(`Replaced ${count} occurrence(s)`, "info");
    recompute({ selectFirst: true });
  }

  closeBtn?.addEventListener("click", closeOverlay);
  prevBtn?.addEventListener("click", () => nextMatch(true));
  nextBtn?.addEventListener("click", () => nextMatch(false));
  replaceOneBtn?.addEventListener("click", replaceOne);
  replaceAllBtn?.addEventListener("click", replaceAll);
  caseBtn?.addEventListener("click", () => {
    const pressed = caseBtn.getAttribute("aria-pressed") === "true";
    caseBtn.setAttribute("aria-pressed", pressed ? "false" : "true");
    findState.caseSensitive = !pressed;
    recompute({ selectFirst: true });
  });

  findInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => recompute({ selectFirst: true }), 50);
  });

  findInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeOverlay();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      nextMatch(event.shiftKey);
    }
  });

  replaceInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeOverlay();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      replaceAll();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      replaceOne();
    }
  });

  document.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "f" && !event.shiftKey) {
      event.preventDefault();
      openOverlay();
      return;
    }
    if (key !== "g") return;
    if (!findState.open && !findState.everOpened) return;
    if (!findInput.value) return;
    event.preventDefault();
    if (!findState.open) {
      overlay.hidden = false;
      findState.open = true;
    }
    recompute({ selectFirst: findState.cursor < 0 });
    nextMatch(event.shiftKey);
  });
}

// --------------- Window drag ---------------

async function setupFileDrop() {
  const dropRoot = document.body;
  const webview = tauri.webviewWindow?.getCurrentWebviewWindow?.() || currentWindow;
  if (!webview?.onDragDropEvent) return;

  await webview.onDragDropEvent(async ({ payload }) => {
    if (payload.type === "over" || payload.type === "enter") {
      dropRoot.classList.add("drag-over");
    } else if (payload.type === "leave" || payload.type === "cancel") {
      dropRoot.classList.remove("drag-over");
    } else if (payload.type === "drop") {
      dropRoot.classList.remove("drag-over");
      let isFirst = true;
      for (const path of payload.paths || []) {
        if (typeof path !== "string" || !path) continue;
        if (isFirst && state.isDirty) {
          isFirst = false;
          await maybeProceed(() => loadFileIntoCurrentTab(path));
          continue;
        }
        isFirst = false;
        if (state.currentFile || state.isDirty) createTab();
        await loadFileIntoCurrentTab(path);
      }
    }
  });
}

function setupWindowDrag() {
  const startDrag = async (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".header-controls")) return;
    if (event.target.closest(".tab, .tab-close")) return;
    if (event.target.closest("button, a, input, textarea, select, option")) return;
    if (!currentWindow?.startDragging) return;
    event.preventDefault();
    try {
      await currentWindow.startDragging();
    } catch {}
  };

  // Attach to the whole title strip so drags work on the filename and empty chrome.
  // (The old [data-window-drag] layer sat *under* the title text, so clicks never hit it.)
  const headerBar = document.querySelector(".header-bar");
  if (headerBar) {
    headerBar.addEventListener("pointerdown", startDrag);
  }

  document.querySelectorAll("[data-window-drag]").forEach((region) => {
    if (headerBar && region !== headerBar && region.closest(".header-bar")) return;
    region.addEventListener("pointerdown", startDrag);
  });
}

// --------------- Utils ---------------

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

function showToast(message, kind = "info") {
  if (!message) return;
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "app-toast";
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = message;
  toastEl.dataset.kind = kind;
  toastEl.classList.add("is-visible");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("is-visible");
  }, 2600);
}
