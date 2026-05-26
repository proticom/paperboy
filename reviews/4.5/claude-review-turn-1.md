# 4.5 - Review Turn 1

## Task Context
- Task id: 4.5
- Task title: Add recent files menu (last 10, tauri-plugin-store)
- Dashboard implementation status: todo (verified NOT started in the repo)
- Review status: in_review → waiting_for_builder
- Spec sections: plan item **4.5** — "Add recent files menu (last 10, tauri-plugin-store)": a File-menu
  submenu listing the last 10 opened files, persisted across launches via `tauri-plugin-store`.
- Files inspected:
  - `paperboy-app/src-tauri/Cargo.toml` (deps — no `tauri-plugin-store`)
  - `paperboy-app/src-tauri/Cargo.lock` (no `tauri-plugin-store`)
  - `paperboy-app/src-tauri/src/main.rs` (menu builder `menu()` lines 204-260; plugin chain lines 263-269;
    `invoke_handler` lines 270-281; `setup` lines 282-289; `on_menu_event` lines 290-305)
  - `paperboy-app/src-tauri/capabilities/default.json` (permissions — no `store:*`)
  - `paperboy-app/src/scripts/bridge.js` (menu listeners `setupMenuListeners` ~lines 290-320; the single
    open funnel `loadFileIntoCurrentTab(path)` line 368; `openFile` line 353; `drainPendingOpens` line 323;
    `checkInitialFile` line 420)
  - `paperboy-app/src/scripts/theme.js` (UI-state contract — for the showFullPath/menu-event pattern)
- Commands run:
  - `grep -n "tauri-plugin-store\|plugin-store" src-tauri/Cargo.toml` → empty (exit 1)
  - `grep -n 'name = "tauri-plugin-store"' src-tauri/Cargo.lock` → empty (exit 1)
  - `grep -n "store\|recent\|Recent\|recent_files" src-tauri/src/main.rs` → only a keychain comment (no store/recent)
  - `grep -rn "store" src-tauri/capabilities/` → empty (exit 1)
  - `grep -rn "recent\|Recent\|RECENT" src/scripts/` → only unrelated bundled-converter internals
- Current claim being verified: none — `reply: null` in the queue and no implementation in the repo.
  Reviewing the current repo state as turn 1.
- Result: NOT started. No `tauri-plugin-store` dependency, no recent-files submenu, no recording of opened
  files anywhere in Rust or JS.

## Findings

