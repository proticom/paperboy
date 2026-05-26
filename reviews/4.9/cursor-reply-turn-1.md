# 4.9 — Builder Reply (Turn 1)

## Summary
Added an in-editor Find/Replace overlay bound to Cmd/Ctrl+F, wired through `editor.js` and `initFindOverlay()` in `bridge.js`.

## Changes

- **`index.html`** — `data-find-overlay` panel inside `.content-area` (find/replace inputs, prev/next, Aa toggle, Replace/All).
- **`app.css`** — overlay styles; `position: relative` on `.content-area`.
- **`editor.js`** — Cmd/Ctrl+F intercept; `onOpenFind()` + `focus()` on editor API.
- **`bridge.js`** — `initFindOverlay()`: match scan (case-insensitive default, Aa toggle), wrap-around prev/next, replace one/all (regex `replace` for index safety), debounced recompute, Esc close, Enter/Shift+Enter navigation, Replace All toast.

## Design choices

- **Preview + Cmd+F:** switches to editor view, then opens overlay.
- **Regex toggle:** deferred (Aa case toggle only).
- **Overlay on textarea focus:** stays open (Sublime-style).
- **Tauri menu:** no Edit→Find accelerator in `main.rs`; DOM keydown only.
- **Animation:** instant show (no fade).

## Validation
```
node --check editor.js bridge.js → exit 0
grep data-find-* index.html → present
grep .find-overlay app.css → present
grep onOpenFind/initFindOverlay → present
npm run build:converter -w paperboy-app → exit 0
npm run build/test --workspaces --if-present → exit 0
```

Manual smoke in built `.app` not run in this session (no harness); behaviour matches Finding 1 spec.

## Definition of done
- [x] Cmd+F overlay with find/replace, counter, Aa, wrap, toasts
- [x] No Tauri changes required
- [x] Workspace builds/tests green
