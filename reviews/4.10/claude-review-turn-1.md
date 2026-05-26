# 4.10 - Review Turn 1

## Task Context
- Task id: 4.10
- Task title: Add Export submenu (HTML and PDF)
- Dashboard implementation status: in_progress (queue routed task to reviewer at turn 1; no build exists yet — see Finding 1)
- Review status: in_review → waiting_for_builder
- Spec section (plan line 99): "**4.10** Add Export submenu: Export → HTML (rendered preview), Export → PDF (uses the system print-to-PDF path via the WebView)."
- Files inspected:
  - `paperboy-app/src-tauri/src/main.rs` — File submenu builder at L309-322 (currently: New/New Window | Open/Open Tab/Open Window/Open Recent | Save/Save As | Close). `on_menu_event` map at L383-413. `invoke_handler` at L361-373 (already has `save_file` we can reuse for HTML).
  - `paperboy-app/src/scripts/bridge.js` — menu listener map at `setupMenuListeners` L296-330. `saveCurrent` at L451-458 and `saveAsCurrent` at L460-477 use `invoke("save_file", { path, content })` with `saveDialog`. `previewEl` at L73 + `preview` at L77. `showToast` helper at L854.
  - `paperboy-app/src/scripts/preview.js` — `createPreview` renders into `previewPane.innerHTML` via `md.render(markdown)` (markdown-it with html:false, plus footnote/deflist/mark/sub/sup/taskLists plugins). No `getHTML()` method exposed — preview pane innerHTML is the source.
  - `paperboy-app/src/index.html` — preview pane at L135: `<article class="preview-pane" data-preview>`.
  - `paperboy-app/src-tauri/capabilities/default.json` — has `dialog:default`, `store:default`, `window-state:default`. No print permission needed (web `window.print()` is browser-level, not a Tauri command).
- Commands run:
  - `grep -rn "menu-export\|Export.*HTML\|Export.*PDF\|exportToHtml\|exportToPdf\|export_html\|export_pdf" paperboy-app/` → 0 matches (confirms nothing built)
  - `git log --oneline -20` → no 4.10 commit; last commit is `ad2e6be` for 4.9 review_passed.
  - `jq '.tasks[] | select(.id == "4.10")' reviews/paperboy-review-queue.json` → `turn: 1, phase: review, review_status: in_review, artifacts.reply: null, artifacts.decision: null` (no builder reply exists).
- Current claim being verified: none. The queue auto-advanced 4.10 to `in_review` when 4.9 closed; cursor has not yet pushed a turn-1 build commit. Treating this as a turn-1 spec review and routing the work to the builder via the Builder Prompt.

## Findings

### Finding 1: Export submenu does not exist (entire feature missing)
- Severity: required
- Location: `paperboy-app/src-tauri/src/main.rs` (File submenu builder L309-322, `on_menu_event` L383-413, `invoke_handler` L361-373); `paperboy-app/src/scripts/bridge.js` (menu listener map L296-316). Nothing for Export in either file.
- Problem: The plan's deliverable for 4.10 is two new menu items — Export → HTML (rendered preview) and Export → PDF (system print-to-PDF via WebView). No code for either exists in the repo.
- Spec mismatch / risk: A user has no way to export the rendered document. Without HTML export, you can't share a styled artifact. Without PDF export, you can't produce a fixed-form deliverable.
- Required fix:
  1. Rust: add a `let export = SubmenuBuilder::new(app, "Export") ... .build()?;` with two items — `export_html` and `export_pdf` — and slot it into the File submenu (recommended position: after `Save As…` and the separator, before `Close Tab`; OR between Open Recent and the Save separator). Wire `on_menu_event` to emit `menu-export-html` / `menu-export-pdf`.
  2. JS: in `setupMenuListeners`, add entries that call new helpers `exportHtml()` and `exportPdf()`. `exportHtml()` builds a standalone HTML document by wrapping `previewEl.innerHTML` in `<!doctype html>…<style>…</style>…<body class="markdown-body">…</body>` (inline a tiny base stylesheet so the file is portable), opens `saveDialog` (default extension `.html`, default name derived from current file like `saveAsCurrent`), and writes via the existing `invoke("save_file", { path, content })`. `exportPdf()` calls `window.print()` — the macOS WebView's print sheet offers "Save as PDF" out of the box, satisfying the plan's "system print-to-PDF path via the WebView". Optionally precede the print call with a brief `ui.setViewMode("preview")` if not already preview-only (so the print captures the rendered HTML, not the textarea); the spec is "rendered preview", not "editor".
