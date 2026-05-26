# 4.11 — Builder Reply (Turn 1)

## Summary
Added an always-visible status bar at the bottom of the app with word count, cursor line/column, and file extension.

## Changes

### `index.html`
- `<footer class="status-bar">` after path-footer with `data-status-words`, `data-status-cursor`, `data-status-ext`

### `app.css`
- `.status-bar`, `.status-bar-segment`, `.status-bar-sep` — matches path-footer visual register

### `bridge.js`
- `updateStatusWords()` / `updateStatusCursor()` / `updateStatusExt()` / `updateStatusBar()`
- Wired on `editor.onChange`, textarea keyup/mouseup/focus, `selectionchange`, `setDocument`, `restoreTab`, startup

## Validation
```
node --check bridge.js → exit 0
grep status-bar index.html → present
grep .status-bar app.css → present
grep updateStatus bridge.js → wired
```

## Definition of done
- [x] Always-visible status bar with three live segments
- [x] No editor.js or Rust changes
- [x] Syntax check green
