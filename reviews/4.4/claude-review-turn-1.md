# 4.4 - Review Turn 1

## Task Context
- Task id: 4.4
- Task title: Add tauri-plugin-window-state persistence
- Dashboard implementation status: todo (verified NOT started in the repo)
- Review status: in_review → waiting_for_builder
- Spec sections: plan item **4.4** — "Add `tauri-plugin-window-state` so window size, position, and view
  mode persist across launches."
- Files inspected:
  - `paperboy-app/src-tauri/Cargo.toml` (deps — no window-state crate)
  - `paperboy-app/src-tauri/Cargo.lock` (no `tauri-plugin-window-state`)
  - `paperboy-app/src-tauri/src/main.rs` (`tauri::Builder` plugin registration)
  - `paperboy-app/src-tauri/capabilities/default.json` (permission set)
  - `paperboy-app/src/scripts/bridge.js` (app state incl. `viewMode`, and the `showFullPath`
    localStorage persistence pattern to mirror)
  - `paperboy-app/src/scripts/theme.js` (`setViewMode` / `getViewMode`)
- Commands run:
  - `grep -n "window-state\|window_state\|WindowState\|StateFlags" Cargo.toml main.rs` → empty (exit 1)
  - `grep -n "tauri-plugin-window-state" Cargo.lock` → empty (exit 1)
  - `grep -rn "window-state\|window_state" capabilities/ tauri.conf.json` → empty (exit 1)
  - `grep -rn "viewMode" bridge.js theme.js` → present, but never persisted (always defaults to "editor")
  - `grep -n "loadShowFullPathPreference\|persistShowFullPathPreference\|FULL_PATH_KEY" bridge.js` → the
    existing localStorage pref pattern (lines 22-32)
- Current claim being verified: none — there is no builder reply artifact (`reply: null` in the queue) and
  no implementation in the repo. Reviewing the current repo state as turn 1.
- Result: NOT started. The plugin is absent from Cargo.toml/Cargo.lock/main.rs/capabilities, AND view mode
  is not persisted anywhere (it hard-defaults to "editor" on every launch).

## Findings

### Finding 1: `tauri-plugin-window-state` is not added (window geometry does not persist)
- Severity: required (this is the headline deliverable of 4.4)
- Location: `paperboy-app/src-tauri/Cargo.toml` (deps), `paperboy-app/src-tauri/src/main.rs`
  (`tauri::Builder::default()...plugin(...)` chain, currently only `tauri_plugin_dialog::init()`),
  `paperboy-app/src-tauri/capabilities/default.json` (permissions).
- Problem: window size, position, and maximized state are not restored across launches. The crate is not a
  dependency and the plugin is not registered.
- Spec mismatch / risk: spec requires window size + position to persist; none of it does today.
- Required fix: add the crate, register the plugin with the geometry `StateFlags`, and grant the plugin's
  permission in the capability file. See Builder Prompt §A.
- Code sample / exact change: see Builder Prompt §A.
- Validation:
```
grep -n "tauri-plugin-window-state" paperboy-app/src-tauri/Cargo.toml          # MUST show the dep
grep -n "window_state\|StateFlags"  paperboy-app/src-tauri/src/main.rs         # MUST show plugin init
grep -n "window-state"              paperboy-app/src-tauri/capabilities/default.json  # MUST show permission
( cd paperboy-app/src-tauri && cargo check )                                    # MUST exit 0
```

### Finding 2: view-mode persistence is missing (plugin does NOT cover it)
- Severity: required
- Location: `paperboy-app/src/scripts/bridge.js:39` — `viewMode: "editor"` is hard-coded into the initial
  `state`; `paperboy-app/src/scripts/theme.js:10,29-30,52-53` — `setViewMode`/`getViewMode`.
- Problem: `tauri-plugin-window-state` persists ONLY native window geometry (size, position, maximized,
  visible, decorations) — it does NOT know about the app's editor/split/preview view mode. The spec
  explicitly lists "view mode" among the things that must persist, so adding the plugin alone is
  INSUFFICIENT. Today `viewMode` resets to "editor" on every launch.
- Spec mismatch / risk: if the builder adds only the plugin and calls it done, the "view mode persists"
  half of the spec is unmet. View mode is an app-level UI concern, not a window-manager concern.
- Required fix: persist the view mode in `localStorage` (mirror the EXISTING `showFullPath` pattern at
  bridge.js:22-32) and restore it on init, instead of the hard-coded `"editor"`. See Builder Prompt §B.
  Persist on every `setView`/`setViewMode` change.
- Code sample / exact change: see Builder Prompt §B.
- Validation:
```
grep -n "viewMode.*localStorage\|VIEW_MODE_KEY\|loadViewModePreference\|setItem.*[Vv]iew" \
  paperboy-app/src/scripts/bridge.js                                            # MUST show persistence
grep -n 'viewMode: "editor"' paperboy-app/src/scripts/bridge.js                # SHOULD become a loaded value
npm run build:converter -w paperboy-app                                         # app scripts still load (exit 0)
```

## Builder Prompt

Developer/Builder, execute this as a standalone task. Two deliverables: (A) add and register
`tauri-plugin-window-state` for native window geometry; (B) persist the app view mode in localStorage so
the FULL spec ("size, position, AND view mode persist") is met — the plugin does not cover view mode.

### A. Add `tauri-plugin-window-state` (Rust)
1. `paperboy-app/src-tauri/Cargo.toml` — add under `[dependencies]` (match the v2 family already in use;
   `tauri` is 2.10.3 and `tauri-plugin-dialog` is 2.7.0, so a plain `"2"` constraint resolves correctly):
   ```toml
   tauri-plugin-window-state = "2"
   ```
