# 4.12 - Review Turn 1

## Task Context
- Task id: 4.12
- Task title: Wire or remove unused headingId editor action
- Dashboard implementation status: in_progress (queue auto-routed task to reviewer at turn 1; no build commit exists yet — see Finding 1)
- Review status: in_review → waiting_for_builder
- Spec section (plan, Phase 4 line 102): "**4.12** Wire or remove unused headingId editor action."
- Files inspected:
  - `paperboy-app/src/scripts/editor.js`:
    - L77-88: `formatAction(textarea, actionType, options)` dispatch switch. L86: `if (actionType === "headingId") return appendHeadingId(textarea);` — the ONLY caller of `appendHeadingId`.
    - L116-122: `appendHeadingId(textarea)` definition. It appends ` {#custom-id}` (markdown-it-attrs / Pandoc attribute syntax) to the current line and selects the `custom-id` literal so the user can type a replacement id.
  - `paperboy-app/src/index.html` (L50-130 toolbar block): full inventory of `data-action` values = `prefix` (H1/H2/H3, bullet, ordered, task), `wrap` (bold, italic, strike, highlight, code, sup, sub), `prefixToggle` (blockquote), `insert` (HR, table), `blockWrap` (code block), `link`, `image`, `footnote`. **`headingId` is NOT present as a toolbar button.** `footnote` IS wired (L122). The H1/H2/H3 buttons use `prefix` with `# `/`## `/`### `, never `headingId`.
  - `paperboy-app/src/scripts/editor.js` keyboard map (L13-33): chord keys are `Tab`, `Cmd+B/I/K/Shift+K/`` `/Shift+``/Shift+X/[/]`. **No keyboard chord fires `headingId`.**
- Commands run:
  - `grep -rn "headingId" paperboy-app/src/ --include="*.js" --include="*.html" --include="*.css"` → 1 source hit: `editor.js:86` (dispatch) + `editor.js:116` (definition). The other hits are in vendored `paperboy-app/src/scripts/vendor/converter.js` (unrelated: turndown's HTML→md path that *reads* heading IDs from the DOM during conversion) and `paperboy-ext/sidepanel.bundle.js` (same vendored converter, unrelated).
  - `grep -rn "headingId\|custom-id" paperboy-app/src/index.html paperboy-app/src/styles/` → 0 hits.
  - `jq '.tasks[] | select(.id == "4.12") | {id, title, status, review_status}' reviews/paperboy-review-queue.json` (via the dashboard JSON) confirms task title is "Wire or remove unused headingId editor action".
  - `git log --oneline -3` → last commit on `main` is `8e22e86` (4.11 review_passed); no 4.12 commit exists.
- Current claim being verified: none. Queue auto-activated 4.12 when 4.11 closed; treating as a turn-1 spec review and routing the work to the builder via the Builder Prompt below.

## Findings

### Finding 1: `headingId` action is unreachable from the UI; entire feature is dead code
- Severity: required
- Location:
  - `paperboy-app/src/scripts/editor.js` L86 (dispatch arm).
  - `paperboy-app/src/scripts/editor.js` L116-122 (`appendHeadingId` definition).
- Problem: `formatAction` has a branch `if (actionType === "headingId") return appendHeadingId(textarea);` but NO toolbar button has `data-action="headingId"`, and no keyboard chord in the `keydown` map dispatches to it. The dispatch is unreachable; `appendHeadingId` has zero call sites outside the dispatch arm. The plan calls this out explicitly as a Phase 4 cleanup item.
- Spec mismatch / risk: The 4.12 plan line literally says "**Wire or remove** unused headingId editor action." Two valid resolutions:
  1. **Wire it** — add a toolbar button (e.g. an `# id` glyph in the headings group) that fires `data-action="headingId"`, so a user can append `{#custom-id}` to the current line.
  2. **Remove it** — delete the dispatch arm and the `appendHeadingId` function.
  
  Given Phase 4's overall tone (feature *completeness*, not feature *expansion*) and that the broader product doesn't expose any other Pandoc/markdown-it-attrs syntax in the toolbar (no class, no key=value attribute helpers), the **remove** path is cleaner: it removes ~8 lines of dead code, keeps the toolbar surface small, and matches the surrounding cleanup tasks (4.3 "Clean dead Rust commands" is the same shape — strip unreachable handlers). If we later want heading anchors we can re-add a coherent attribute-syntax helper at that time.
- Required fix (Builder: choose the **remove** path):
  1. **`paperboy-app/src/scripts/editor.js`** — delete L86 (the dispatch arm) and L116-122 (the `appendHeadingId` function and its blank trailing line).
  2. Leave the `footnote` action and every other dispatch arm untouched (they are all reachable).
  3. No HTML, CSS, or `bridge.js` changes — `headingId` has no current UI surface.
