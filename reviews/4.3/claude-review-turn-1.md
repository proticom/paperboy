# 4.3 - Review Turn 1

## Task Context
- Task id: 4.3
- Task title: Clean dead Rust commands; wire list_configured_providers
- Dashboard implementation status: todo (verified NOT started in the repo)
- Review status: in_review → waiting_for_builder
- Spec (plan item **4.3**): "Extend `paperboy-app/src-tauri/src/main.rs`: replace the dead `open_file` /
  `save_file_as` commands with a real `read_keychain`/`write_keychain` shape if not already present, or
  delete them. Wire `list_configured_providers` to the Settings dialog so the dropdown is data-driven."
- Files inspected:
  - `paperboy-app/src-tauri/src/main.rs` (command defs + `invoke_handler` registration)
  - `paperboy-app/src/scripts/settings.js` (provider catalog + dialog wiring)
  - `paperboy-app/src/index.html` (the static provider `<select>`)
  - `paperboy-app/src/scripts/bridge.js` (how the app actually opens/saves files — the dialog plugin path)
  - `paperboy-ai/src/providers.ts` (the shared catalog from 4.1)
- Commands run:
  - `grep -rn "open_file|save_file_as|read_keychain|write_keychain|list_configured_providers" src-tauri/src` → see below
  - `grep -rn "list_configured_providers|open_file|save_file_as" paperboy-app --include=*.js --include=*.html | grep -v vendor`
  - `git status` / `git log -- paperboy-app/src-tauri/src/main.rs`
- Result: NEITHER half of the task is done. The dead commands are still present AND still registered; the
  provider dropdown is hardcoded HTML and `list_configured_providers` is referenced only in a code comment.

## Findings

### Finding 1: dead `open_file` / `save_file_as` commands still present and registered
- Severity: required
- Location: `paperboy-app/src-tauri/src/main.rs:64-70` (`open_file`), `:91-98` (`save_file_as`); both still
  listed in `invoke_handler(tauri::generate_handler![ ... ])` at lines 290 and 294.
- Problem: the frontend never calls these. `bridge.js` does its own open via the Tauri dialog plugin
  (`tauri.dialog.open` / `tauri.dialog.save`) then calls the `read_file` / `read_file_bytes` / `save_file`
  commands. So `open_file` and `save_file_as` are dead Rust surface (each opens its OWN native dialog,
  duplicating what bridge.js already does, and nothing invokes them).
  - Proof: `grep -rn "open_file\|save_file_as" paperboy-app --include="*.js" | grep -v vendor` → empty.
- Spec choice: "replace … with a real `read_keychain`/`write_keychain` shape if not already present, or
  delete them." A real keychain shape ALREADY EXISTS — `get_api_key` / `set_api_key` / `delete_api_key`
  (main.rs:114-138) ARE the read/write/delete keychain commands, fully wired to settings.js. So the
  `read_keychain`/`write_keychain` need is already satisfied under different names; the correct action here
  is to **DELETE** `open_file` and `save_file_as` (do not add redundant `read_keychain`/`write_keychain`
  aliases — that would just create new dead surface).
- Required fix: remove both `#[tauri::command]` fns and both entries from the `generate_handler!` macro.
  See Builder Prompt for exact lines.
- Validation:
```
grep -n "fn open_file\|fn save_file_as" paperboy-app/src-tauri/src/main.rs      # MUST be empty
grep -n "open_file\|save_file_as" paperboy-app/src-tauri/src/main.rs            # MUST be empty (incl. handler)
cargo build --manifest-path paperboy-app/src-tauri/Cargo.toml                   # MUST succeed (no unused-fn / no missing-handler errors)
```

### Finding 2: `list_configured_providers` is NOT wired to the Settings dialog; the dropdown is static HTML
- Severity: required (this is the headline deliverable of 4.3)
- Location:
  - Dropdown is hardcoded: `paperboy-app/src/index.html:165-173` — seven literal `<option>` elements.
  - `list_configured_providers` (main.rs:141-151) is registered but invoked by NO JS — it appears only in
    a comment at `settings.js:4`.
  - Proof: `grep -rn "list_configured_providers" paperboy-app --include="*.js" --include="*.html" | grep -v vendor`
    → only the comment line.
