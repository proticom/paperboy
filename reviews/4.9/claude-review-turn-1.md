# 4.9 - Review Turn 1

## Task Context
- Task id: 4.9
- Task title: Add Find/Replace overlay (Cmd+F)
- Dashboard implementation status: in_progress (verified NOT started in the repo)
- Review status: in_review → waiting_for_builder
- Spec sections: dashboard task **4.9** in `paperboy-spec-tasks.json` group "Phase 4 — Desktop app feature completeness", title "Add Find/Replace overlay (Cmd+F)". The spec doesn't include a separate plan file; the title is the deliverable. Interpretation: the desktop app's plain-`<textarea>` editor has no in-editor search — Cmd+F today does nothing inside Paperboy. The browser-level Cmd+F is not exposed in Tauri's WKWebView in a usable form. Users editing long Markdown documents have no way to jump to a substring, let alone replace it. This task adds the standard editor Find/Replace overlay (think Sublime/VS Code's minimal find bar, not the full panel).
- Files inspected:
  - `paperboy-app/src/scripts/editor.js` (155 lines) — single-textarea editor. Keydown handler at L13-33 intercepts Cmd+modifiers for B/I/K/`/X/[/]; ignores S/O/N/W (handed off to Tauri shortcuts). No F key handling.
  - `paperboy-app/src/scripts/bridge.js` (642 lines) — wires editor.js + preview.js + toasts. `showToast` helper at L626. `let toastEl = null` at L74. No find UI.
  - `paperboy-app/src/index.html` (206 lines) — DOM structure. The editor lives at L131-133 inside `.editor-pane` inside `<main class="content-area">`. There's a settings `<dialog>` at L149-195 (the only modal in the app today). No find overlay element.
  - `paperboy-app/src/styles/app.css` (748 lines) — toast pattern at L537-571 is a good prior art for "transient floating UI". Settings dialog styles follow at L575+. Sharp/rounded conventions: settings dialog uses `border-radius: 12px`, toast uses `border-radius: 8px`. The project convention from CLAUDE.md says "sharp corners everywhere — border radius defaults to 0", but the existing app dialog/toast already use 8-12px radii, so match the in-app pattern, not the marketing site.
  - `paperboy-app/src/scripts/preview.js` — preview pane; out of scope (find should apply to source text, which is the textarea).
  - `paperboy-app/src-tauri/src/main.rs` — no Tauri-side menu accelerator for Cmd+F today. Tauri menu accelerators for Cmd+S/N/O/W are wired elsewhere; Cmd+F is unbound, so DOM-level keydown can claim it without conflict.
- Commands run:
  - `grep -rln "Find\|find-overlay\|findOverlay\|search-overlay" paperboy-app/src/ --include='*.js' --include='*.html' --include='*.css' | grep -v vendor` → empty (no find UI exists).
  - `grep -n "Cmd+F\|key.*f\|KeyF\|metaKey.*f" paperboy-app/src/scripts/editor.js paperboy-app/src/scripts/bridge.js` → no matches (Cmd+F unbound at the DOM layer).
  - `grep -n "Find\|find" paperboy-app/src-tauri/src/main.rs` → only Finder-related Open events; no Cmd+F accelerator.
  - `grep -n "showToast\|app-toast\|toastEl" paperboy-app/src/scripts/bridge.js paperboy-app/src/styles/app.css` → confirms the toast pattern is the standard "floating UI" template to follow.
  - `git log --oneline -- paperboy-app/src/scripts/editor.js paperboy-app/src/index.html | head` → no 4.9 commit; last touch is the pre-4.x baseline.
- Current claim being verified: none — `reply: null` in the queue, turn 1 fresh review. Task status is `in_progress` in the dashboard but the implementation is absent from source. Treat as a build prompt.

## Findings

### Finding 1: No Find/Replace UI exists; Cmd+F is silently swallowed
- Severity: required (this is the entire 4.9 deliverable)
- Location: `paperboy-app/src/index.html` (overlay DOM missing), `paperboy-app/src/scripts/editor.js` (no Cmd+F handler), `paperboy-app/src/scripts/bridge.js` (no overlay controller wiring), `paperboy-app/src/styles/app.css` (no overlay styles).
- Problem: The desktop app's editor is a plain `<textarea>`. WKWebView does NOT expose a usable native find bar inside a Tauri app, and the editor.js keydown handler at L13-33 lets `F` fall through (only intercepts B/I/K/`/X/[/]). Users editing a long document have no in-editor way to locate or replace a substring — they must Cmd+A → copy → paste into another editor → search → paste back. That's a glaring gap for a "production-ready" desktop Markdown editor.
- Spec mismatch / risk: Task 4.9 explicitly calls for a Find/Replace overlay bound to Cmd+F. Without it the desktop app fails feature parity with every comparable editor (Sublime, VS Code, BBEdit, iA Writer, Typora). Replace is the harder half — find without replace would not satisfy "Find/Replace" in the title.
- Required fix: Add a small, non-modal overlay anchored to the editor pane that:
  1. Opens on Cmd/Ctrl+F. The current textarea selection (if any) prefills the find input.
  2. Has two inputs: `find` and `replace`, plus four buttons: Prev, Next, Replace, Replace All, plus a Close (Esc) affordance.
  3. Highlights nothing in the textarea (a `<textarea>` cannot host inline highlights), but selects the current match in the textarea via `setSelectionRange` and scrolls it into view. Status text shows `N of M` (e.g. "3 of 17").
  4. Wraps around at end-of-document. Case-insensitive by default; toggle for case-sensitive (small "Aa" pill) and a regex pill — these can be deferred only if explicitly justified in the reply, but the case-insensitive default + Aa toggle is a hard requirement (matches every other editor).
  5. Enter inside the find input = Next; Shift+Enter = Prev. Enter inside replace = Replace (single). Cmd/Ctrl+Enter inside replace = Replace All. Esc closes the overlay and returns focus to the textarea, restoring the prior selection.
  6. Cmd/Ctrl+G (next) and Cmd/Ctrl+Shift+G (prev) work when the overlay is open OR after it has been used once (standard "find again" shortcut).
  7. Surfaces "No matches" state when matches=0; disables Prev/Next/Replace/Replace All when matches=0.
  8. Replace All emits a single toast: `Replaced N occurrence(s)` (info kind). Single Replace silently advances to the next match.
  9. The overlay must not interfere with the existing settings dialog or the toast (both float over the same area; positioning must keep them visually separate).
  10. Does NOT operate when the active view is `data-view-mode="preview"` and the textarea is hidden — in that case Cmd+F either (a) switches view back to editor first then opens overlay, or (b) is a no-op. Choose (a) for a smoother UX, and document the choice in the reply.
