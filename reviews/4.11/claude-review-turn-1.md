# 4.11 - Review Turn 1

## Task Context
- Task id: 4.11
- Task title: Add status bar (word count, cursor position)
- Dashboard implementation status: in_progress (queue auto-routed task to reviewer at turn 1; no build commit exists yet — see Finding 1)
- Review status: in_review → waiting_for_builder
- Spec section (plan line 100): "**4.11** Add status bar (word count, cursor line:col, file extension hint). New thin row at the bottom of [src/index.html](paperboy-app/src/index.html)."
- Files inspected:
  - `paperboy-app/src/index.html` — bottom of `<div class="app-shell">` at L165-167 is `<footer class="path-footer">` (the existing optional path display). The new status bar belongs as a sibling row right above or below it.
  - `paperboy-app/src/scripts/bridge.js` — `editorEl = document.querySelector("[data-editor]")` at L70 (the textarea — `selectionStart` and selection events are available on it directly); `editor = initEditor(editorEl, …)` at L76; `editor.onChange((content) => …)` at L102 (already fires on every input — perfect hook for recomputing word count); `state.currentFile`/`state.sourceFile`/`state.viewMode` available throughout (used at L482-488 in `exportBaseName()`).
  - `paperboy-app/src/scripts/editor.js` — `initEditor` (L3-65) returns an API: `getContent`, `getLineCount`, `onChange`, `setContent` etc. No selection accessor is exposed, but `bridge.js` already holds the raw `editorEl` (textarea) reference and can listen for `selectionchange`/`keyup`/`mouseup`/`input` directly on it without touching `editor.js`.
  - `paperboy-app/src/styles/app.css` — `.path-footer` at L499-514 (min-height 22px, border-top, var(--border-color), padding 4px 12px 5px, var(--bg-primary), text-muted 11px). Reuse the same visual register so the status bar reads as a peer footer.
- Commands run:
  - `grep -rn "status-bar\|statusBar\|word.count\|wordCount\|cursor.*line\|lineCol\|line:col" paperboy-app/src/` → 0 hits (confirms nothing built).
  - `git log --oneline -5` → last commit is `2ae64a2` (4.10 review_passed); no 4.11 commit exists.
  - `jq '.tasks[] | select(.id == "4.11")' reviews/paperboy-review-queue.json` → `phase: review, turn: 1, artifacts.review: "reviews/4.11/claude-review-turn-1.md", reply: null, decision: null`.
- Current claim being verified: none. Queue auto-activated 4.11 when 4.10 closed and routed it to the reviewer at turn 1. Treating this as a turn-1 spec review and routing the work to the builder via the Builder Prompt below.

## Findings

### Finding 1: Status bar does not exist (entire feature missing)
- Severity: required
- Location:
  - `paperboy-app/src/index.html` (bottom of `.app-shell`, around L164-168 — currently just the optional `<footer class="path-footer">`).
  - `paperboy-app/src/scripts/bridge.js` (initialization sweep around L70-115; doc-state updates around `setDocument`/`updatePathFooter` L551-590).
  - `paperboy-app/src/styles/app.css` (new `.status-bar` rule alongside `.path-footer` at L499-514).