- Problem: the task requires the dropdown to be "data-driven." Today the catalog is duplicated in three
  places (index.html `<option>`s, settings.js `PROVIDERS`, and main.rs's hardcoded
  `["openrouter","openai","anthropic","xai"]`), and `list_configured_providers` is dead.
- Design intent (do this exactly):
  1. Build the `<select>` options at runtime from `settings.js`'s existing `PROVIDERS` map (the catalog of
     ALL selectable providers — disabled + 6 backends), instead of the static `<option>`s. The dropdown
     must still offer every provider, not only the ones with a stored key.
  2. Use `list_configured_providers` to ANNOTATE which providers already have a key in the OS keychain —
     append a " — configured" suffix (or set a `data-configured` attribute) on those options. THIS is what
     makes `list_configured_providers` live instead of dead, and makes the dropdown genuinely data-driven.
- ARCHITECTURE GOTCHA (must respect): `settings.js` is loaded as a plain relative ES module
  (`bridge.js` imports `./settings.js`; bridge.js itself is `<script type="module">` in index.html). It is
  NOT run through esbuild — only the *converter* is bundled into `src/scripts/vendor/converter.js`. So
  `settings.js` CANNOT `import { PROVIDERS } from "@proticom/paperboy-ai"` (a bare specifier won't resolve
  in the WebView at runtime and there is no bundler step for app scripts). Build the options from the
  EXISTING inline `PROVIDERS` object already in settings.js. Do not add a bare-specifier import to
  settings.js.
- Required fix: see Builder Prompt — populate the `<select>` from `PROVIDERS`, call
  `list_configured_providers` to mark configured providers, and keep `disabled` first.
- Validation:
```
grep -n "list_configured_providers" paperboy-app/src/scripts/settings.js       # MUST show a real invoke(...) call, not just the comment
grep -c "<option" paperboy-app/src/index.html                                  # SHOULD drop (static options removed; built in JS)
grep -n "import .*@proticom/paperboy-ai" paperboy-app/src/scripts/settings.js  # MUST be empty (no bare import in app ES module)
cargo build --manifest-path paperboy-app/src-tauri/Cargo.toml                  # list_configured_providers stays registered & compiles
```

## Builder Prompt

Developer/Builder, execute this as a standalone task. Two deliverables: (A) delete the dead Rust commands;
(B) make the Settings provider dropdown data-driven and bring `list_configured_providers` to life.

### A. Delete dead commands (`paperboy-app/src-tauri/src/main.rs`)
- Remove the entire `open_file` fn (currently lines 64-70) and the entire `save_file_as` fn (currently
  lines 91-98).
- Remove `open_file,` and `save_file_as,` from the `tauri::generate_handler![ ... ]` list (currently lines
  290 and 294).
- Do NOT add `read_keychain` / `write_keychain` — the keychain read/write/delete shape already exists as
  `get_api_key` / `set_api_key` / `delete_api_key` and is fully wired; adding aliases would create new dead
  surface. If you believe a rename to `read_keychain`/`write_keychain` is preferable, STOP and reply with
  rationale rather than leaving both — but the simpler, spec-compliant move is: delete the two dead file
  commands and keep the existing key commands as-is.
- Confirm `cargo build` is clean (no "unused function" warning, no "command not found in handler" error).
  If `to_path` / `read_payload` become unused after the deletion, check: `read_payload` is still used by
  `read_file` and `create_window`'s path, and `to_path` is used by the dialog-plugin callers — verify with
  `grep -n "to_path\|read_payload" main.rs` and only remove a helper if it is genuinely unused afterward.

### B. Data-driven provider dropdown (`settings.js` + `index.html`)
1. In `paperboy-app/src/index.html`, replace the seven static `<option>` children of
   `<select ... data-settings-provider>` (lines ~166-172) with nothing (leave the empty `<select>`):
   ```html
   <select id="settings-provider" data-settings-provider></select>
   ```
