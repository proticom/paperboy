# 4.5 - Review Turn 2

## Task Context
- Task id: 4.5
- Task title: Add recent files menu (last 10, tauri-plugin-store)
- Dashboard implementation status: done
- Review status: waiting_for_reviewer → review_passed
- Spec sections: plan item **4.5** — "Add recent files menu (last 10, tauri-plugin-store)": a File-menu
  submenu listing the last 10 opened files, persisted across launches via `tauri-plugin-store`.
- Files inspected:
  - `paperboy-app/src-tauri/Cargo.toml` (dep `tauri-plugin-store = "2"` at line 14)
  - `paperboy-app/src-tauri/Cargo.lock` (`tauri-plugin-store` v2.4.3 present)
  - `paperboy-app/src-tauri/capabilities/default.json` (line 11: `"store:default"`)
  - `paperboy-app/src-tauri/gen/schemas/desktop-schema.json` + `capabilities.json` (confirm `store:default`
    is a valid generated permission identifier)
  - `paperboy-app/src-tauri/src/main.rs` (imports L1-44; constants L13-15; `emit`/`emit_with_payload`
    L176-198; `load_recent_files` L200-209; `save_recent_files` L211-215; `clear_recent_files` L217-219;
    `rebuild_menu` L221-227; `push_recent_file` command L229-237; `build_open_recent_submenu` L260-286;
    `menu()` File submenu L308-322; plugin chain L353-360; `invoke_handler` L361-373; `setup` L374-382;
    `on_menu_event` L383-414)
  - `paperboy-app/src/scripts/bridge.js` (`setupMenuListeners` L293-322; `menu-open-recent` listener
    L309-313; `drainPendingOpens` L328-342; `openFile` L358-371; `loadFileIntoCurrentTab` L373-420 with the
    `push_recent_file` invoke at L408-414; `checkInitialFile` deep link L432-442)
- Commands run:
  - `grep -n "tauri-plugin-store" Cargo.toml` → line 14 (dep present)
  - `grep -n 'name = "tauri-plugin-store"' Cargo.lock` → present (v2.4.3)
  - `grep -n "store" capabilities/default.json` → line 11 `"store:default"`
  - `grep -o '"store:default"' gen/schemas/desktop-schema.json` → match (valid permission id)
  - `cargo check` (CARGO_TARGET_DIR on SSD cache) → **exit 0** (`Finished dev profile`, no errors/warnings;
    `tauri-plugin-store v2.4.3` + `paperboy-editor` both compiled)
  - `npm run build:converter -w paperboy-app` → **exit 0** (`Bundled converter -> src/scripts/vendor/converter.js`)
  - `npm run build --workspaces --if-present` → **exit 0** (cli/ext/widget all built)
  - `npm test --workspaces --if-present` → **exit 0** (cli 19/19, widget 12/12 = 31 passing)
- Current claim being verified: cursor's turn-1 reply at `reviews/4.5/cursor-reply-turn-1.md` claiming both
  turn-1 findings are fixed.

## Findings

### Finding 1 (turn 1): `tauri-plugin-store` not added — RESOLVED
- Severity: required → resolved
- Verification: `Cargo.toml` line 14 has `tauri-plugin-store = "2"`; `Cargo.lock` resolves it to v2.4.3;
  `main.rs` line 360 registers `.plugin(tauri_plugin_store::Builder::default().build())` in the builder chain
  after window-state; `capabilities/default.json` line 11 grants `"store:default"`, and that identifier is a
  valid generated permission (present in `gen/schemas/desktop-schema.json`). The store uses
  `recent-files.json` / key `recentFiles` / `string[]` exactly as specified. `cargo check` exits 0 with the
  plugin compiled. **Fixed.**
