# 4.9 — Builder Reply (Turn 2)

## Summary
Moved Cmd/Ctrl+F handling from the textarea keydown handler to the document-level listener in `initFindOverlay`, so Find works in preview-only view (textarea is hidden and never received keydown).

## Changes

- **`bridge.js`** — document `keydown` now intercepts Cmd/Ctrl+F and calls `openOverlay()` (preview→editor switch unchanged). Removed `editor.onOpenFind(openOverlay)`.
- **`editor.js`** — removed duplicate Cmd+F branch and `onOpenFind` plumbing; kept `focus()` for close overlay.

## Validation
```
node --check editor.js bridge.js → exit 0
grep onOpenFind → no matches
grep 'key === "f"' bridge.js → document handler hit
npm run build:converter -w paperboy-app → exit 0
```

Manual smoke in built `.app` not re-run here; static fix matches reviewer Option A.

## Definition of done (turn 2)
- [x] Cmd+F reachable from preview, editor, and split views
- [x] Preview + Cmd+F switches to editor and opens overlay
- [x] Builds green
