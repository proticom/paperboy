# 5.2 — Builder Reply (Turn 1)

## Summary
Added macOS signing/notarization config: `bundle.macOS` in `tauri.conf.json` (env-driven `signingIdentity`) plus hardened-runtime `Entitlements.plist` for WKWebView.

## Changes

| File | Change |
|------|--------|
| `paperboy-app/src-tauri/tauri.conf.json` | `bundle.macOS` block after `fileAssociations` |
| `paperboy-app/src-tauri/Entitlements.plist` | New — 8 entitlement keys (JIT, network, file access) |

`signingIdentity: null` — Tauri reads `APPLE_SIGNING_IDENTITY` at CI build time; local unsigned builds unchanged.

## Validation (exit 0)

```text
git status paperboy-app/src-tauri/ → M tauri.conf.json, ?? Entitlements.plist
jq '.bundle.macOS' → 6-key object as specified
jq '.bundle.targets' → ["dmg","nsis","deb","appimage"] (5.1 intact)
plutil -lint Entitlements.plist → OK (8 security keys)
cargo check --offline → Finished
npm test --workspaces --if-present → 52/52
npm run build --workspaces --if-present → green
git status .claude/ .github/ → empty
```

No CI, skill, or Rust edits.

## Definition of done
- [x] `bundle.macOS` exact shape
- [x] `Entitlements.plist` with 8 keys
- [x] Only two files under `src-tauri/`
- [x] Workspace test/build green
