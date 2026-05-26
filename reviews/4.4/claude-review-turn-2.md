# 4.4 - Review Turn 2

## Task Context
- Task id: 4.4
- Task title: Add tauri-plugin-window-state persistence
- Dashboard implementation status: done (both turn-1 findings verified fixed in the repo)
- Review status: waiting_for_reviewer → review_passed
- Spec sections: plan item **4.4** — "Add `tauri-plugin-window-state` so window size, position, and view
  mode persist across launches."
- Builder reply reviewed: `reviews/4.4/cursor-reply-turn-1.md`
- Files inspected (re-verified against the live repo, not the reply text):
  - `paperboy-app/src-tauri/Cargo.toml` — `tauri-plugin-window-state = "2"` (line 14)
  - `paperboy-app/src-tauri/Cargo.lock` — `tauri-plugin-window-state` v2.4.1 (line 3580-3582)
  - `paperboy-app/src-tauri/src/main.rs` — `use ...StateFlags` (line 31); plugin registered in the builder
    chain with `SIZE | POSITION | MAXIMIZED` (lines 264-269)
  - `paperboy-app/src-tauri/capabilities/default.json` — `"window-state:default"` (line 11);
    `windows` array includes `"main"` and `"window-*"` (line 5)
  - `paperboy-app/src/scripts/bridge.js` — view-mode localStorage load/persist (lines 36-57, 62, 91-99)
  - `paperboy-app/src/scripts/theme.js` — `initUiState`/`setViewMode` reads persisted dataset and applies
    on init (lines 10, 28-35, 52)
- Commands run (exit codes captured):
  - `grep` Cargo.toml/Cargo.lock/main.rs/capabilities/default.json — all four wiring points present
  - `grep` bridge.js — `VIEW_MODE_KEY`, `loadViewModePreference`, `persistViewModePreference` present;
    only one `state.viewMode =` assignment (line 92, inside `onViewModeChange`)
  - `npm run build:converter -w paperboy-app` → exit 0 (`Bundled converter -> src/scripts/vendor/converter.js`)
  - `npm run build --workspaces --if-present` → exit 0 (cli tsc, ext, widget all built)
  - `npm test --workspaces --if-present` → exit 0 (cli 19 + widget 12 = 31 tests passed)
- Note on `cargo check`: not re-run (NAS-bound Rust build is heavy per the rigor guidance). Instead the
  Cargo/main.rs/capabilities wiring was confirmed internally consistent by reading: crate v2.4.1 resolves
  under the `"2"` constraint, the plugin is registered with valid `StateFlags`, and the granted permission
  identifier `window-state:default` matches the plugin's default permission convention.

## Findings

### Finding 1 (turn 1): `tauri-plugin-window-state` not added — RESOLVED
- Verification: dep present in Cargo.toml; lockfile pins v2.4.1; `main.rs` imports `StateFlags` and registers
  `tauri_plugin_window_state::Builder::default().with_state_flags(SIZE | POSITION | MAXIMIZED).build()` right
  after the dialog plugin; `capabilities/default.json` grants `window-state:default` and its `windows` array
  covers `main` (and `window-*`). All four points the turn-1 contract required are satisfied and consistent.
- Status: FIXED.
- Validation:
```
grep -n "tauri-plugin-window-state" paperboy-app/src-tauri/Cargo.toml          # line 14 present
grep -n -A2 'name = "tauri-plugin-window-state"' paperboy-app/src-tauri/Cargo.lock  # v2.4.1
grep -n "window_state\|StateFlags"  paperboy-app/src-tauri/src/main.rs         # lines 31, 264-269
grep -n "window-state" paperboy-app/src-tauri/capabilities/default.json        # line 11
```

### Finding 2 (turn 1): view-mode persistence missing — RESOLVED
- Verification: `VIEW_MODE_KEY = "paperboy-app-view-mode"`; `loadViewModePreference()` whitelists
  editor/preview/split (falls back to "editor"); `persistViewModePreference()` writes to localStorage —
  mirroring the existing `showFullPath` pattern. `state.viewMode` is initialized from
  `loadViewModePreference()` (line 62); the `.content-area` dataset is seeded with the loaded value (line 56)
  BEFORE `initUiState` runs, so `theme.js` line 10 reads it and `setViewMode(viewMode)` (line 52) applies it
  to the toolbar/pill/active-button on cold launch. The sole `state.viewMode =` write (line 92) lives inside
  `onViewModeChange`, which calls `persistViewModePreference`. Every user view change — the `.view-toggle`
  click and the View-menu events `menu-view-preview`/`menu-view-editor`/`menu-view-split` — routes through
  `ui.setViewMode` → `onViewModeChange` → persist. No assignment bypasses persistence.
- Status: FIXED.

### Observation (non-blocking, no action required)
- Programmatic view resets persist too: `menu-new`/new-tab and open-file-forces-preview (bridge.js lines
  236, 296, 396) go through `ui.setViewMode`, so they also overwrite the stored preference. This is the
  app's existing intentional UX, and the persisted value still governs the cold-launch default before any
  file is opened, so the spec ("view mode persists across launches") is met. Not a defect.

## Builder Prompt
No further builder action required — this task passes. (Heading retained for contract completeness.)

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — both turn-1 findings verified FIXED in the repo
- [x] Every required finding has a validation command — re-run with captured exit codes (all 0)
- [x] Code samples or exact data/CLI examples are included where useful — exact file/line evidence cited
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Multi-window geometry for ad-hoc `window-2`/`window-3` (non-stable labels) remains out of scope, as
  flagged in turn 1. The `main` window persists, which satisfies 4.4. No follow-up requested by the builder.
- Validation (Finding 2 + workspace gates re-run, all exit 0):
```
grep -n "VIEW_MODE_KEY\|loadViewModePreference\|persistViewModePreference" paperboy-app/src/scripts/bridge.js  # present
grep -n "state.viewMode\s*=" paperboy-app/src/scripts/bridge.js   # only line 92 (inside onViewModeChange → persists)
npm run build:converter -w paperboy-app    # exit 0
npm run build --workspaces --if-present     # exit 0
npm test  --workspaces --if-present         # exit 0 (31 tests)
```

## Decision
review_passed