- Code sample / exact change:

```html
<!-- paperboy-app/src/index.html — add inside <main class="content-area"> right after <section class="preview-pane-wrap"> ... </section> (around L141), so it's scoped to the editor view but positions absolutely. -->
<aside class="find-overlay" data-find-overlay hidden role="dialog" aria-label="Find and replace">
  <div class="find-row">
    <input type="text" data-find-input class="find-input" placeholder="Find" spellcheck="false" aria-label="Find" />
    <span class="find-count" data-find-count aria-live="polite">0 of 0</span>
    <button type="button" class="find-btn" data-find-prev title="Previous match (Shift+Enter)" aria-label="Previous match">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>
    </button>
    <button type="button" class="find-btn" data-find-next title="Next match (Enter)" aria-label="Next match">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <button type="button" class="find-toggle" data-find-case aria-pressed="false" title="Match case" aria-label="Match case">Aa</button>
    <button type="button" class="find-close" data-find-close aria-label="Close find (Esc)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
    </button>
  </div>
  <div class="find-row">
    <input type="text" data-replace-input class="find-input" placeholder="Replace" spellcheck="false" aria-label="Replace" />
    <button type="button" class="find-btn find-btn-text" data-replace-one>Replace</button>
    <button type="button" class="find-btn find-btn-text" data-replace-all>All</button>
  </div>
</aside>
```

```css
/* paperboy-app/src/styles/app.css — append a new section before "/* --- Settings dialog --- */" */
.find-overlay {
  position: absolute;
  top: 8px;
  right: 16px;
  z-index: 50;                                /* below toast (999), above editor */
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
  font-family: inherit;                       /* Geist Mono per project conventions */
  font-size: 12px;
}
.find-overlay[hidden] { display: none; }
.find-row { display: flex; align-items: center; gap: 6px; }
.find-input {
  flex: 1 1 220px;
  min-width: 180px;
  padding: 4px 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
}
.find-input:focus { outline: 1px solid var(--border-strong); outline-offset: 0; }
.find-count { font-size: 11px; opacity: 0.7; min-width: 56px; text-align: right; }
.find-btn, .find-close, .find-toggle {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
}
.find-btn-text { width: auto; padding: 0 8px; font: inherit; }
.find-btn:disabled, .find-btn-text:disabled { opacity: 0.4; cursor: not-allowed; }
.find-toggle[aria-pressed="true"] { background: var(--border-strong); }
.find-overlay.is-empty .find-count { color: #b06060; }   /* no matches */
```