2. In `paperboy-app/src/scripts/settings.js`, build the options from the EXISTING inline `PROVIDERS` map
   and mark configured providers using `list_configured_providers`. Add a populate step inside
   `initSettings({ invoke })` (call it before the first `open()`/render):
   ```js
   async function populateProviderOptions() {
     let configured = [];
     if (invoke) {
       try { configured = (await invoke("list_configured_providers")) || []; }
       catch { configured = []; }
     }
     const configuredSet = new Set(configured);
     // Keep "disabled" first; preserve catalog order for the rest.
     const ids = Object.keys(PROVIDERS);
     providerSelect.innerHTML = "";
     for (const id of ids) {
       const info = PROVIDERS[id];
       const opt = document.createElement("option");
       opt.value = id;
       opt.textContent = configuredSet.has(id) ? `${info.label} — configured` : info.label;
       if (configuredSet.has(id)) opt.dataset.configured = "true";
       providerSelect.appendChild(opt);
     }
   }
   ```
   - Call `await populateProviderOptions()` once during init (e.g. immediately after the element lookups),
     and again at the top of the returned `open()` so the "— configured" marks refresh after a key is
     saved/removed. After (re)populating, set `providerSelect.value = settings.provider` so the current
     selection is preserved.
   - Do NOT import `@proticom/paperboy-ai` here — use the inline `PROVIDERS` already in settings.js (the
     WebView loads this file as a plain ES module with no bundler; a bare specifier would 404 at runtime).
   - `disabled` is in `PROVIDERS` and `needsKey:false`, so it will render as the first option with no
     "— configured" suffix. Good.
3. Leave `main.rs`'s `list_configured_providers` as-is (its hardcoded
   `["openrouter","openai","anthropic","xai"]` is the set of key-backed providers — correct, since
   ollama/local-endpoint/disabled have no keychain entry).

### Files not to edit
- `bridge.js` open/save flow (the dialog-plugin path is correct and intentional; only the dead Rust
  duplicates are being removed).
- `paperboy-ai/src/providers.ts` (do not couple the app's plain ES module to the bundled package).

### Tests / verification
- The app has no JS unit harness; verify by (a) `cargo build` clean, and (b) reading settings.js to confirm
  the dropdown is built from `PROVIDERS` and `list_configured_providers` is actually invoked. The runtime
  smoke (open Settings → dropdown lists all providers, configured ones marked) is covered by task 4.13.
- Run the workspace gates to confirm nothing else regressed.

### Commands to run (capture exit codes)
```
cargo build --manifest-path paperboy-app/src-tauri/Cargo.toml
grep -n "fn open_file\|fn save_file_as"      paperboy-app/src-tauri/src/main.rs   # empty
grep -n "open_file\|save_file_as"            paperboy-app/src-tauri/src/main.rs   # empty (incl handler)
grep -n "list_configured_providers"          paperboy-app/src/scripts/settings.js # MUST show invoke(...)
grep -n "import .*@proticom/paperboy-ai"     paperboy-app/src/scripts/settings.js # empty
npm run build     --workspaces --if-present
npm run typecheck --workspaces --if-present
npm test          --workspaces --if-present
```

### Definition of done
- `open_file` and `save_file_as` are gone from `main.rs` (defs + handler); `cargo build` is clean.
- The Settings provider `<select>` is populated at runtime from the catalog; every provider is selectable;
  providers with a stored key are visibly marked using `list_configured_providers` (so that command is now
  live, not dead).
- No bare-specifier import was added to `settings.js`; the current `settings.provider` selection is
  preserved after (re)populating.
- Workspace build/typecheck/test stay green.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- The spec offers "replace with `read_keychain`/`write_keychain` … or delete them." I recommend DELETE,
  because the keychain read/write/delete commands already exist (`get_api_key`/`set_api_key`/
  `delete_api_key`) and are wired. If you have a reason to rename those to `read_keychain`/`write_keychain`
  instead, reply with the plan (and update settings.js call sites) — but do not leave the dead file
  commands in place.

## Decision
send_to_builder
