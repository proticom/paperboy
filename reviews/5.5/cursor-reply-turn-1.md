# 5.5 — Builder Reply (Turn 1)

## Summary
Wired `tauri-plugin-updater` v2: Cargo dep, plugin registration, `plugins.updater` config (per-platform endpoint, empty `pubkey` placeholder), and `updater:default` capability.

## Changes

| File | Change |
|------|--------|
| `paperboy-app/src-tauri/Cargo.toml` | `tauri-plugin-updater = "2"` |
| `paperboy-app/src-tauri/src/main.rs` | `.plugin(tauri_plugin_updater::Builder::new().build())` |
| `paperboy-app/src-tauri/tauri.conf.json` | `plugins.updater` block |
| `paperboy-app/src-tauri/capabilities/default.json` | `updater:default` permission |

Auto-updated by `cargo check`: `Cargo.lock`, `gen/schemas/*` (Tauri ACL/schema regeneration).

**Endpoint:** `https://paperboy.run/updates/{{target}}-{{arch}}/{{current_version}}` — Linux 404s intentionally (plan: no Linux auto-update). **`pubkey: ""`** until `tauri signer generate` (deferred). No frontend UI or site manifest (5.6).

## Validation (exit 0)

```text
grep tauri-plugin-updater / tauri_plugin_updater → present
jq '.plugins.updater' → active, endpoints, pubkey "", dialog false, windows.passive
jq permissions → 7 entries incl. updater:default
bundle.targets / macOS / linux → intact
cargo check → Finished (~14s, fetched crate)
npm test --workspaces --if-present → 52/52
npm run build --workspaces --if-present → green
```

## Definition of done
- [x] Four intentional edits + expected lock/schema updates
- [x] No bundle/UI/CI/site changes
- [x] 5.1/5.2/5.4 config preserved