### Finding 1: `tauri-plugin-store` is not added (no persistent recent-files storage)
- Severity: required (this is the persistence half of 4.5's deliverable)
- Location: `paperboy-app/src-tauri/Cargo.toml` (deps), `paperboy-app/src-tauri/src/main.rs` (plugin chain
  at lines 263-269, currently `tauri_plugin_dialog` + `tauri_plugin_window_state`),
  `paperboy-app/src-tauri/capabilities/default.json` (permissions).
- Problem: there is no durable store for the recent-files list. The crate is not a dependency and the plugin
  is not registered, so a recent-files list could not survive a relaunch.
- Spec mismatch / risk: spec explicitly names `tauri-plugin-store` and "last 10" persistence; none exists.
- Required fix: add the crate, register the plugin, grant its permission in the capability file, and use a
  named store (e.g. `recent-files.json`) keyed `recentFiles: string[]`. See Builder Prompt.
- Code sample / exact change:
```toml
# paperboy-app/src-tauri/Cargo.toml  [dependencies]  (match the v2 family already in use)
tauri-plugin-store = "2"
```
```rust
// paperboy-app/src-tauri/src/main.rs — add to the builder chain after window_state
.plugin(tauri_plugin_store::Builder::default().build())
```
- Validation:
```
grep -n "tauri-plugin-store" paperboy-app/src-tauri/Cargo.toml          # MUST show the dep
grep -n "tauri_plugin_store" paperboy-app/src-tauri/src/main.rs         # MUST show plugin init
grep -n "store" paperboy-app/src-tauri/capabilities/default.json        # MUST show permission
( cd paperboy-app/src-tauri && cargo check )                            # MUST exit 0
```

### Finding 2: no recent-files submenu, and opened files are never recorded
- Severity: required
- Location: `paperboy-app/src-tauri/src/main.rs` — `menu()` File submenu (lines 220-232), `on_menu_event`
  (lines 290-304), `setup` (lines 282-289); `paperboy-app/src/scripts/bridge.js` —
  `loadFileIntoCurrentTab(path)` (line 368, the single funnel every open passes through),
  `setupMenuListeners` (lines ~290-320).
- Problem: the native menu has no "Open Recent" submenu and nothing records the path of an opened file. The
  menu is built ONCE in `setup` (line 287) and never rebuilt, so a dynamic recent-files list needs a
  rebuild-the-menu (or a dynamic submenu) strategy plus a JS→Rust path to update the list as files open.
- Spec mismatch / risk: without the submenu + recording, there is no recent-files feature at all.
- Required fix (two coordinated halves):
  1. **Record on open (JS)**: in `loadFileIntoCurrentTab(path)` after a successful read, push `path` to the
     recent-files list (dedupe, most-recent-first, cap at 10) by invoking a Rust command that writes to the
     store AND rebuilds the menu's Open Recent submenu. `loadFileIntoCurrentTab` is the SINGLE place every
     open lands (menu Open, Open in New Tab, double-click drain `drainPendingOpens`, `?file=` deep link
     `checkInitialFile`), so recording there covers all entry points.
  2. **Render submenu (Rust)**: add an "Open Recent" `Submenu` to the File submenu (after the Open… items,
     before the Save separator). Populate it from the store at `setup` time and rebuild it (or rebuild the
     whole menu via `app.set_menu(...)`, mirroring the existing line 287 pattern) whenever the list changes.
     Each recent item should carry a stable id encoding its path (e.g. `recent::<index>` resolved against the
     stored list, or `recent::<base64-path>`); on click, emit a `menu-open-recent` event with the path so the
     JS reuses the existing open path. Include a separator + "Clear Recent" item.
- Code sample / exact change:
```rust
// Sketch — a command the JS calls after a successful open; writes store + rebuilds the Open Recent submenu.
#[tauri::command]
fn push_recent_file(app: AppHandle, path: String) -> Result<(), String> {
    // 1. load Vec<String> from store "recent-files.json" key "recentFiles" (default empty)
    // 2. retain(|p| p != &path); insert(0, path); truncate(10);
    // 3. save store; then rebuild menu: app.set_menu(menu(app.handle(), &full_path_item, &recent)?)?
    Ok(())
}
// menu(): build Open Recent submenu from the recent list; ids like "recent::<idx>"; add Clear Recent.
// on_menu_event: id starting with "recent::" -> resolve path from current list -> emit("menu-open-recent", path)
//                "recent_clear" -> clear store + rebuild menu
```
```js
// bridge.js — record after a successful read inside loadFileIntoCurrentTab(path)
await invoke("push_recent_file", { path });
// setupMenuListeners(): handle the Rust event
"menu-open-recent": (path) => maybeProceed(() => loadFileIntoCurrentTab(path)),
```
- Validation:
```
grep -n "Open Recent\|recent\|Recent" paperboy-app/src-tauri/src/main.rs               # submenu + ids present
grep -n "push_recent_file\|menu-open-recent" paperboy-app/src/scripts/bridge.js        # record + open-recent
grep -n "push_recent_file" paperboy-app/src-tauri/src/main.rs                          # command registered in invoke_handler
( cd paperboy-app/src-tauri && cargo check )                                           # exit 0
npm run build:converter -w paperboy-app                                                # exit 0 (JS bundles)
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: Add an "Open Recent" submenu to the File menu listing the last 10 opened files, persisted across
launches via `tauri-plugin-store`. Recording must happen at the single JS open funnel so every entry point
(menu Open / Open in New Tab / double-click / `?file=` deep link) populates the list.

Files to edit:
- `paperboy-app/src-tauri/Cargo.toml` — add `tauri-plugin-store = "2"`.
- `paperboy-app/src-tauri/src/main.rs` — register the store plugin in the builder chain (after
  `tauri_plugin_window_state`); add an "Open Recent" `Submenu` inside the File `SubmenuBuilder` (after the
  Open… items, before the Save separator) with a trailing separator + "Clear Recent"; add a
  `push_recent_file` (and optionally `clear_recent_files`) `#[tauri::command]` registered in
  `invoke_handler`; in `on_menu_event`, handle `recent::<...>` ids (resolve to a path, emit
  `menu-open-recent` with the path) and the clear id; populate the submenu from the store at `setup` and
  rebuild it when the list changes (reuse the `app.set_menu(...)` pattern already at line 287). Cap the list
  at 10, dedupe, most-recent-first.
- `paperboy-app/src-tauri/capabilities/default.json` — grant the store permission (`store:default`, or the
  exact identifier the generated schema in `src-tauri/gen/schemas/` reports if it differs).
- `paperboy-app/src/scripts/bridge.js` — after a successful read inside `loadFileIntoCurrentTab(path)` (line
  368), `await invoke("push_recent_file", { path })`; in `setupMenuListeners`, handle the `menu-open-recent`
  event by calling `maybeProceed(() => loadFileIntoCurrentTab(path))` (use the path payload). Guard the
  invoke so a store failure never blocks opening a file (wrap in try/catch, ignore errors).

Files not to edit:
- The keychain / settings code (unrelated to 4.5).
- The window-state / view-mode persistence from 4.4 — do not touch that wiring.

Exact changes: see the code sketches in Findings 1 and 2.

Data shapes / CLI examples:
- Store file: `recent-files.json`, key `recentFiles`, value `string[]` (absolute paths, most-recent first,
  max length 10, no duplicates).
- Menu item ids: `recent::<index>` (index into the current `recentFiles`), `recent_clear` for Clear Recent.
- Event: `menu-open-recent` with the resolved absolute path string as payload.

Tests to add or update:
- No JS unit harness for the app. Verify by reading: (a) `cargo check` clean; (b) `loadFileIntoCurrentTab`
  invokes `push_recent_file`; (c) the submenu is built from the store and rebuilt on change; (d) clicking a
  recent item routes through `loadFileIntoCurrentTab`. Runtime smoke (open 3 files, relaunch, list restored,
  click reopens) is covered by the app-smoke task family — not required here.

Commands to run (capture exit codes):
```
( cd paperboy-app/src-tauri && cargo check )                                   # exit 0
grep -n "tauri-plugin-store" paperboy-app/src-tauri/Cargo.toml                 # dep present
grep -n "tauri_plugin_store" paperboy-app/src-tauri/src/main.rs                # plugin registered
grep -n "Open Recent\|recent::\|push_recent_file" paperboy-app/src-tauri/src/main.rs   # submenu + command
grep -n "store" paperboy-app/src-tauri/capabilities/default.json              # permission granted
grep -n "push_recent_file\|menu-open-recent" paperboy-app/src/scripts/bridge.js        # JS recording + open
npm run build:converter -w paperboy-app                                        # exit 0
npm run build     --workspaces --if-present                                     # exit 0
npm test          --workspaces --if-present                                     # exit 0
```

Definition of done:
- `tauri-plugin-store` is a dependency, registered, with its permission granted; `cargo check` clean.
- File menu shows an "Open Recent" submenu populated from the store (last 10, dedup, most-recent-first), with
  a "Clear Recent" item.
- Every opened file (menu Open, Open in New Tab/Window, double-click, `?file=` deep link) is recorded via
  `loadFileIntoCurrentTab`; clicking a recent entry reopens it through the same funnel.
- The list persists across launches; workspace build/test stay green.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Stale-path handling: if a recent path no longer exists on disk, the cleanest UX is to surface the open
  error (existing `loadFileIntoCurrentTab` error path) and drop the entry from the list. Pruning missing
  paths is nice-to-have, not required to pass 4.5 — note your choice in the reply.
- Multi-window: the recent list is app-global (one store), which is correct; no per-window scoping needed.

## Decision
send_to_builder
