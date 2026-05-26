# 4.10 - Review Turn 2

## Task Context
- Task id: 4.10
- Task title: Add Export submenu (HTML and PDF)
- Dashboard implementation status: done
- Review status: waiting_for_reviewer → review_passed
- Spec section (plan line 99): "**4.10** Add Export submenu: Export → HTML (rendered preview), Export → PDF (uses the system print-to-PDF path via the WebView)."
- Files inspected (re-verifying every turn-1 finding is fixed):
  - `paperboy-app/src-tauri/src/main.rs` L309-312 (Export submenu builder), L325 (insertion into File submenu between Save As… and Close Tab, with separators on both sides), L397-398 (`on_menu_event` arms emitting `menu-export-html` / `menu-export-pdf`).
  - `paperboy-app/src/scripts/bridge.js` L306-307 (`setupMenuListeners` map entries for `menu-export-html` / `menu-export-pdf`), L481-489 (`exportBaseName()` helper — current file → source file → "untitled"), L491-520 (`buildStandaloneHtml(title, bodyHtml)` — `<!doctype>` + inline CSS + `<body class="markdown-body">`), L522-535 (`exportHtml()` — refreshes preview, builds doc, opens saveDialog with `.html`/`.htm` filter, writes via existing `save_file` invoke, info toast), L537-547 (`exportPdf()` — flips to preview if needed, two RAF settle, `window.print()`, restores prior view mode).
  - `reviews/4.10/cursor-reply-turn-1.md` — builder's reply, matches the on-disk diff.
- Commands run:
  - `git status` / `git diff --stat HEAD` → 4 files modified: `paperboy-app/src-tauri/src/main.rs` (+8 lines), `paperboy-app/src/scripts/bridge.js` (+70 lines), `paperboy-spec-tasks.json` (+8/-8), `reviews/paperboy-review-queue.json` (+22/-22). Builder's working tree only; no spurious unrelated edits.
  - `grep -n "Export\|export_html\|export_pdf\|menu-export" paperboy-app/src-tauri/src/main.rs` → 5 hits (submenu builder L309-311 + 2 emit arms L397-398). ✅
  - `grep -n "menu-export-html\|menu-export-pdf\|exportHtml\|exportPdf\|exportBaseName" paperboy-app/src/scripts/bridge.js` → 7 hits (2 listener entries + helper definitions). ✅
  - `node --check paperboy-app/src/scripts/bridge.js` → exit 0. ✅
  - `( cd paperboy-app/src-tauri && CARGO_TARGET_DIR=~/.cache/paperboy-cargo-target cargo check )` → "Finished `dev` profile … 24.51s", exit 0. ✅
  - `npm run build:converter -w paperboy-app` → "Bundled converter -> src/scripts/vendor/converter.js", exit 0. ✅
  - `npm run build --workspaces --if-present` → cli (tsc), ext (sidepanel.bundle.js 293.4kb), widget (paperboy-widget.min.js 35.7kb), all exit 0. ✅
  - `npm test --workspaces --if-present` → cli 19 passed, widget 12 passed = 31 total. ✅
- Current claim being verified: cursor's turn-1 build (uncommitted in working tree) implementing the Export submenu spec from claude-review-turn-1.md.

## Findings

