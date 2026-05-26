# 4.11 - Review Turn 2

## Task Context
- Task id: 4.11
- Task title: Add status bar (word count, cursor position)
- Dashboard implementation status: done
- Review status: waiting_for_reviewer → review_passed
- Spec section (plan line 100): "**4.11** Add status bar (word count, cursor line:col, file extension hint). New thin row at the bottom of [src/index.html](paperboy-app/src/index.html)."
- Files inspected:
  - `paperboy-app/src/index.html` (L165-174) — `.status-bar` footer added immediately after `.path-footer`, always visible (no `hidden`), three `data-status-*` segments with `·` separators, ARIA labels per segment.
  - `paperboy-app/src/styles/app.css` (L516-537) — new `.status-bar`, `.status-bar-segment`, `.status-bar-sep` rules sit right after `.path-footer` (L499-514). Visual register matches per spec (same `border-top`, padding `4px 12px 5px`, `min-height: 22px`, color/font tokens). Flex layout with `gap: 8px`, `user-select: none` (both prefixed and standard).
  - `paperboy-app/src/scripts/bridge.js`:
    - L74-76: three DOM refs created right after `previewEl` query.
    - L79-81: `editor = initEditor(...)`, `preview = createPreview(...)`, then `updateStatusBar()` once at startup (safe — `editorEl.value` is empty, selectionStart 0, no currentFile, so renders defaults "0 words · Ln 1, Col 1 · md").
    - L106-115: `editor.onChange` callback extended with `updateStatusWords()` + `updateStatusCursor()` after existing body.
    - L117-122: textarea `keyup`/`mouseup`/`focus` listeners + `document.addEventListener("selectionchange", …)` gated on `document.activeElement === editorEl`.
    - L176 (in `restoreTab`): `updateStatusBar()` after `updatePathFooter()`.
    - L576 (in `setDocument`): `updateStatusBar()` at the end.
    - L596-628: four helpers — `updateStatusWords`, `updateStatusCursor`, `updateStatusExt`, `updateStatusBar`. Word logic: `editor.getContent().trim().split(/\s+/).length` with singular/plural and `toLocaleString()`. Cursor logic: 1-based Ln/Col derived from prefix slice of `editorEl.value`. Ext logic: regex on `state.currentFile || state.sourceFile`, lowercase, default `"md"`.
- Commands run:
  - `node --check paperboy-app/src/scripts/bridge.js` → exit 0.
  - `cd paperboy-app/src-tauri && cargo check` → "Finished `dev` profile" (exit 0).
  - `npm run build --workspaces --if-present` → exit 0 (converter, ai, cli, ext 293.4kb, widget 35.7kb all built).
  - `npm test --workspaces --if-present` → exit 0 (cli: 19 tests passed; widget: 12 tests passed; total 31 tests).
  - `grep -n "status-bar\|data-status-words\|data-status-cursor\|data-status-ext" paperboy-app/src/index.html` → 6 lines (footer + 3 segments + 2 separators).
  - `grep -n "\.status-bar\|\.status-bar-segment\|\.status-bar-sep" paperboy-app/src/styles/app.css` → 3 rules (L516, 531, 535).
  - `grep -n "statusWordsEl\|statusCursorEl\|statusExtEl\|updateStatus" paperboy-app/src/scripts/bridge.js` → 22 hits across refs, init call, onChange wiring, textarea listeners, selectionchange listener, restoreTab, setDocument, and the four helper definitions.
- Current claim being verified: cursor's turn-1 reply at `reviews/4.11/cursor-reply-turn-1.md` — "always-visible status bar with word count, cursor line/column, file extension; wired on onChange, textarea keyup/mouseup/focus, selectionchange, setDocument, restoreTab, startup; node --check green".

## Findings

No findings. Every turn-1 builder-prompt requirement is satisfied:

1. **HTML row** — `<footer class="status-bar" data-status-bar>` placed immediately after `<footer class="path-footer">` in `.app-shell`, no `hidden` attribute (always visible). Three `<span class="status-bar-segment">` children with the exact `data-status-words` / `data-status-cursor` / `data-status-ext` selectors and `·` separators. Default text matches spec: `"0 words"`, `"Ln 1, Col 1"`, `"md"`.
2. **CSS visual register** — `.status-bar` shares `border-top: 1px solid var(--border-color)`, `background: var(--bg-primary)`, `color: var(--text-muted)`, `font-size: 11px`, `letter-spacing: 0.02em`, `min-height: 22px`, `padding: 4px 12px 5px` with `.path-footer`. Adds `display: flex; align-items: center; gap: 8px` for the segment layout and `user-select: none` (both `-webkit-` and standard) so the chrome row isn't selectable. Status-bar-sep at `opacity: 0.5` for visual de-emphasis. Two footers read as coherent bottom chrome.
3. **JS — refs** — Three DOM queries at L74-76 alongside `previewEl`. No `editor.js` changes (textarea ref already exposed via `editorEl`).
4. **JS — helpers** — All four functions present with the exact logic from the builder prompt: word count uses trim+split+plural+`toLocaleString()`; cursor uses `editorEl.selectionStart`, line = `\n` count + 1, col = distance from last `\n` + 1 (both 1-based); ext defaults `"md"`, lowercases regex match, falls back through `state.currentFile → state.sourceFile → "md"`.
5. **JS — wiring** — Content changes flow through `editor.onChange` (L113-114). Selection changes flow through textarea `keyup`/`mouseup`/`focus` plus `document.selectionchange` gated on focused element (L117-122). Document/tab changes flow through `setDocument` (L576), `restoreTab` (L176), and the one-time startup call (L81). All five wire-up sites are exactly where the builder prompt specified.
6. **Out-of-scope discipline** — No edits to `paperboy-app/src/scripts/editor.js`, `paperboy-app/src-tauri/**`, or any other workspace. `cargo check` still green; widget/ext/cli/converter/ai still build; 31 tests still pass.

## Builder Prompt

No further builder work required. Closing 4.11.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix (no findings)
- [x] Every required finding has a validation command (no findings)
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions. The three turn-1 open-questions (placement under path-footer, markdown-syntax-counts-as-word semantics, `"md"` default for unsaved buffers) were all resolved per my turn-1 recommendation and ship as-is.

## Decision
review_passed

## Notes (becomes the dashboard `--note`)
4.11 review_passed turn 2: Status-bar row added to index.html L168-174 (after .path-footer, always visible). 3 segments wired in bridge.js (refs L74-76, helpers L596-628): words (trim+split, singular/plural), Ln/Col (1-based, derived from editorEl.selectionStart), ext (lowercased, defaults md). Triggers cover editor.onChange + textarea keyup/mouseup/focus + selectionchange + setDocument + restoreTab + startup. CSS L516-537 matches .path-footer register. node --check OK; cargo check OK; full workspace build OK; 31/31 tests pass.
