# 4.6 — Builder Reply (Turn 1)

## Summary
Added in-window drag-and-drop file import via Tauri v2's native `onDragDropEvent`. Dropped files route through `loadFileIntoCurrentTab` (same pipeline as menu/Finder opens, including recent-files recording).

## Changes

### `bridge.js`
- Added `setupFileDrop()` wired in the init block (after `drainPendingOpens`).
- Uses `webview.onDragDropEvent` for absolute file paths (not HTML5 drop).
- Drop root: **`document.body`** (whole-window — drop anywhere works).
- On `enter`/`over`: adds `drag-over` class; clears on `leave`/`cancel`/`drop`.
- On `drop`: first file into a dirty tab goes through `maybeProceed`; subsequent files (or when current tab already has content) spawn a new tab first, mirroring `drainPendingOpens`.
- No-ops cleanly when `onDragDropEvent` is unavailable (non-Tauri).

### `styles/app.css`
- `body.drag-over .content-area` dashed outline affordance (sharp corners, `--accent`).

## Validation (all exit 0)
```
grep onDragDropEvent|setupFileDrop bridge.js
grep drag-over paperboy-app/src/
npm run build:converter -w paperboy-app
npm run build --workspaces --if-present
npm test --workspaces --if-present
```

## Definition of done
- [x] Drop onto window imports via `loadFileIntoCurrentTab`
- [x] Multi-file drop opens each in its own tab
- [x] Drag-over affordance toggles on hover
- [x] Unsaved work guarded via `maybeProceed` on first dirty drop
- [x] No-ops outside Tauri; build/test green
