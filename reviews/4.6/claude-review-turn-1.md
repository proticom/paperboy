# 4.6 - Review Turn 1

## Task Context
- Task id: 4.6
- Task title: Add in-window drag-and-drop file import
- Dashboard implementation status: todo (verified NOT started in the repo)
- Review status: in_review → waiting_for_builder
- Spec sections: plan item **4.6** — "Add in-window drag-and-drop file import": dragging a file onto the app
  window (the webview, not just the Dock icon) imports/opens it, reusing the existing open pipeline.
- Files inspected:
  - `paperboy-app/src-tauri/tauri.conf.json` (`app.windows[0]` — `dragDropEnabled` is `null`, i.e. Tauri v2
    default `true`, which routes OS file drops to the NATIVE drag-drop channel, not HTML5 drop events)
  - `paperboy-app/src/index.html` (only `data-window-drag` / `data-tauri-drag-region` titlebar regions; no
    drop zone or drop styling)
  - `paperboy-app/src/scripts/bridge.js` (imports/tauri object L1-18; `currentWindow` =
    `getCurrentWebviewWindow()` L14; `listen` L15; init block L116-121 runs `setupMenuListeners`,
    `setupWindowDrag`, `checkInitialFile`, `drainPendingOpens`; the single open funnel
    `loadFileIntoCurrentTab(path)` L373-420; `drainPendingOpens` L328-342; `maybeProceed` L344-354;
    `createTab` usage; `setupWindowDrag` L559+ is pointer-drag for moving the window, unrelated)
  - `paperboy-app/src/scripts/*.js` and `src/*.css` (no file-drop handler anywhere)
- Commands run:
  - `grep -rn "onDragDropEvent\|DragDrop\|dragdrop\|tauri://drag-drop\|drag-drop\|drag-over\|drag-enter" src/ --include=*.js --include=*.html --include=*.css | grep -v vendor` → **no matches (exit 1)**
  - `grep -rn "dragDrop\|fileDropEnabled\|dragDropEnabled" src-tauri/tauri.conf.json` → **no matches (exit 1)**
  - `jq '.app.windows[0] | {label, dragDropEnabled}' src-tauri/tauri.conf.json` → `dragDropEnabled: null`
  - `grep -n "setupMenuListeners\|setupWindowDrag\|checkInitialFile\|drainPendingOpens" src/scripts/bridge.js` → init at L116-121 (no file-drop setup)
- Current claim being verified: none — `reply: null` in the queue, no implementation in the repo. Reviewing
  the current repo state as turn 1.
- Result: NOT started. No webview drag-drop handler, no drop zone, no drop-affordance styling, no config to
  enable HTML5 drop. The only "drag" code is titlebar window-move and the macOS Dock/"Open With" path
  (`RunEvent::Opened` → `drainPendingOpens`), which is a different feature (4.x), not in-window drop.

## Findings

### Finding 1: No in-window drag-and-drop file import exists
- Severity: required (this is the entire 4.6 deliverable)
- Location: `paperboy-app/src/scripts/bridge.js` (init block L116-121; should reuse the single funnel
  `loadFileIntoCurrentTab` L373); `paperboy-app/src/index.html` (drop-target container, e.g. `.content-area`
  or `<body>`); `paperboy-app/src/styles/*.css` (drag-over affordance). Tauri config check:
  `paperboy-app/src-tauri/tauri.conf.json` `app.windows[0].dragDropEnabled`.
- Problem: dragging a file onto the window does nothing — there is no listener for file drops and no drop
  zone. Users can only open via the menu/dialog, double-click in Finder, or the deep link.
- Spec mismatch / risk: 4.6 requires in-window drag-and-drop import; it is entirely absent.
- Required fix: add a webview drag-drop listener that, on a successful drop, routes each dropped path through
  the existing single open funnel `loadFileIntoCurrentTab(path)` (this also makes drops populate the 4.5
  recent-files list for free, since recording happens inside that funnel). Add a visible drag-over affordance
  and remove it on drop/leave/cancel. Honor the unsaved-changes guard (`maybeProceed`) for the active tab,
  and spawn a new tab when the current tab already holds a file/dirty content (mirror `drainPendingOpens`).