```js
// paperboy-app/src/scripts/editor.js — add a returned method `installFindOverlay(overlayRefs)` and intercept Cmd/Ctrl+F in the existing keydown handler.
// The keydown branch (after the existing tab/format guards):
if (mod && key === "f" && !shift) {
  event.preventDefault();
  onOpenFind?.();   // new callback, set by bridge.js
  return;
}
// Expose `onOpenFind(cb)` on the returned editor object.

// paperboy-app/src/scripts/bridge.js — new initFindOverlay() called once during boot:
//   - reads DOM refs for the overlay, find/replace inputs, buttons
//   - maintains state: { matches: number[], cursor: number, caseSensitive: boolean }
//   - on open: prefills find input from textarea selection, computes matches via case-insensitive .indexOf loop (or RegExp with /g/i)
//   - on next/prev: increments cursor (wraps), calls textarea.setSelectionRange + scrolls into view (use a hidden mirror div to compute scrollTop, or simpler: rely on textarea's built-in select behavior — `setSelectionRange` + `focus()` scrolls the caret line into view in WebKit)
//   - on replace: replaces current match, re-computes match list (cheap for <100k char docs), advances cursor
//   - on replace all: builds new value by splitting and joining (or by reverse-iterating matches to avoid index shifts); emits one info toast
//   - on close (Esc, close button): hides overlay, focuses textarea, restores prior selection
//   - on input typing: debounced (50ms) recompute of matches and count
```
- Validation:
```text
# Static checks (no test harness for the desktop frontend; behaviour gates require a built .app)
node --check paperboy-app/src/scripts/editor.js                                            # exit 0
node --check paperboy-app/src/scripts/bridge.js                                            # exit 0
grep -n "data-find-overlay\|data-find-input\|data-replace-input" paperboy-app/src/index.html     # at least 3 hits
grep -n ".find-overlay" paperboy-app/src/styles/app.css                                    # styles added
grep -n "onOpenFind\|initFindOverlay\|setSelectionRange" paperboy-app/src/scripts/bridge.js paperboy-app/src/scripts/editor.js   # wiring present
npm run build:converter -w paperboy-app                                                    # exit 0 (sanity; this task does not touch the converter bundle)
npm run build --workspaces --if-present                                                    # exit 0 (all workspaces still build)
npm test --workspaces --if-present                                                         # exit 0 (existing 31 tests still pass)
```
Manual smoke (record in the reply):
```text
1. Open the .app with a 500+ line Markdown file.
2. Press Cmd+F → overlay slides in at top-right of editor pane, find input focused.
3. Type "foo" → count shows "N of M"; first match selected in textarea and visible.
4. Press Enter → advances to next; Shift+Enter → previous; both wrap at ends.
5. Type a replacement in the second input, click Replace → current match replaced, cursor advances.
6. Click All → all matches replaced, toast shows "Replaced N occurrence(s)".
7. Toggle Aa → case-sensitive search; count updates.
8. Press Esc → overlay closes, textarea regains focus.
9. Switch to preview view, press Cmd+F → view switches back to editor and overlay opens.
10. Open Settings dialog (Cmd+,) — overlay and dialog must not visually collide.
```

### Finding 2: No conflict with existing Cmd-modifier bindings, BUT a Tauri menu accelerator may need to be wired explicitly
- Severity: required (verification)
- Location: `paperboy-app/src-tauri/src/main.rs` (Tauri menu), `paperboy-app/src/scripts/editor.js:18` (the "ignore S/O/N/W" passthrough list).
- Problem: The editor.js keydown handler explicitly skips S/O/N/W because Tauri owns those menu accelerators (`Cmd+S` Save, `Cmd+O` Open, `Cmd+N` New, `Cmd+W` Close). Today there is no `Cmd+F` Tauri menu accelerator, so claiming Cmd+F in DOM is safe. However, if the macOS menu bar shows an Edit → Find item (it does by default on macOS apps), there may be a system-managed accelerator the WKWebView eats before keydown fires. Verify by checking the Tauri menu definition and either (a) confirming there is no Edit→Find menu item, or (b) adding a Tauri menu item that posts a `find:open` event the frontend listens for. Option (a) is simpler if it holds.
- Required fix: Inspect `paperboy-app/src-tauri/src/main.rs` and any menu definition file (e.g. `src-tauri/src/menu.rs` if present). If no Edit→Find menu item exists, DOM keydown handles it cleanly — document this in the reply. If one exists, either remove it or wire it to emit a `tauri://find:open` event that bridge.js listens for via `@tauri-apps/api/event`.
- Code sample / exact change:
```rust
// If a menu Edit submenu exists with a Find item, replace it with:
// .text("find_open", "Find…").accelerator("CmdOrCtrl+F")
// and in main.rs's on_menu_event handler:
// "find_open" => { let _ = app.emit("find:open", ()); }
//
// Then in bridge.js boot:
// import { listen } from "@tauri-apps/api/event";
// listen("find:open", () => openFindOverlay());
```
- Validation:
```text
grep -n "Find\|find_open\|CmdOrCtrl+F" paperboy-app/src-tauri/src/main.rs paperboy-app/src-tauri/src/*.rs 2>/dev/null
# If no hits today AND DOM keydown fires for Cmd+F in a manual smoke, no Tauri-side change is required.
```