- Code sample / exact change:
```rust
// paperboy-app/src-tauri/src/main.rs — inside fn menu(...) before the file builder is finalized
let export = SubmenuBuilder::new(app, "Export")
  .item(&MenuItemBuilder::with_id("export_html", "HTML…").build(app)?)
  .item(&MenuItemBuilder::with_id("export_pdf", "PDF…").build(app)?)
  .build()?;

// Insert into the File submenu. Recommended position: after Save As… and a separator, before Close Tab.
let file = SubmenuBuilder::new(app, "File")
  .item(&MenuItemBuilder::with_id("new", "New Tab").accelerator("CmdOrCtrl+N").build(app)?)
  .item(&MenuItemBuilder::with_id("new_window", "New Window").accelerator("CmdOrCtrl+Shift+N").build(app)?)
  .separator()
  .item(&MenuItemBuilder::with_id("open", "Open…").accelerator("CmdOrCtrl+O").build(app)?)
  .item(&MenuItemBuilder::with_id("open_tab", "Open in New Tab…").build(app)?)
  .item(&MenuItemBuilder::with_id("open_window", "Open in New Window…").build(app)?)
  .item(&open_recent)
  .separator()
  .item(&MenuItemBuilder::with_id("save", "Save").accelerator("CmdOrCtrl+S").build(app)?)
  .item(&MenuItemBuilder::with_id("save_as", "Save As…").accelerator("CmdOrCtrl+Shift+S").build(app)?)
  .separator()
  .item(&export)
  .separator()
  .item(&MenuItemBuilder::with_id("close", "Close Tab").accelerator("CmdOrCtrl+W").build(app)?)
  .build()?;

// on_menu_event additions
"export_html" => emit(app, "menu-export-html"),
"export_pdf"  => emit(app, "menu-export-pdf"),
```
```js
// paperboy-app/src/scripts/bridge.js — inside setupMenuListeners map
"menu-export-html": () => void exportHtml(),
"menu-export-pdf":  () => void exportPdf(),

// new helpers
async function exportHtml() {
  if (!invoke || !saveDialog) return false;
  const bodyHtml = previewEl.innerHTML;
  const title = state.currentFile
    ? state.currentFile.split(/[\\/]/).pop().replace(/\.[^.]+$/, "")
    : (state.sourceFile
        ? state.sourceFile.split(/[\\/]/).pop().replace(/\.[^.]+$/, "")
        : "untitled");
  const html = buildStandaloneHtml(title, bodyHtml);
  const path = await saveDialog({
    defaultPath: `${title}.html`,
    filters: [{ name: "HTML", extensions: ["html", "htm"] }],
  });
  if (!path) return false;
  await invoke("save_file", { path, content: html });
  showToast(`Exported HTML to ${path}`, "info");
  return true;
}

async function exportPdf() {
  // The macOS WebView's print sheet includes "Save as PDF" — this is the
  // "system print-to-PDF path via the WebView" the spec calls for.
  const previous = state.viewMode;
  if (previous !== "preview") ui.setViewMode("preview");
  // Allow the layout to settle before printing.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.print();
  if (previous !== "preview") ui.setViewMode(previous);
  return true;
}

function buildStandaloneHtml(title, bodyHtml) {
  const escape = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const css = `
    :root { color-scheme: light; }
    body { font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; background: #fff; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.5em 0 0.5em; }
    pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { background: #f5f5f5; padding: 1em; overflow: auto; border-radius: 6px; }
    code { background: #f0f0f0; padding: 0.1em 0.3em; border-radius: 3px; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding: 0 1em; color: #555; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 0.4em 0.7em; }
    img { max-width: 100%; }
    a { color: #0366d6; }
  `;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${css}</style>
</head>
<body class="markdown-body">
${bodyHtml}
</body>
</html>`;
}
```
- Validation:
```text
grep -n "Export\|export_html\|export_pdf\|menu-export" paperboy-app/src-tauri/src/main.rs   # MUST show submenu builder + emit hooks
grep -n "menu-export-html\|menu-export-pdf\|exportHtml\|exportPdf" paperboy-app/src/scripts/bridge.js  # MUST show listener + helpers
( cd paperboy-app/src-tauri && cargo check )    # exit 0
npm run build:converter -w paperboy-app         # exit 0
npm run build --workspaces --if-present         # exit 0
npm test --workspaces --if-present              # exit 0 (31 tests still pass)
node --check paperboy-app/src/scripts/bridge.js # exit 0
```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 4.10.

Objective: Add an Export submenu to the File menu with two items — Export → HTML (writes a standalone .html file built from the rendered preview pane) and Export → PDF (invokes the WebView's print sheet, which on macOS includes "Save as PDF"). No new Tauri commands are required: HTML export reuses the existing `save_file` invoke; PDF export uses the browser-level `window.print()` (no Rust changes for PDF beyond the menu wiring).

Files to edit:
- `paperboy-app/src-tauri/src/main.rs`:
  - In `fn menu(...)` (around L288-350), add an `Export` `SubmenuBuilder` with two items: id `export_html` label `HTML…` and id `export_pdf` label `PDF…`. Slot it into the existing `file` `SubmenuBuilder` between the `save_as` line and the `close` separator (i.e. add `.separator()` then `.item(&export)` then a `.separator()` before the Close Tab item).
  - In `on_menu_event` (L383-413), add two new arms emitting events: `"export_html" => emit(app, "menu-export-html"),` and `"export_pdf" => emit(app, "menu-export-pdf"),`.
- `paperboy-app/src/scripts/bridge.js`:
  - In `setupMenuListeners` (L296-330), add `"menu-export-html": () => void exportHtml(),` and `"menu-export-pdf": () => void exportPdf(),` to the map.
  - Add two new module-level (or near-Save) helpers: `exportHtml()` and `exportPdf()`. `exportHtml()` reads `previewEl.innerHTML`, builds a standalone HTML document (inline `<style>` block — see code sample in Finding 1 above), opens `saveDialog` with `.html`/`.htm` filters and a default name derived from `state.currentFile` (fall back to `state.sourceFile` basename, then "untitled"), and writes via `invoke("save_file", { path, content })`. On success, call `showToast(\`Exported HTML to ${path}\`, "info")`. `exportPdf()` flips to preview view mode if it is not already (`ui.setViewMode("preview")`), waits two animation frames so layout settles, then calls `window.print()`. Restore the prior view mode after the print call. The macOS print sheet's "Save as PDF" satisfies the spec's "system print-to-PDF path via the WebView".

Files NOT to edit:
- `paperboy-app/src/scripts/preview.js` (no API changes — just read its `innerHTML` from `previewEl`)
- `paperboy-app/src-tauri/Cargo.toml`, capabilities file, any other workspace.

Exact changes: see the Rust + JS code blocks in Finding 1.

Tests to add or update: none. The desktop frontend has no JS test harness; this is verified by syntax checks, `cargo check`, workspace builds, and a documented manual smoke pass.

Commands to run (capture exit codes in your reply):
```text
node --check paperboy-app/src/scripts/bridge.js                                         # exit 0
( cd paperboy-app/src-tauri && cargo check )                                            # exit 0
grep -n "Export\|export_html\|export_pdf\|menu-export" paperboy-app/src-tauri/src/main.rs  # shows submenu + 2 emit arms
grep -n "menu-export-html\|menu-export-pdf\|exportHtml\|exportPdf" paperboy-app/src/scripts/bridge.js  # listener entries + 2 helpers
npm run build:converter -w paperboy-app                                                 # exit 0
npm run build --workspaces --if-present                                                 # exit 0
npm test --workspaces --if-present                                                      # exit 0 (31 tests, 5+1 files)
```

Manual smoke (record results in your turn-1 reply):
```text
1. Open the built .app, load a sample markdown file. File menu → Export submenu shows HTML… and PDF….
2. File → Export → HTML… → save dialog appears with default name <basename>.html → save → toast shows path. Open the file in a browser: title matches, headings/code/lists render with the inline style.
3. File → Export → PDF… → app flips to preview view (if not already) → macOS print sheet opens → "PDF ▾" lower-left → "Save as PDF" → file saves; close print sheet returns app to prior view mode.
4. Repeat (2) with a doc that has no current file (typed content only); default name is "untitled.html".
```

Definition of done (turn 1):
- Export submenu visible in File menu with HTML… and PDF… items.
- HTML export writes a standalone `.html` file whose body equals the preview pane's rendered HTML, wrapped in a small portable stylesheet; uses `save_file` invoke + `saveDialog`.
- PDF export opens the WebView's print sheet; user can save as PDF via the system path.
- `cargo check` passes; all workspace builds pass; all 31 tests still pass; `node --check bridge.js` passes.
- Prior view mode is restored after PDF export.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Submenu position: I recommend "between Save As… and Close Tab (with separators)", but it could also live as a top-level "Export" submenu next to File/View/Edit. The plan calls it an "Export submenu" — singular — which strongly implies a child of File. Going with File > Export.
- Default name for HTML export when there is no current file: I chose "untitled.html". Open to "export.html" or last-saved basename if preferred.

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
4.10 turn 1: Export submenu (HTML+PDF) not yet implemented. Send to builder with full spec — Rust adds Export submenu under File with `export_html`/`export_pdf` items emitting `menu-export-html`/`menu-export-pdf`. JS adds matching listeners: HTML export wraps `previewEl.innerHTML` in a standalone HTML doc + `saveDialog` + existing `save_file` invoke; PDF export flips to preview view and calls `window.print()` (macOS WebView's "Save as PDF" satisfies the "system print-to-PDF via the WebView" spec). No Tauri command additions, no Cargo deps, no capability changes.
