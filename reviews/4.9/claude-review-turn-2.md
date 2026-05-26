# 4.9 - Review Turn 2

## Task Context
- Task id: 4.9
- Task title: Add Find/Replace overlay (Cmd+F)
- Dashboard implementation status: in_progress
- Review status: waiting_for_reviewer (turn 2)
- Spec sections: same as turn 1. Reviewing cursor's builder reply at `reviews/4.9/cursor-reply-turn-1.md` against the turn-1 contract at `reviews/4.9/claude-review-turn-1.md`.
- Files inspected (turn 2):
  - `paperboy-app/src/index.html` — overlay markup lines 142-163 (find/replace inputs, prev/next, Aa toggle, Replace/All, Close).
  - `paperboy-app/src/styles/app.css` — `.find-overlay` styles lines 575-660. `.content-area` likely got `position: relative` (per reply). Verified `.find-overlay[hidden] { display: none; }` at L592.
  - `paperboy-app/src/scripts/editor.js` (164 lines) — Cmd+F intercept at L21-25 on the textarea keydown handler; `onOpenFind(callback)` setter at L54.
  - `paperboy-app/src/scripts/bridge.js` — `initFindOverlay(...)` at L564-781; boot call at L115. State, `escapeRegex`, `enumerateMatches` (via `value.matchAll`), `recompute`, `nextMatch` (with wrap), `openOverlay` (preview→editor switch), `closeOverlay`, `replaceOne`, `replaceAll` (regex-based, single-pass — no index shift), Cmd+G document handler at L768-780.
  - `paperboy-app/src-tauri/src/main.rs` — confirmed NO `CmdOrCtrl+F` or Edit→Find menu accelerator (only Finder filesystem references). DOM-level handling is non-conflicting where reachable.
- Commands run (turn 2):
  - `node --check paperboy-app/src/scripts/editor.js` → exit 0
  - `node --check paperboy-app/src/scripts/bridge.js` → exit 0
  - `grep "data-find-overlay|data-find-input|data-replace-input" paperboy-app/src/index.html` → 3+ hits (overlay markup present)
  - `grep ".find-overlay" paperboy-app/src/styles/app.css` → 4 hits (styles present)
  - `grep onOpenFind|initFindOverlay bridge.js editor.js` → wired (editor.js L54, bridge.js L115/L720)
  - `npm run build:converter -w paperboy-app` → exit 0 (Bundled converter -> src/scripts/vendor/converter.js)
  - `npm run build --workspaces --if-present` → exit 0 (converter / ai / cli / ext / widget all build)
  - `npm test --workspaces --if-present` → exit 0, 31 tests pass (19 CLI + 12 widget)
  - `cargo check` (with CARGO_TARGET_DIR cache) → exit 0
  - `grep "Find|find_open|CmdOrCtrl+F" paperboy-app/src-tauri/src/main.rs` → only Finder filesystem references; no Find menu accelerator
- Current claim being verified: cursor's reply claims all DoD items satisfied including "Preview + Cmd+F: switches to editor view, then opens overlay."

## Findings

### Finding 1: Cmd+F is unreachable in preview-only view (contradicts cursor's explicit design choice)
- Severity: required
- Location: `paperboy-app/src/scripts/editor.js:14-39` (keydown handler is bound to the textarea, not the document), `paperboy-app/src/styles/app.css:441-443` (preview view hides `.editor-pane` with `display: none`), `paperboy-app/src/scripts/bridge.js:660-681` (`openOverlay` handles the preview→editor switch correctly IF it ever runs).
- Problem: The Cmd+F intercept lives on `textarea.addEventListener("keydown", …)` in `editor.js:14`. When the user is in preview-only view (`.content-area[data-view-mode="preview"]`), the `.editor-pane` is `display: none`, which means the textarea has no focus AND does not receive keydown events. Result: pressing Cmd+F in preview view does nothing — no overlay opens, no view switch fires, no `openOverlay()` ever runs. This directly contradicts cursor's reply ("Preview + Cmd+F: switches to editor view, then opens overlay") and contradicts Finding 1 point 10 from the turn-1 contract. The `if (getViewMode() === "preview") ui.setViewMode("editor")` branch inside `openOverlay` is unreachable from a Cmd+F keypress in preview view.
- Spec mismatch / risk: A user reading a long doc in preview view who wants to search would press Cmd+F and get silence. They'd have to manually click "Source" first. This is exactly the case the turn-1 contract called out as required behavior.
- Required fix: Add a **document-level** keydown listener for Cmd/Ctrl+F (no shift) inside `initFindOverlay`, alongside the existing document-level Cmd+G handler at L768-780. The handler should call `openOverlay()` (which already handles the preview→editor switch internally). Keep the textarea-level handler in `editor.js` so the existing behavior continues to work in editor/split views; the document-level one is the fallback for preview view. If the document handler fires while the textarea has focus and the textarea's listener also fires, that's fine — both call `openOverlay()`, which is idempotent enough (re-prefills find input from selection; calling it twice in the same keypress is harmless because `preventDefault` short-circuits the second). To make it strictly single-fire, prefer ONE of these patterns:
  - **Option A (simpler, recommended):** Replace the editor.js textarea-level Cmd+F intercept with the document-level intercept in `initFindOverlay`. Remove `if (key === "f" && !shift) { … onOpenFind(); … }` from editor.js (and the `onOpenFind` callback plumbing if it has no other caller). The document handler runs regardless of view.
  - **Option B (keep both, dedupe via the editor-pane container):** Keep the textarea listener for editor/split views; add a document listener that ONLY fires when the textarea is not focused. This is more complex and not necessary.
