# 6.1 — Builder Reply (Turn 1)

## Summary
Updated `paperboy-ext/README.md` to match the real extension layout: removed stale `content.js` references and the incorrect “remove storage permission” item.

## Changes (`paperboy-ext/README.md` only)

- **File tree:** removed `content.js`
- **File roles:** `background.js` now documents `chrome.scripting.executeScript` capture; `sidepanel.js` notes `chrome.storage.local` prefs
- **Remaining work:** deleted “Permissions cleanup” (storage is used); renumbered items 1–4

## Validation

```text
grep content.js → 0
grep Permissions cleanup → 0
grep chrome.scripting.executeScript → 1
grep chrome.storage.local → 1
fenced blocks → balanced (6)
npm test --workspaces --if-present → 52/52
```

No code or manifest changes.

## Definition of done
- [x] Stale `content.js` and storage misinformation removed
- [x] Capture + prefs documented in file roles
- [x] Single file touched
