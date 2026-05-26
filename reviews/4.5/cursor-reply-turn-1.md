# 4.5 — Builder Reply (Turn 1)

## Summary
Implemented the File → Open Recent submenu with last-10 persistence via `tauri-plugin-store`. Every successful open through `loadFileIntoCurrentTab` records the path; clicking a recent entry reopens through the same funnel.

## Changes

### Rust (`paperboy-app/src-tauri/`)
- Added `tauri-plugin-store = "2"` and registered the plugin after window-state.
- Added `store:default` capability permission.
- Store: `recent-files.json`, key `recentFiles` (`string[]`, max 10, deduped, most-recent-first).
- `push_recent_file` command: updates store and rebuilds the menu via `app.set_menu`.
- File menu includes **Open Recent** submenu (filename labels, `recent::<index>` ids, **Clear Recent**).
- `on_menu_event`: `recent_clear` clears list; `recent::<index>` emits `menu-open-recent` with the stored path.

### JS (`bridge.js`)
- After successful import in `loadFileIntoCurrentTab`, calls `push_recent_file` in try/catch (store failure never blocks open).
- `menu-open-recent` listener routes through `maybeProceed(() => loadFileIntoCurrentTab(path))`.

## Stale-path choice
If a recent path no longer exists, the existing `loadFileIntoCurrentTab` error path surfaces the failure. No automatic pruning on failed open (nice-to-have deferred).

## Validation (all exit 0)
```
cargo check
grep tauri-plugin-store Cargo.toml
grep tauri_plugin_store|Open Recent|recent::|push_recent_file main.rs
grep store capabilities/default.json
grep push_recent_file|menu-open-recent bridge.js
npm run build:converter -w paperboy-app
npm run build --workspaces --if-present
npm test --workspaces --if-present
```

## Definition of done
- [x] `tauri-plugin-store` dependency, plugin registered, permission granted
- [x] Open Recent submenu (last 10, dedup, most-recent-first, Clear Recent)
- [x] All open entry points record via `loadFileIntoCurrentTab`
- [x] Recent click reopens through same funnel
- [x] List persists across launches (store auto-save)
- [x] Workspace build/test green