- Code sample / exact change:
  ```text
  # editor.js current (L82-88):
        if (actionType === "indent") return indentLines(textarea, options.amount);
        if (actionType === "link") return replaceRange(textarea, `[${selected || "link text"}](url)`, !selected, selected ? selected.length + 3 : 1, selected ? selected.length + 3 : 10);
        if (actionType === "image") return replaceRange(textarea, "![alt text](image-url)", true, 2, 10);
        if (actionType === "headingId") return appendHeadingId(textarea);       <-- DELETE this line
        if (actionType === "footnote") return insertFootnote(textarea);
      }

  # editor.js current (L114-123):
      }

      function appendHeadingId(textarea) {                                       <-- DELETE
        const [lineStart, lineEnd] = lineRange(textarea);                        <-- DELETE
        const line = textarea.value.slice(lineStart, lineEnd).replace(/\s*\{#custom-id\}$/, "");  <-- DELETE
        const next = `${line} {#custom-id}`;                                     <-- DELETE
        textarea.value = `${textarea.value.slice(0, lineStart)}${next}${textarea.value.slice(lineEnd)}`;  <-- DELETE
        textarea.setSelectionRange(lineStart + next.length - 10, lineStart + next.length - 1);  <-- DELETE
      }                                                                          <-- DELETE
  ```
- Validation:
```text
grep -rn "headingId\|appendHeadingId" paperboy-app/src/scripts/      # MUST show 0 hits (excluding vendor/ which is unrelated)
grep -rn "headingId\|appendHeadingId" paperboy-app/src/scripts/editor.js  # MUST show 0 hits
grep -n "appendFootnote\|insertFootnote\|footnote" paperboy-app/src/scripts/editor.js  # footnote dispatch + helper still present
node --check paperboy-app/src/scripts/editor.js                       # exit 0
node --check paperboy-app/src/scripts/bridge.js                       # exit 0 (no edit, but sanity)
( cd paperboy-app/src-tauri && cargo check )                           # exit 0 (no Rust changes, but sanity)
npm run build --workspaces --if-present                                # exit 0
npm test --workspaces --if-present                                     # exit 0 (31 tests still pass)
```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 4.12.

Objective: Remove the unreachable `headingId` editor action from `paperboy-app/src/scripts/editor.js`. The action has no toolbar button and no keyboard chord — it is dead code. After the change, every remaining `formatAction` dispatch arm must still have a real UI caller. No other workspaces are touched.

Files to edit:
- `paperboy-app/src/scripts/editor.js` — delete two regions:
  1. The single line `if (actionType === "headingId") return appendHeadingId(textarea);` inside `formatAction` (currently L86, between the `image` and `footnote` arms).
  2. The entire `function appendHeadingId(textarea) { … }` definition (currently L116-122, between `indentLines` and `insertFootnote`).

Files NOT to edit:
- `paperboy-app/src/index.html` — no toolbar/HTML changes; `headingId` was never wired here.
- `paperboy-app/src/styles/app.css` — no CSS changes.
- `paperboy-app/src/scripts/bridge.js` — no caller exists; do not touch.
- `paperboy-app/src/scripts/vendor/converter.js` — unrelated `headingId` reference (turndown HTML→md handler that reads heading element IDs during conversion); leave alone.
- `paperboy-app/src-tauri/**` — no Rust changes.
- Any other workspace (`paperboy-cli`, `paperboy-ext`, `paperboy-widget`, `paperboy-converter`, `paperboy-site`).

Exact changes: see the diff blocks in Finding 1.

Tests to add or update: none. The desktop renderer has no JS test harness; verify via the grep + build commands below.

Commands to run (capture exit codes in your reply):
```text
grep -rn "headingId\|appendHeadingId" paperboy-app/src/scripts/editor.js   # 0 hits
grep -rn "headingId\|appendHeadingId" paperboy-app/src/scripts/             # 0 hits (vendor/ is fine to exclude or just confirm 0 in the editor.js + bridge.js paths)
grep -n "data-action" paperboy-app/src/index.html | grep -i headingId       # 0 hits
node --check paperboy-app/src/scripts/editor.js                              # exit 0
node --check paperboy-app/src/scripts/bridge.js                              # exit 0
( cd paperboy-app/src-tauri && cargo check )                                  # exit 0
npm run build --workspaces --if-present                                       # exit 0
npm test --workspaces --if-present                                            # exit 0 (31 tests still pass)
```

Definition of done (turn 1):
- `formatAction` no longer has a `headingId` dispatch arm.
- `appendHeadingId` is gone from the file.
- All other `formatAction` arms (`wrap`, `blockWrap`, `prefix`, `prefixToggle`, `insert`, `indent`, `link`, `image`, `footnote`) remain intact and reachable.
- `node --check editor.js` and `node --check bridge.js` both exit 0.
- `cargo check` still green, all workspace builds + 31 tests still pass.
- No changes outside `paperboy-app/src/scripts/editor.js`.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Wire-vs-remove: I'm directing **remove** because (a) `headingId` has no current UI surface and no other Pandoc-attribute helpers exist in the toolbar (it would be a one-off); (b) Phase 4's neighboring tasks lean cleanup-oriented (4.3 strips dead Rust commands too); (c) re-adding a coherent attribute-syntax helper later is cheap if the product later wants heading anchors. If the user prefers Wire instead, the alternative is a 3-file diff: a new `<button data-action="headingId">` in the headings group (toolbar L52-60), a small icon, and the existing dispatch already works — but I'd want a clearer product motivation before adding toolbar surface for syntax that no other action exposes.

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
4.12 turn 1: `headingId` action in editor.js is unreachable — no toolbar button, no key chord, no caller anywhere. Send to builder: delete the dispatch arm at L86 and the `appendHeadingId` function at L116-122. Leave every other action (footnote, link, etc.) intact. No HTML/CSS/bridge/Rust changes. Validation: `grep headingId paperboy-app/src/scripts/editor.js` → 0 hits, full workspace build + 31 tests still green.