- Code sample / exact change:
```js
// bridge.js — add to the init block (after drainPendingOpens, ~L121)
setupFileDrop();

// Tauri v2 delivers native file drops via the webview's onDragDropEvent (absolute paths),
// NOT HTML5 'drop' events, while dragDropEnabled is the default (true). Use it and funnel
// through loadFileIntoCurrentTab so drops reuse the same open pipeline (and recent-files).
async function setupFileDrop() {
  const root = document.querySelector(".content-area") || document.body;
  const webview = tauri.webviewWindow?.getCurrentWebviewWindow?.() || currentWindow;
  if (!webview?.onDragDropEvent) return;
  await webview.onDragDropEvent(async ({ payload }) => {
    if (payload.type === "over" || payload.type === "enter") {
      root.classList.add("drag-over");
    } else if (payload.type === "leave" || payload.type === "cancel") {
      root.classList.remove("drag-over");
    } else if (payload.type === "drop") {
      root.classList.remove("drag-over");
      for (const path of payload.paths || []) {
        if (typeof path !== "string" || !path) continue;
        if (state.currentFile || state.isDirty) createTab();
        // respect unsaved-changes prompt for the very first drop into a dirty current tab
        await maybeProceed(() => loadFileIntoCurrentTab(path));
      }
    }
  });
}
```
```css
/* styles — drag-over affordance (sharp corners per brand; no rounded SaaS look) */
.content-area.drag-over { outline: 2px dashed var(--accent, currentColor); outline-offset: -8px; }
```
- Validation:
```text
grep -n "onDragDropEvent\|setupFileDrop" paperboy-app/src/scripts/bridge.js   # handler present + wired in init
grep -n "drag-over" paperboy-app/src/index.html paperboy-app/src/styles/*.css # affordance present
npm run build:converter -w paperboy-app                                       # exit 0 (JS bundles)
npm run build  --workspaces --if-present                                      # exit 0
npm test       --workspaces --if-present                                      # exit 0
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: Add in-window drag-and-drop file import. Dropping one or more files onto the app window imports
them through the existing single open funnel `loadFileIntoCurrentTab`, with a visible drag-over affordance.
Reuse the same pipeline as menu/double-click opens so dropped files also land in the 4.5 recent-files list.

Files to edit:
- `paperboy-app/src/scripts/bridge.js` — add `setupFileDrop()` and call it in the init block (after
  `drainPendingOpens()` around L121). Implement it with the webview's `onDragDropEvent` (Tauri v2 native
  drag-drop — it delivers absolute file paths). On `enter`/`over` add a `drag-over` class to a drop root
  (`.content-area` or `<body>`); on `leave`/`cancel`/`drop` remove it; on `drop`, for each path: if the
  current tab already has a file or is dirty, `createTab()` first (mirror `drainPendingOpens` L337-340), then
  open via `loadFileIntoCurrentTab(path)`. Use `maybeProceed` for the first drop into a dirty current tab so
  unsaved work isn't clobbered silently. Guard the whole thing so it no-ops cleanly when not running under
  Tauri (no `onDragDropEvent`).
- `paperboy-app/src/index.html` and/or `paperboy-app/src/styles/*.css` — add a `drag-over` visual affordance
  on the drop root (sharp-corner outline/border per brand; do NOT add rounded/glow SaaS styling).

Files not to edit:
- `setupWindowDrag` / `data-window-drag` / `data-tauri-drag-region` (titlebar window-move — unrelated).
- The `RunEvent::Opened` / `drainPendingOpens` Dock/"Open With" path (that is the OS-level open, not in-window
  drop) — do not change its behavior.
- The 4.5 recent-files wiring and the converter vendor bundle.

Exact changes: see the JS + CSS sketches in Finding 1.

Data shapes / CLI examples:
- `onDragDropEvent` payloads: `{ type: "enter"|"over"|"leave"|"cancel"|"drop", paths?: string[], position? }`.
  Only the `drop` payload carries `paths` (absolute file paths).
- If you choose to set `dragDropEnabled` explicitly in `tauri.conf.json`, keep it `true` (the default) so the
  native `onDragDropEvent` channel stays active. Do NOT set it `false` (that would route to HTML5 drop events
  which don't expose absolute paths and would require a different, weaker implementation). Leaving it `null`
  is also fine since the default is `true`.

Tests to add or update:
- No JS unit harness for the app. Verify by reading: (a) `setupFileDrop` is wired into the init block;
  (b) the drop handler funnels through `loadFileIntoCurrentTab`; (c) a drag-over affordance toggles on
  enter/over and clears on leave/cancel/drop; (d) multi-file drop opens each in its own tab. Runtime smoke
  (drag a .docx/.md onto the window, see it import + appear in Open Recent) is covered by the app-smoke task
  family — not required here.

Commands to run (capture exit codes):
```text
grep -n "onDragDropEvent\|setupFileDrop" paperboy-app/src/scripts/bridge.js
grep -n "setupFileDrop" paperboy-app/src/scripts/bridge.js                    # called in init block
grep -rn "drag-over" paperboy-app/src/                                        # affordance present
npm run build:converter -w paperboy-app                                       # exit 0
npm run build  --workspaces --if-present                                      # exit 0
npm test       --workspaces --if-present                                      # exit 0
```

Definition of done:
- Dropping a file onto the app window imports/opens it via `loadFileIntoCurrentTab` (so it also records to the
  4.5 recent-files list); dropping multiple files opens each in its own tab.
- A visible drag-over affordance appears while hovering a dragged file and clears on drop/leave/cancel.
- Unsaved work in the current tab is not silently clobbered (new tab or `maybeProceed` guard).
- The handler no-ops cleanly outside Tauri; workspace build/test stay green.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Drop root scope: `.content-area` vs whole `<body>`. Whole-window is friendlier (drop anywhere works); if you
  scope to `.content-area`, ensure the titlebar/tab-bar region also accepts drops or document the limitation.
  Either is acceptable for 4.6 — state your choice in the reply.
- Filter by extension on drop: optional. `loadFileIntoCurrentTab` already routes through the converter and
  surfaces an import error for unsupported types, so pre-filtering is nice-to-have, not required.

## Decision
send_to_builder
