# 4.9 - Review Turn 3

## Task Context
- Task id: 4.9
- Task title: Add Find/Replace overlay (Cmd+F)
- Dashboard implementation status: in_progress
- Review status: waiting_for_reviewer (turn 3)
- Spec sections: same as turns 1-2. Reviewing cursor's builder reply at `reviews/4.9/cursor-reply-turn-2.md` against the turn-2 contract at `reviews/4.9/claude-review-turn-2.md`.
- Files inspected (turn 3):
  - `paperboy-app/src/scripts/editor.js` (156 lines, was 164) — Cmd+F branch and `onOpenFind` plumbing REMOVED. Textarea keydown handler at L13-33 no longer references `"f"` or `onOpenFind`. Returned object at L43-... no longer exposes `onOpenFind` (the setter is gone). `focus()` is retained for `closeOverlay`.
  - `paperboy-app/src/scripts/bridge.js` (870 lines, was 781) — document-level Cmd+F intercept now at L766-785, sitting alongside the existing Cmd+G logic. `openOverlay()` at L660-681 unchanged: switches preview→editor at L661-663 before opening, so a Cmd+F press in preview view now reaches the handler (since it's on `document`, not the hidden textarea), triggers the switch, and opens the overlay. `editor.onOpenFind(openOverlay)` call gone — confirmed via grep.
  - `replaceAll()` at L705-718 — still single-pass regex `textarea.value.replace(re, replacement)` with `match(re)` for count. No index-shift hazard.
- Commands run (turn 3):
  - `grep -n "onOpenFind" paperboy-app/src/scripts/editor.js paperboy-app/src/scripts/bridge.js` -> 0 matches (confirmed plumbing removed)
  - `grep -n 'key === "f"\|key.toLowerCase() === "f"\|"f" &&' paperboy-app/src/scripts/bridge.js paperboy-app/src/scripts/editor.js` -> 1 hit: `bridge.js:770:    if (key === "f" && !event.shiftKey) {` (document handler only)
  - `node --check paperboy-app/src/scripts/editor.js` -> exit 0
  - `node --check paperboy-app/src/scripts/bridge.js` -> exit 0
  - `npm run build:converter -w paperboy-app` -> exit 0 (Bundled converter -> src/scripts/vendor/converter.js)
  - `npm run build --workspaces --if-present` -> exit 0 (converter / ai / cli / ext / widget all build; sidepanel.bundle.js 293.4kb; paperboy-widget.min.js 35.7kb)
  - `npm test --workspaces --if-present` -> exit 0, 31 tests pass (19 CLI in 5 files + 12 widget)

## Findings

### Finding 1 (resolved): Cmd+F unreachable in preview view — FIXED
- Severity: resolved (was: required in turn 2)
- Location: `paperboy-app/src/scripts/bridge.js:766-785` (new document-level handler), `paperboy-app/src/scripts/editor.js:13-33` (textarea handler, Cmd+F branch removed), `paperboy-app/src/scripts/bridge.js:660-681` (`openOverlay`).
- Status: The turn-2 required fix has been correctly applied:
  - Cmd+F intercept moved to document-level handler in `initFindOverlay` at `bridge.js:766-785`, immediately before the Cmd+G logic. Both share one listener; Cmd+F returns early after `openOverlay()`.
  - `openOverlay()` at `bridge.js:660-681` flips view to editor at L661-663 when called from preview view, then opens the overlay and focuses the find input. Since the keydown is on `document`, the textarea being `display: none` no longer breaks reachability.
  - Duplicate Cmd+F branch in `editor.js` removed; `onOpenFind` callback plumbing (the let-binding, the setter on the returned object, and the `editor.onOpenFind(openOverlay)` call site in bridge.js) all gone. `focus()` retained for `closeOverlay()`.
- Code (the new document handler, verbatim from `bridge.js:766-785`):
  ```js
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
  ```
- Validation:
  ```text
  grep -n "onOpenFind" paperboy-app/src/scripts/editor.js paperboy-app/src/scripts/bridge.js   # 0 matches
  grep -n 'key === "f"' paperboy-app/src/scripts/bridge.js paperboy-app/src/scripts/editor.js  # 1 hit: bridge.js:770 (document handler only)
  node --check paperboy-app/src/scripts/editor.js                                              # exit 0
  node --check paperboy-app/src/scripts/bridge.js                                              # exit 0
  npm run build:converter -w paperboy-app                                                      # exit 0
  npm run build --workspaces --if-present                                                      # exit 0
  npm test --workspaces --if-present                                                           # exit 0, 31 tests
  ```

Other turn-1 findings remain satisfied: regex-based Replace All at `bridge.js:705-718` (`textarea.value.replace(re, replacement)`) avoids index shift; no Tauri `CmdOrCtrl+F` menu accelerator in `src-tauri/src/main.rs`; no DOM/Rust conflict. No new findings introduced.

## Builder Prompt

N/A — no further builder action required.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix (none remain)
- [x] Every required finding has a validation command (none remain)
- [x] Code samples or exact data/CLI examples are included where useful (in prior turns)
- [x] Open questions are listed below, or "No open questions"

Open questions: None.

## Decision
review_passed

## Notes (becomes the dashboard `--note`)
4.9 turn 3: Cmd+F intercept moved to document-level handler in bridge.js (L766-785) alongside Cmd+G; editor.js Cmd+F branch + onOpenFind plumbing fully removed; openOverlay() handles preview->editor switch. Builds green across all workspaces, 31 tests pass. Replace All still single-pass regex. PASS.
