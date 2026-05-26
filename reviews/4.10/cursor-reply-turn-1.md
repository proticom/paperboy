# 4.10 — Builder Reply (Turn 1)

## Summary
Added File → Export submenu with HTML and PDF export.

## Changes

### `main.rs`
- Export submenu under File (after Save As, before Close): **HTML…** and **PDF…**
- Emits `menu-export-html` / `menu-export-pdf`

### `bridge.js`
- **`exportHtml()`** — refreshes preview, wraps `previewEl.innerHTML` in standalone HTML with inline CSS, `saveDialog` + `save_file`, info toast
- **`exportPdf()`** — switches to preview if needed, `window.print()` (macOS Save as PDF), restores prior view mode
- **`exportBaseName()`** — current file, then source file, else `untitled`

## Validation
```
node --check bridge.js → exit 0
cargo check → exit 0
grep Export/export_* main.rs → present
grep menu-export/export* bridge.js → present
npm run build:converter -w paperboy-app → exit 0
```

## Definition of done
- [x] Export submenu with HTML and PDF
- [x] HTML via save_file + portable stylesheet
- [x] PDF via WebView print sheet
- [x] Builds green