### Finding 3: Replace-All correctness and index-shift hazard
- Severity: required
- Location: `paperboy-app/src/scripts/bridge.js` (proposed find/replace controller).
- Problem: Naïve replace-all that iterates matches forward AND mutates the textarea value will shift later match indices, causing skipped/double replacements when find and replace strings differ in length (e.g. find "a", replace "aaa"). This is a common bug.
- Required fix: Implement Replace All either by (a) building a new string via `value.split(find).join(replace)` (case-sensitive only — case-insensitive needs regex), (b) using a single `value.replaceAll(find, replace)` (ES2021, supported in WebKit and Chrome), or (c) iterating in reverse from last match to first. The cleanest is `value.replace(new RegExp(escapeRegex(find), caseSensitive ? "g" : "gi"), replace)`. Always set `textarea.value` once, then call `setSelectionRange` to the end of the last replacement, then dispatch an `input` event so the editor's `onChange` fires and the preview updates.
- Code sample / exact change:
```js
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function replaceAll(textarea, find, replacement, caseSensitive) {
  if (!find) return 0;
  const flags = caseSensitive ? "g" : "gi";
  const re = new RegExp(escapeRegex(find), flags);
  const next = textarea.value.replace(re, replacement);
  const count = (textarea.value.match(re) || []).length;
  if (count === 0) return 0;
  const caret = next.length;                 // park caret at end; UX-safe and avoids fancy mapping
  textarea.value = next;
  textarea.setSelectionRange(caret, caret);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  return count;
}
```
- Validation:
```text
# Unit smoke — paste into a small test runner or evaluate in DevTools:
#   replaceAll(ta, "a", "aaa", false) on "banana" → "baaanaaanaaa" with count=3
#   replaceAll(ta, "Foo", "Bar", false) on "foo Foo FOO" → "Bar Bar Bar" with count=3 (case-insensitive)
#   replaceAll(ta, "Foo", "Bar", true)  on "foo Foo FOO" → "foo Bar FOO"  with count=1
# Manual: in the built .app, run the 10-step smoke at the end of Finding 1 and confirm the post-replace toast count matches expectations.
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: Implement an in-editor Find/Replace overlay bound to Cmd+F (Ctrl+F on non-mac). The overlay is a floating panel anchored to the top-right of the editor pane, not a modal dialog. It supports find, replace single, replace all, case toggle, prev/next navigation with wrap-around, a status counter, Esc to close, and Cmd+G / Shift+Cmd+G for find-next/find-prev. Replace All emits an info toast with the count. The implementation must not interfere with existing Cmd-modifier shortcuts (B/I/K/`/X/[/]/S/O/N/W) and must work whether the active view is editor or split, switching back to editor when Cmd+F is pressed in preview-only view.

Files to edit:
- `paperboy-app/src/index.html` — add the `<aside data-find-overlay>` markup inside `<main class="content-area">` (after `<section class="preview-pane-wrap">`, before the closing `</main>`).
- `paperboy-app/src/styles/app.css` — append the `.find-overlay` style block before `/* --- Settings dialog --- */`.
- `paperboy-app/src/scripts/editor.js` — extend the keydown handler to intercept Cmd/Ctrl+F (no shift); add an `onOpenFind(cb)` setter on the returned editor object. Do NOT add `f` to the existing format map.
- `paperboy-app/src/scripts/bridge.js` — add a `initFindOverlay()` function that wires the overlay DOM, owns the find state, implements next/prev/replace/replace-all (using a regex-based engine per Finding 3 to avoid index-shift bugs), debounces input recomputation (50ms), and listens for Esc/Enter/Shift+Enter/Cmd+Enter/Cmd+G/Shift+Cmd+G when the overlay is visible. Call `initFindOverlay()` once in the existing boot sequence (next to the editor/preview init calls). Use the existing `showToast` helper for the Replace All notification.

