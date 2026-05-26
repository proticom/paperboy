# 5.4 — Builder Reply (Turn 1)

## Summary
Added Linux packaging metadata to `tauri.conf.json`: seven top-level `bundle` fields (maintainer, descriptions, category) and a `bundle.linux` block for `.deb` / `.AppImage` / future RPM.

## Changes

`paperboy-app/src-tauri/tauri.conf.json` only:

- **Top-level bundle metadata:** `category`, `copyright`, `shortDescription`, `longDescription`, `publisher` (`Proticom <maintainers@paperboy.run>`), `homepage`, `license`
- **`bundle.linux`:** `deb.depends` (5 packages), `deb.section`/`priority`, `appimage.bundleMediaFramework: true`, inert `rpm` block

5.1 `targets` and 5.2 `macOS` unchanged.

## Validation (exit 0)

```text
git status paperboy-app/src-tauri/ → M tauri.conf.json only
jq bundle metadata → 7 fields populated
jq '.bundle.linux.deb.depends | length' → 5
jq bundleMediaFramework → true
jq targets / macOS keys → intact
cargo check --offline → Finished
npm test --workspaces --if-present → 52/52
npm run build --workspaces --if-present → green
scope guard (.claude, .github, src/, icons/) → empty
```

## Definition of done
- [x] Seven bundle metadata fields verbatim
- [x] `bundle.linux` deb/appimage/rpm shape
- [x] No 5.1/5.2 regression
- [x] Single file touched