- Re-verification commands:
```text
grep -n "tauri-plugin-store" paperboy-app/src-tauri/Cargo.toml              # line 14
grep -n 'name = "tauri-plugin-store"' paperboy-app/src-tauri/Cargo.lock     # v2.4.3
grep -n "tauri_plugin_store::Builder" paperboy-app/src-tauri/src/main.rs    # plugin registered (L360)
grep -n "store:default" paperboy-app/src-tauri/capabilities/default.json    # permission granted (L11)
```
- Validation:
( cd paperboy-app/src-tauri && cargo check )                                # exit 0 (observed)

### Finding 2 (turn 1): no Open Recent submenu + opens never recorded — RESOLVED
- Severity: required → resolved
- Verification (Rust):
  - `build_open_recent_submenu` (L260-286) builds the submenu: last-10 entries labelled by filename with
    `recent::<index>` ids; a disabled `(No Recent Files)` placeholder when empty; trailing separator +
    `Clear Recent` (`recent_clear`).
  - `menu()` (L308, L316) inserts the Open Recent submenu into the File submenu after the Open… items and
    before the Save separator — matches the prescribed placement.
  - `push_recent_file` command (L229-237): loads list, `retain(|p| p != &path)` (dedup), `insert(0, path)`
    (most-recent-first), `truncate(MAX_RECENT_FILES=10)`, saves, then `rebuild_menu` → `app.set_menu(...)`.
  - `setup` (L379-380) populates the submenu from the store at launch via `load_recent_files` +
    `app.set_menu`, so the list survives relaunch.
  - `on_menu_event` (L397-412): `recent_clear` → `clear_recent_files` + rebuild; `recent::<idx>` → parse
    index, resolve path from the current stored list, `emit_with_payload("menu-open-recent", path)`.
    `rebuild_menu` reads the managed `CheckMenuItem<Wry>` state (managed in setup L378), so the rebuilt menu
    preserves the Show-Full-Path check item from task 4.x.
  - `push_recent_file` is registered in `invoke_handler` (L372). `emit_with_payload` helper exists (L188).
- Verification (JS):
  - `loadFileIntoCurrentTab` (L373) invokes `push_recent_file` at L410 ONLY after a successful load
    (`setDocument` ran), wrapped in try/catch (L409-413) so a store failure logs a warning and never blocks
    opening. The early `return` on null `read_file`/`read_file_bytes` (L386, L394) correctly skips recording.
  - `menu-open-recent` listener (L309-313) extracts `event.payload` as the path and routes through
    `maybeProceed(() => loadFileIntoCurrentTab(path))` — reopens through the SAME funnel, respecting the
    unsaved-changes guard.
  - Single-funnel coverage confirmed: menu Open (`openFile` → `loadFileIntoCurrentTab`), Open in New Tab
    (`openFile("tab")`), double-click drain (`drainPendingOpens` L340), `?file=` deep link
    (`checkInitialFile` L437), and Open in New Window (spawns a window that runs `checkInitialFile`) all land
    in `loadFileIntoCurrentTab`, so every entry point records exactly once. **Fixed.**
- Re-verification commands:
```text
grep -n "Open Recent\|recent::\|push_recent_file\|build_open_recent_submenu" paperboy-app/src-tauri/src/main.rs
grep -n "push_recent_file\|menu-open-recent" paperboy-app/src/scripts/bridge.js
```
- Validation:
npm run build:converter -w paperboy-app   # exit 0 (observed)
npm run build  --workspaces --if-present  # exit 0 (observed)
npm test       --workspaces --if-present  # exit 0 (observed, 31 tests)

No remaining findings.

## Builder Prompt

No builder prompt — review_passed. No further work required for 4.5.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix (both turn-1 required findings verified fixed in the repo)
- [x] Every required finding has a validation command (cargo check / build:converter / workspace build+test, all exit 0)
- [x] Code samples or exact data/CLI examples are included where useful (line-anchored verification above)
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Stale-path pruning was intentionally deferred by the builder (the existing `loadFileIntoCurrentTab` error
  path surfaces a missing file). This was explicitly noted as nice-to-have / not required to pass 4.5 in the
  turn-1 contract, so it does not block. No open questions.

## Decision
review_passed