Files not to edit:
- `paperboy-app/src/scripts/preview.js` — find operates on source text only.
- `paperboy-app/src/scripts/converter.js`, `paperboy-app/src/scripts/settings.js`, `paperboy-app/src/scripts/theme.js`, `paperboy-app/src/scripts/pretext-sync.js` — unrelated.
- `paperboy-app/src/scripts/vendor/*` — vendored libraries; do not touch.
- `paperboy-app/src-tauri/*` — no Rust change needed if Finding 2's grep shows no existing Find menu accelerator. If one exists, do the minimal wiring per Finding 2 and document it.
- `paperboy-converter/`, `paperboy-cli/`, `paperboy-widget/`, `paperboy-ext/`, `paperboy-site/` — out of scope.

Exact changes: see the HTML/CSS/JS sketches in Finding 1 and Finding 3. Adjust class names and identifiers only if they collide with something already in the file (a `grep` confirms `.find-` and `data-find-` are currently unused).

Data shapes / CLI examples:
- Overlay state object kept in `bridge.js`:
  ```js
  const findState = {
    open: false,
    caseSensitive: false,
    query: "",
    matches: [],          // array of { start: number, end: number }
    cursor: -1,           // index into matches; -1 when no matches
    savedSelection: null  // { start, end } captured on open, restored on Esc
  };
  ```
- Match enumeration: build with a single regex scan, `for (const m of value.matchAll(re)) matches.push({ start: m.index, end: m.index + m[0].length });`.
- Counter format: "0 of 0" when no query / no matches, "3 of 17" when navigating.

Tests to add or update:
- No JS test harness covers the desktop frontend today (the workspace's only test runners are paperboy-converter and paperboy-widget). Do not invent a new harness for this task. Manual verification via the built .app is sufficient; record the 10-step smoke from Finding 1 in the reply.
- If `node --check` on the edited JS files fails, fix the syntax before declaring done.

Commands to run (capture exit codes):
```text
node --check paperboy-app/src/scripts/editor.js                                            # exit 0
node --check paperboy-app/src/scripts/bridge.js                                            # exit 0
grep -n "data-find-overlay\|data-find-input\|data-replace-input" paperboy-app/src/index.html  # ≥ 3 hits
grep -n ".find-overlay" paperboy-app/src/styles/app.css                                    # ≥ 1 hit
grep -n "Find\|find_open\|CmdOrCtrl+F" paperboy-app/src-tauri/src/main.rs                  # document result in reply
npm run build:converter -w paperboy-app                                                    # exit 0
npm run build --workspaces --if-present                                                    # exit 0
npm test --workspaces --if-present                                                         # exit 0 (existing 31 tests)
```

Definition of done:
- Cmd+F opens the overlay; Esc closes it. Enter advances to next match; Shift+Enter to previous. Both wrap.
- Replace replaces the current match and advances. Replace All replaces all matches and shows the toast.
- Aa toggle flips case sensitivity. Counter shows `N of M` and updates as you type.
- No matches → Prev/Next/Replace/Replace All disabled; counter shows `0 of 0`.
- Pressing Cmd+F while in preview-only view switches view back to editor and opens overlay (preferred; if you pick the other option, justify in the reply).
- All workspace builds + tests stay green; both edited JS files pass `node --check`; CSS still parses (no build step for CSS, but the app must render without console errors after the change).
- No regression in existing Cmd-modifier shortcuts (B/I/K/`/X/[/]/S/O/N/W) — verify in manual smoke.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Should we ship a regex toggle in this turn, or defer to a follow-up? My recommendation: defer regex; keep the Aa case-sensitivity toggle. Regex is a power-user feature, and the spec only says "Find/Replace overlay (Cmd+F)". State your choice in the reply.
- When the overlay is open and the user clicks back into the textarea, should the overlay stay open (Sublime/VS Code behaviour — yes) or auto-close (Apple TextEdit behaviour — no)? Recommend "stay open"; revisit on UX feedback.
- Animation: the existing toast fades in over 180ms. Match that for the overlay or instant-show? Recommend instant (overlay is interactive UI, not a transient notification).

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
4.9 not yet implemented in source: no find UI, no Cmd+F handler, no overlay markup/CSS, no Tauri menu accel. Build the overlay per Finding 1's spec (Cmd+F open, Esc close, Enter/Shift+Enter navigate, regex-based Replace All per Finding 3 to avoid index-shift bugs, Aa toggle, counter, info toast on Replace All). Verify no existing Tauri Edit→Find menu accelerator (Finding 2). Defer regex toggle; recommend "stay open on focus return". Exact HTML/CSS/JS sketches inlined.