2. `paperboy-app/src-tauri/src/main.rs` — register the plugin in the existing builder chain, right after
   the dialog plugin. Persist size + position (+ maximized) but NOT the per-launch URL/visibility you don't
   want. Example:
   ```rust
   use tauri_plugin_window_state::StateFlags;
   // ...
   tauri::Builder::default()
     .plugin(tauri_plugin_dialog::init())
     .plugin(
       tauri_plugin_window_state::Builder::default()
         .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
         .build(),
     )
     // ...existing .invoke_handler / .setup / .on_menu_event ...
   ```
   - NOTE on multi-window: this app spawns extra windows via `create_window` with labels `window-2`,
     `window-3`, … (see main.rs `create_window`). The plugin keys saved state by window LABEL, so each
     dynamically-labeled window will not reliably restore (labels are not stable across launches). That's
     acceptable for this task — the primary `main` window is what must persist. Do NOT try to make every
     ad-hoc window persist; just confirm `main` restores. If you want to exclude the transient windows from
     being saved, you may use `.skip_initial_state("window-...")` selectively, but it's optional.
3. `paperboy-app/src-tauri/capabilities/default.json` — the plugin exposes `save_window_state` /
   `restore_state` commands that need a permission. Add the plugin's default permission to the `permissions`
   array (keep the existing entries):
   ```json
   "permissions": [
     "core:default",
     "core:window:allow-start-dragging",
     "core:window:allow-start-resize-dragging",
     "dialog:default",
     "window-state:default"
   ]
   ```
   - If `cargo check`/build reports the permission identifier differs (some plugin versions name it
     `window-state:allow-save-window-state` + `...allow-restore-state`), use whatever the generated schema
     in `src-tauri/gen/schemas/` reports. Verify by building; a wrong identifier fails the capability
     validation at build time.

### B. Persist view mode in localStorage (JS) — REQUIRED, the plugin does NOT do this
Mirror the EXISTING `showFullPath` persistence in `paperboy-app/src/scripts/bridge.js` (lines 22-32):
1. Add a key + load/persist helpers near `FULL_PATH_KEY`:
   ```js
   const VIEW_MODE_KEY = "paperboy-app-view-mode";
   function loadViewModePreference() {
     try {
       const v = localStorage.getItem(VIEW_MODE_KEY);
       return v === "editor" || v === "preview" || v === "split" ? v : "editor";
     } catch {
       return "editor";
     }
   }
   function persistViewModePreference(mode) {
     try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* ignore */ }
   }
   ```
2. Initialize `state.viewMode` from the stored value instead of the hard-coded literal (bridge.js:39):
   ```js
   // was: viewMode: "editor",
   viewMode: loadViewModePreference(),
   ```
3. Persist on every view change. Find where the view mode is set (bridge.js has a `setView`/mode-setting
   path around lines 63-69 that mutates `state.viewMode` and calls `theme.js`'s `setViewMode`). Call
   `persistViewModePreference(mode)` whenever `state.viewMode` is updated by a user action (the toggle and
   the View menu events `menu-view-preview` / `menu-view-editor` / `menu-view-split`). Confirm by grepping
   that every assignment to `state.viewMode = <mode>` is followed by a persist (or route them all through a
   single helper that persists).
4. On init, apply the loaded mode to the UI: ensure the initial `theme.js setViewMode(state.viewMode)` (or
   the equivalent first render) uses `state.viewMode` rather than defaulting to "editor", so the restored
   mode is actually reflected in the DOM (`content.dataset.viewMode`) on cold launch.

### Files not to edit
- The keychain / settings code (unrelated to 4.4).
- `theme.js`'s view-mode rendering contract — only ensure it's CALLED with the persisted value; don't change
  its signature.

### Tests / verification
- No JS unit harness for the app. Verify by: (a) `cargo check` clean; (b) reading bridge.js to confirm
  `viewMode` is loaded from + written to localStorage on every change; (c) the runtime smoke (resize/move
  window, switch to split, relaunch → geometry + view mode restored) is covered by task 4.13.
- Run the workspace gates to confirm nothing else regressed.

### Commands to run (capture exit codes)
```
( cd paperboy-app/src-tauri && cargo check )                                    # exit 0; plugin compiles, permission valid
grep -n "tauri-plugin-window-state" paperboy-app/src-tauri/Cargo.toml           # dep present
grep -n "window_state\|StateFlags"  paperboy-app/src-tauri/src/main.rs          # plugin registered
grep -n "window-state"              paperboy-app/src-tauri/capabilities/default.json  # permission granted
grep -n "VIEW_MODE_KEY\|loadViewModePreference\|persistViewModePreference" paperboy-app/src/scripts/bridge.js  # JS persistence
npm run build     --workspaces --if-present
npm run typecheck --workspaces --if-present
npm test          --workspaces --if-present
```

### Definition of done
- `tauri-plugin-window-state` is a dependency, registered in the builder with SIZE|POSITION|MAXIMIZED, and
  the capability grants its permission; `cargo check` is clean.
- The primary `main` window's size + position restore across launches.
- View mode (editor/split/preview) is persisted in localStorage and restored on cold launch (no longer
  hard-defaulting to "editor").
- Workspace build/typecheck/test stay green.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Multi-window geometry: the app's secondary windows use non-stable labels (`window-2`, `window-3`, …), so
  the plugin can only reliably restore the `main` window. I treated "the main window persists" as
  sufficient for this task (restoring every ad-hoc window would need a stable-label scheme out of scope
  here). If you intend per-window persistence for spawned windows, reply with that as a follow-up — but it
  is not required to pass 4.4.

## Decision
send_to_builder
