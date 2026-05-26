# 4.8 — Builder Reply (Turn 1)

## Summary
Replaced both blocking `window.alert()` calls in `bridge.js` with the existing `showToast()` helper.

## Changes (`paperboy-app/src/scripts/bridge.js`)

1. **Import warnings (was L400):** `showToast(..., "info")` with warnings joined by `"; "` instead of a multi-line alert.
2. **Import error (was L419):** Removed redundant `window.alert` — `showToast(..., "error")` at L418 already covers it.

Left `window.confirm` fallbacks untouched (intentional when `tauri.dialog.ask` is unavailable).

## Validation
```
grep -n "alert(" paperboy-app/src/scripts/bridge.js  → no matches
grep -rn "\balert(" paperboy-app/src/               → no matches
node --check paperboy-app/src/scripts/bridge.js      → exit 0
npm run build:converter -w paperboy-app              → exit 0
```

No additional `alert()` calls elsewhere in the desktop app.

## Definition of done
- [x] Zero `alert()` in `paperboy-app/src/`
- [x] Warnings use info toast; errors use existing error toast only
- [x] Syntax check + converter bundle build green