- Code sample / exact change (Option A):
  ```js
  // bridge.js — extend the existing document keydown listener block (currently scoped to "g")
  document.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "f" && !event.shiftKey) {
      // skip if focus is in an input/textarea that is NOT the editor textarea or the find inputs
      // (the find inputs handle Esc/Enter themselves and never produce Cmd+F)
      event.preventDefault();
      openOverlay();
      return;
    }
    if (key !== "g") return;
    // ... existing Cmd+G logic ...
  });

  // editor.js — remove the now-duplicate Cmd+F branch:
  // DELETE lines 21-25 (the `if (key === "f" && !shift)` block) and the `onOpenFind` callback plumbing
  // (let onOpenFind, the setter on the returned object, and the call at L23). Keep `focus()` on the returned object.
  ```
- Validation:
  ```text
  # Manual smoke (record in reply):
  1. Open .app, load a file, switch to preview-only view (View > Preview or click Preview tab).
  2. Press Cmd+F → overlay must open AND view must switch to editor.
  3. Switch to split view, press Cmd+F → overlay opens, view stays split.
  4. Switch to editor view, press Cmd+F → overlay opens.
  # Static:
  grep -n "f\b" paperboy-app/src/scripts/editor.js   # confirm no leftover Cmd+F branch if Option A
  grep -n 'key === "f"\|key.toLowerCase() === "f"' paperboy-app/src/scripts/bridge.js  # confirm document handler picks it up
  node --check paperboy-app/src/scripts/editor.js paperboy-app/src/scripts/bridge.js  # exit 0
  npm run build --workspaces --if-present                                              # exit 0
  ```

## Builder Prompt

Developer/Builder, execute this as a turn-2 follow-up to 4.9.

Objective: Make Cmd/Ctrl+F open the Find/Replace overlay regardless of the current view mode. Today the intercept is bound to the textarea keydown, but the textarea is `display: none` in preview-only mode and therefore does not receive keydown — so Cmd+F is a no-op in preview view. This contradicts the design choice you documented in your turn-1 reply ("Preview + Cmd+F: switches to editor view, then opens overlay").

Files to edit:
- `paperboy-app/src/scripts/bridge.js` — extend the existing document-level keydown handler inside `initFindOverlay` (currently at L768-780, scoped to Cmd+G) to also intercept Cmd/Ctrl+F (no shift) and call `openOverlay()`. `openOverlay` already handles the preview→editor switch internally, so no other logic changes are required.
- `paperboy-app/src/scripts/editor.js` — remove the now-duplicate Cmd+F branch at L21-25 and the `onOpenFind` callback plumbing (`let onOpenFind = () => {};` at L5, the call at L23, the setter on the returned object at L54). The textarea no longer needs to know about Find. Keep the existing `focus()` method on the returned object — `closeOverlay` still calls `editor.focus()`.

Files NOT to edit:
- HTML, CSS, Rust, all other workspaces — no changes needed.

Exact changes:
```js
// bridge.js — replace the existing document keydown handler at L768-780 with:
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

// editor.js — remove lines 5, 21-25, and the onOpenFind setter at L54.
// The returned editor object loses `onOpenFind` (it had one caller — initFindOverlay — which we replace below).

// bridge.js — remove the `editor.onOpenFind(openOverlay);` line at L720 (no longer needed; document handler owns it).
```

Tests to add or update:
- None. No JS test harness for the desktop frontend; this is verified manually + by syntax check + build.

Commands to run (capture exit codes):
```text
node --check paperboy-app/src/scripts/editor.js                                          # exit 0
node --check paperboy-app/src/scripts/bridge.js                                          # exit 0
grep -n "onOpenFind" paperboy-app/src/scripts/editor.js paperboy-app/src/scripts/bridge.js  # expect no matches after removal
grep -n 'key === "f"\|key.toLowerCase() === "f"' paperboy-app/src/scripts/bridge.js      # expect 1 hit (the new doc handler)
npm run build:converter -w paperboy-app                                                  # exit 0
npm run build --workspaces --if-present                                                  # exit 0
npm test --workspaces --if-present                                                       # exit 0 (31 tests)
```

Manual smoke (record results in your turn-2 reply):
```text
1. Open .app, load a file. Press Cmd+F in editor view → overlay opens, find input focused.
2. Esc closes. Switch to preview view (click "Preview" pill). Press Cmd+F → view switches to editor AND overlay opens.
3. Esc closes. Switch to split view. Press Cmd+F → overlay opens, view stays split.
4. Type text, press Enter → next match selected; Shift+Enter → previous; both wrap.
5. Cmd+G (after closing overlay once) → next match; Shift+Cmd+G → previous.
6. Replace All → toast shows count.
```

Definition of done (turn 2):
- Cmd+F opens the overlay from any of the three view modes (editor, preview, split).
- From preview view, Cmd+F flips to editor view AND opens the overlay (single keypress).
- All existing behavior (Esc close, Enter/Shift+Enter navigation, Replace, Replace All, Aa toggle, Cmd+G/Shift+Cmd+G) continues to work.
- All workspace builds + tests stay green; both edited JS files pass `node --check`.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions. The fix is mechanical: move the Cmd+F intercept up to the document level alongside the existing Cmd+G handler.

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
4.9 turn 2: Cmd+F is unreachable in preview-only view. The intercept is bound to the textarea, but the textarea is `display: none` in preview mode and gets no keydown. Contradicts cursor's stated design ("Preview + Cmd+F switches to editor view, then opens"). Fix: move Cmd+F intercept up to the existing document-level keydown handler in `initFindOverlay` (alongside Cmd+G), call `openOverlay()` which already handles the preview→editor switch. Other findings from turn 1 are satisfied: regex-based Replace All avoids index-shift, no Tauri Find accel exists, all builds + 31 tests green.
