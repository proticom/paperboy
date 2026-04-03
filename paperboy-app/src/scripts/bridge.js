import { initEditor } from "./editor.js";
import { createPreview } from "./preview.js";
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

// Per-tab fields live in the tabs array and get snapshot/restored when switching.
// "state" always reflects the currently active tab.
// showFullPath is app-wide (all tabs, all windows) via localStorage + native menu sync.
const state = { currentFile: null, sourceFile: null, content: "", savedContent: "", isDirty: false, showFullPath: loadShowFullPathPreference(), viewMode: "editor", theme: document.documentElement.dataset.theme || "system" };

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

createTab();
setupMenuListeners();
setupWindowDrag();
checkInitialFile();
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
    "menu-view-split": () => ui.setViewMode("split")
  };
  await Promise.all(Object.entries(map).map(([name, fn]) => listen(name, fn)));
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
      result = await convertImportedFile({ path: textFile.path, text: textFile.content });
      if (shouldKeepOriginalPath(textFile.path)) {
        targetPath = textFile.path;
      }
    } else {
      const binaryFile = await invoke("read_file_bytes", { path });
      if (!binaryFile) return;
      result = await convertImportedFile({ path: binaryFile.path, base64: binaryFile.base64 });
    }

    setDocument(targetPath, result.markdown, false, nativeMarkdown ? null : path);
    if (result.warnings.length > 0) {
      window.alert(`Converted with warnings:\n\n${result.warnings.map((warning) => `- ${warning}`).join("\n")}`);
    }
    ui.setViewMode("preview");
    showToast(
      nativeMarkdown
        ? `Opened ${fileName}`
        : `Imported and converted ${fileName}`,
      "success"
    );
  } catch (error) {
    console.error("Failed to import file", error);
    showToast("Paperboy could not import this file.", "error");
    window.alert("Paperboy could not import this file.");
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

// --------------- Window drag ---------------

function setupWindowDrag() {
  if (!currentWindow?.startDragging) return;

  const startDrag = async (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".header-controls")) return;
    if (event.target.closest("button, a, input, textarea, select, option")) return;
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
