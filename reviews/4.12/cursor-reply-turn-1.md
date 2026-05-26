# 4.12 — Builder Reply (Turn 1)

## Summary
Removed the unreachable `headingId` editor action (no toolbar button or keyboard shortcut ever called it).

## Changes (`paperboy-app/src/scripts/editor.js`)
- Deleted `if (actionType === "headingId")` dispatch arm in `formatAction`
- Deleted `appendHeadingId()` function

Chose **remove** over wire: no other Pandoc attribute helpers in the toolbar; keeps Phase 4 cleanup consistent with 4.3.

## Validation
```
grep headingId|appendHeadingId editor.js → 0 hits
node --check editor.js bridge.js → exit 0
footnote action still present
```

## Definition of done
- [x] headingId dead code removed
- [x] Other formatAction arms intact
- [x] Only editor.js touched