- Problem: The plan's deliverable for 4.11 is a thin status-bar row at the bottom of the window showing three live indicators: (1) word count, (2) cursor line:col, (3) file extension hint. None of these exist anywhere in the app. A user has no way to glance at how long their document is or where the caret sits.
- Spec mismatch / risk: Markdown editors are expected to surface these affordances. Missing them keeps Paperboy behind table-stakes parity with iA Writer, Typora, Obsidian, etc. The extension hint also helps surface "this opened as a PDF/DOCX import" vs. ".md" which the existing tab+title chrome makes ambiguous.
- Required fix:
  1. **HTML** — Add a new sibling row inside `.app-shell`, **immediately after** `<footer class="path-footer">…</footer>` at L165-167 (keeps the path-footer's own visibility toggle independent). Markup pattern matches the existing path-footer:
     ```html
     <footer class="status-bar" data-status-bar>
       <span class="status-bar-segment" data-status-words aria-label="Word count">0 words</span>
       <span class="status-bar-sep" aria-hidden="true">·</span>
       <span class="status-bar-segment" data-status-cursor aria-label="Cursor position">Ln 1, Col 1</span>
       <span class="status-bar-sep" aria-hidden="true">·</span>
       <span class="status-bar-segment" data-status-ext aria-label="File type">md</span>
     </footer>
     ```
     Always visible (no `hidden` attribute) so the user always has the indicators.
  2. **CSS** — In `paperboy-app/src/styles/app.css`, alongside the existing `.path-footer` rule, add:
     ```css
     .status-bar {
       display: flex;
       align-items: center;
       gap: 8px;
       min-height: 22px;
       padding: 4px 12px 5px;
       border-top: 1px solid var(--border-color);
       background: var(--bg-primary);
       color: var(--text-muted);
       font-size: 11px;
       letter-spacing: 0.02em;
       -webkit-user-select: none;
       user-select: none;
     }
     .status-bar-segment {
       white-space: nowrap;
     }
     .status-bar-sep {
       opacity: 0.5;
     }
     ```
     The visual register matches `.path-footer` (same border-top, padding, font-size, color tokens) so the two footers read as a coherent bottom chrome.
  3. **JS** — In `paperboy-app/src/scripts/bridge.js`, add three DOM refs near the other queries (around L65-75):
     ```js
     const statusWordsEl = document.querySelector("[data-status-words]");
     const statusCursorEl = document.querySelector("[data-status-cursor]");
     const statusExtEl = document.querySelector("[data-status-ext]");
     ```
     Add update helpers (place near `updatePathFooter` at L576):
     ```js
     function updateStatusWords() {
       if (!statusWordsEl) return;
       const text = editor.getContent();
       // Word count: trim, split on whitespace, ignore empty. Treats markdown
       // syntax as part of words (good enough — matches iA Writer/Obsidian).
       const trimmed = text.trim();
       const count = trimmed ? trimmed.split(/\s+/).length : 0;
       statusWordsEl.textContent = `${count.toLocaleString()} ${count === 1 ? "word" : "words"}`;
     }

     function updateStatusCursor() {
       if (!statusCursorEl) return;
       const pos = editorEl.selectionStart ?? 0;
       const upto = editorEl.value.slice(0, pos);
       const nl = upto.lastIndexOf("\n");
       const line = (upto.match(/\n/g) || []).length + 1;
       const col = (nl === -1 ? upto.length : upto.length - nl - 1) + 1;
       statusCursorEl.textContent = `Ln ${line}, Col ${col}`;
     }

     function updateStatusExt() {
       if (!statusExtEl) return;
       const path = state.currentFile || state.sourceFile;
       if (!path) {
         statusExtEl.textContent = "md";
         return;
       }
       const m = path.match(/\.([A-Za-z0-9]+)$/);
       statusExtEl.textContent = m ? m[1].toLowerCase() : "md";
     }

     function updateStatusBar() {
       updateStatusWords();
       updateStatusCursor();
       updateStatusExt();
     }
     ```
     Wire them up. There are three change sources:
     - **Content changes** — extend the existing `editor.onChange` (around L102):
       ```js
       editor.onChange((content) => {
         // ...existing body...
         updateStatusWords();
         updateStatusCursor(); // selection might shift on input
       });
       ```
     - **Selection/cursor moves** — add listeners on the textarea (place near `editor.onScroll` wire-up at L110):
       ```js
       editorEl.addEventListener("keyup", updateStatusCursor);
       editorEl.addEventListener("mouseup", updateStatusCursor);
       editorEl.addEventListener("focus", updateStatusCursor);
       document.addEventListener("selectionchange", () => {
         if (document.activeElement === editorEl) updateStatusCursor();
       });
       ```
     - **Document/tab changes** — call `updateStatusExt()` (and `updateStatusBar()` for safety) inside `setDocument` (L551), `switchToTab`/`activateTab` (around L158-163 in `restoreFromTab`), and once at startup (after `editor` is initialized).
- Code sample / exact change: see the three blocks above. No new Tauri command needed. No `editor.js` changes — `bridge.js` already has the textarea ref.
- Validation:
```text
grep -n "status-bar\|data-status-words\|data-status-cursor\|data-status-ext" paperboy-app/src/index.html  # MUST show footer + 3 segments
grep -n "\.status-bar\|\.status-bar-segment" paperboy-app/src/styles/app.css                              # MUST show new rules
grep -n "statusWordsEl\|statusCursorEl\|statusExtEl\|updateStatusBar\|updateStatusWords\|updateStatusCursor\|updateStatusExt" paperboy-app/src/scripts/bridge.js  # MUST show refs + helpers + wiring
node --check paperboy-app/src/scripts/bridge.js     # exit 0
( cd paperboy-app/src-tauri && cargo check )         # exit 0 (no Rust changes, but sanity)
npm run build:converter -w paperboy-app              # exit 0
npm run build --workspaces --if-present              # exit 0
npm test --workspaces --if-present                   # exit 0 (31 tests still pass)
```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 4.11.

Objective: Add a thin status-bar row at the bottom of the app window (sibling to the existing `.path-footer`) that always shows three live indicators: word count, cursor line:col, and current file extension. No new Tauri commands, no Cargo deps, no changes to `editor.js` — `bridge.js` already has the textarea ref and the `editor.onChange` hook needed.

Files to edit:
- `paperboy-app/src/index.html` — add a new `<footer class="status-bar" data-status-bar>…</footer>` row immediately after the existing `<footer class="path-footer">…</footer>` block at L165-167. Three child `<span>` segments: `data-status-words` (default text `"0 words"`), `data-status-cursor` (default `"Ln 1, Col 1"`), `data-status-ext` (default `"md"`), separated by `<span class="status-bar-sep" aria-hidden="true">·</span>` dots. The status-bar must NOT use the `hidden` attribute — it is always visible.
- `paperboy-app/src/styles/app.css` — add `.status-bar`, `.status-bar-segment`, `.status-bar-sep` rules right after the existing `.path-footer` rule at L499-514. Match the visual register: same `border-top: 1px solid var(--border-color)`, `background: var(--bg-primary)`, `color: var(--text-muted)`, `font-size: 11px`, `letter-spacing: 0.02em`, `min-height: 22px`, `padding: 4px 12px 5px`. Use `display: flex; align-items: center; gap: 8px;` and `user-select: none; -webkit-user-select: none;`. `.status-bar-sep` should be `opacity: 0.5`.
- `paperboy-app/src/scripts/bridge.js`:
  - Add three DOM refs near L65-75 (after `previewEl` / before `editor`): `statusWordsEl`, `statusCursorEl`, `statusExtEl` from the new `data-status-*` selectors.
  - Add four helper functions near `updatePathFooter` (around L576-590): `updateStatusWords()`, `updateStatusCursor()`, `updateStatusExt()`, `updateStatusBar()`. Logic per the spec above:
    - Words: `editor.getContent().trim().split(/\s+/).filter(Boolean).length` (or equivalent — empty content → `0 words`). Use `count.toLocaleString()` + singular/plural ("word"/"words").
    - Cursor: read `editorEl.selectionStart`, slice prefix, count `\n` for line, distance from last `\n` (or start of string) for column. Both 1-based. Format: `Ln ${line}, Col ${col}`.
    - Ext: prefer `state.currentFile`, fall back to `state.sourceFile`, default `"md"`. Lowercase the extension; default `"md"` when no path is available.
  - Wire content updates: extend the existing `editor.onChange` callback (around L102-109) to call `updateStatusWords()` and `updateStatusCursor()` after its current body.
  - Wire selection updates: after `editor.onScroll` is wired (around L110), add `editorEl.addEventListener("keyup", updateStatusCursor)`, `editorEl.addEventListener("mouseup", updateStatusCursor)`, `editorEl.addEventListener("focus", updateStatusCursor)`, and a `document.addEventListener("selectionchange", () => { if (document.activeElement === editorEl) updateStatusCursor(); })`.
  - Wire document/tab updates: call `updateStatusBar()` at the end of `setDocument` (L551-563), and inside `restoreFromTab` (or wherever tab activation happens — currently L158-163 sets editor content from `tab.content`). Also call `updateStatusBar()` once at module init (right after `editor = initEditor(...)` at L76).

Files NOT to edit:
- `paperboy-app/src/scripts/editor.js` (no API change needed).
- `paperboy-app/src-tauri/**` (no Rust changes — this is a pure renderer feature).
- Any other workspace (`paperboy-cli`, `paperboy-ext`, `paperboy-widget`, `paperboy-converter`).

Exact changes: see the HTML/CSS/JS blocks in Finding 1.

Tests to add or update: none. The desktop frontend has no JS test harness; verify via the grep + build + manual smoke commands below.

Commands to run (capture exit codes in your reply):
```text
node --check paperboy-app/src/scripts/bridge.js                                                  # exit 0
( cd paperboy-app/src-tauri && cargo check )                                                      # exit 0
grep -n "status-bar\|data-status-words\|data-status-cursor\|data-status-ext" paperboy-app/src/index.html  # 4-5 hits
grep -n "\.status-bar\|\.status-bar-segment\|\.status-bar-sep" paperboy-app/src/styles/app.css   # 3+ hits
grep -n "statusWordsEl\|statusCursorEl\|statusExtEl\|updateStatus" paperboy-app/src/scripts/bridge.js  # 10+ hits
npm run build:converter -w paperboy-app                                                           # exit 0
npm run build --workspaces --if-present                                                           # exit 0
npm test --workspaces --if-present                                                                # exit 0 (31 tests, 5+1 files)
```

Manual smoke (record results in your turn-1 reply):
```text
1. Open built .app, empty tab → status-bar shows "0 words · Ln 1, Col 1 · md".
2. Type "Hello world" → "2 words · Ln 1, Col 12 · md".
3. Press Enter, type "foo" → "3 words · Ln 2, Col 4 · md".
4. Move caret with arrow keys → Ln/Col updates live.
5. Click into the editor with mouse → Ln/Col reflects the click position.
6. Open a .pdf via File → Open → ext segment shows "pdf"; word count reflects the imported markdown.
7. Switch tabs → status-bar reflects the active tab's content + extension.
```

Definition of done (turn 1):
- Status-bar row visible at the bottom of the app, always (not gated by `hidden`).
- Three live segments: word count (singular/plural correct), cursor line:col (1-based, updates on typing, arrow keys, click, focus), file extension (current file → source file → "md" fallback, lowercased).
- Visual register matches `.path-footer` (same border-top, font, color tokens) so the two footers read coherently.
- `node --check bridge.js` passes; `cargo check` still passes (no Rust changes); all workspace builds + 31 tests still pass.
- No changes to `editor.js`, `editor.css`, `preview.js`, or any other workspace.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Status-bar placement vs. path-footer: I'm placing the new `.status-bar` *after* `.path-footer` (i.e. at the very bottom) so the always-visible status-bar is the last row regardless of whether the path-footer is shown. If the user prefers the inverse (status-bar above path-footer), it's a 2-line swap — but bottom-of-bottom feels right for an always-on indicator.
- Word-count semantics: I'm using `text.trim().split(/\s+/).length` (markdown syntax counts as words). This matches Obsidian/iA Writer behavior. A "strip markdown first" version is more accurate but adds complexity for marginal benefit on turn 1.
- File extension when there's no current file: defaulting to `"md"` since the editor's working format is markdown. Open to `"—"` or empty if a placeholder feels louder than helpful.

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
4.11 turn 1: Status bar not yet implemented. Send to builder with full spec — new `<footer class="status-bar">` row after `.path-footer` in index.html with three always-visible segments (words / Ln,Col / ext). CSS rule alongside `.path-footer` matching same visual register. bridge.js adds 3 refs + 4 helpers, wires `editor.onChange` (words+cursor) + textarea keyup/mouseup/focus + `selectionchange` listener (cursor) + `setDocument`/tab-restore (ext+all). No `editor.js` changes (bridge already has textarea ref), no Rust changes, no new commands.