### Finding 1: Export submenu does not exist (entire feature missing) — FIXED ✅
- Severity: required (turn 1) → resolved (turn 2)
- Location: `paperboy-app/src-tauri/src/main.rs` L309-312 + L325 + L397-398; `paperboy-app/src/scripts/bridge.js` L306-307 + L481-547.
- Re-verification:
  - **Rust**: `let export = SubmenuBuilder::new(app, "Export").item(&MenuItemBuilder::with_id("export_html", "HTML…").build(app)?).item(&MenuItemBuilder::with_id("export_pdf", "PDF…").build(app)?).build()?;` — matches the spec exactly. Inserted at the recommended position (between Save As… separator and Close Tab separator) at L325. `on_menu_event` adds `"export_html" => emit(app, "menu-export-html"),` and `"export_pdf" => emit(app, "menu-export-pdf"),` at L397-398. No Cargo deps added; no capabilities changes.
  - **JS listeners**: `"menu-export-html": () => void exportHtml(),` and `"menu-export-pdf": () => void exportPdf(),` at L306-307 — matches the spec.
  - **`exportHtml()`** at L522-535: calls `renderPreview({ content: state.content, resetScroll: false })` first to ensure the preview pane reflects the current editor content (this is an *improvement* over my turn-1 spec — guarantees the HTML export captures the latest, not whatever happened to be in the DOM). Then `buildStandaloneHtml(title, previewEl.innerHTML)`, `saveDialog` with `.html`/`.htm` filter and `${title}.html` default name, `invoke("save_file", { path, content })` (reuses existing command — no new Tauri command needed), and `showToast(\`Exported HTML to ${path}\`, "info")`. Source is `previewEl.innerHTML` per the spec — *not* the editor textarea.
  - **`exportPdf()`** at L537-547: stashes prior view mode, flips to preview if not already (also re-renders to ensure freshness), awaits two RAFs for layout settle, calls `window.print()` (macOS WebView print sheet exposes "Save as PDF" — this is the "system print-to-PDF path via the WebView" the spec mandates), restores prior view mode after print. No Rust changes needed for PDF beyond the menu emit.
  - **`exportBaseName()`** at L481-489: current file basename → source file basename → "untitled" — matches the spec's fallback chain.
  - **`buildStandaloneHtml()`** at L491-520: `<!doctype html>` + `<meta charset="utf-8">` + viewport + escaped `<title>` + inline `<style>` (light color-scheme, system font, max-width 760px, dark text on white, syntax-highlight-friendly code/pre styles, table borders, image max-width, blue links) + `<body class="markdown-body">${bodyHtml}</body>`. Portable — opens correctly in any browser without external assets.
- Validation:
```text
node --check paperboy-app/src/scripts/bridge.js                                              # exit 0
( cd paperboy-app/src-tauri && cargo check )                                                  # exit 0 (24.51s)
grep -n "Export\|export_html\|export_pdf\|menu-export" paperboy-app/src-tauri/src/main.rs    # 5 hits
grep -n "menu-export-html\|menu-export-pdf\|exportHtml\|exportPdf" paperboy-app/src/scripts/bridge.js  # 7 hits
npm run build:converter -w paperboy-app                                                       # exit 0
npm run build --workspaces --if-present                                                       # exit 0 (cli, ext, widget)
npm test --workspaces --if-present                                                            # exit 0 (31/31 tests)
```

No additional findings. The implementation matches the turn-1 builder prompt verbatim, and the two small extras (calling `renderPreview` before reading innerHTML in both export paths) are defensive improvements that don't change the contract.

## Builder Prompt

No further builder work required for 4.10.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — Finding 1 resolved
- [x] Every required finding has a validation command — all validation commands re-run with exit 0
- [x] Code samples or exact data/CLI examples are included where useful — see Finding 1 re-verification
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions. The turn-1 open questions (submenu position; "untitled" default name) were both resolved as recommended by the builder.

## Decision
review_passed

## Notes (becomes the dashboard `--note`)
4.10 turn 2 PASS. Verified Rust adds File → Export submenu (HTML…, PDF…) between Save As and Close, emitting `menu-export-html`/`menu-export-pdf`. JS exportHtml refreshes preview, wraps `previewEl.innerHTML` in portable HTML doc + saveDialog + existing `save_file` invoke + toast. exportPdf flips to preview, RAF-settles, `window.print()` (macOS Save as PDF), restores prior view. Builder added a defensive `renderPreview()` before reading innerHTML — good. cargo check + all workspace builds + 31 tests green; bridge.js node --check passes.
