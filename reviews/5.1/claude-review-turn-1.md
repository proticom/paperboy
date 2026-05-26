# 5.1 - Review Turn 1

## Task Context
- Task id: 5.1
- Task title: Change tauri bundle targets to dmg/nsis/deb/appimage
- Dashboard implementation status: in_progress (queue auto-routed to reviewer at turn 1; no build commit exists yet — see Finding 1)
- Review status: in_review → waiting_for_builder
- Spec section: Phase 5 — Desktop distribution (mac/win/linux). Task 5.1 is the first 5.x task and the prerequisite for 5.2 (mac signing), 5.4 (Linux config), 5.6 (release CI), 5.8 (release tag). The plan (`paperboy-spec-tasks.json` meta `.cursor/plans/paperboy_production_readiness_02f05849.plan.md`) is not present locally, but the task title is unambiguous and the surrounding 5.x tasks frame the intent: stop bundling only macOS `.app` and start producing per-platform installers (`dmg` on mac, `nsis` on Windows, `deb` + `appimage` on Linux).
- Files inspected:
  - `paperboy-app/src-tauri/tauri.conf.json`:
    - L31: `"targets": "app"` — currently a string, only emits the macOS `.app` directory bundle. This is the SUT.
    - L29-37: `bundle` block — `active: true`, icons array, and `fileAssociations` already populated (md/markdown/txt/html/rtf/docx/pdf/epub/csv/xlsx/image extensions wired in earlier work, see commit `089fd16`). No `bundle.macOS`, `bundle.windows`, or `bundle.linux` subkeys exist yet.
  - `paperboy-app/src-tauri/Cargo.toml` L1-30: `tauri = { version = "2", ... }`, `tauri-build = { version = "2", ... }`. Confirmed Tauri v2, so the valid `bundle.targets` values are: `app`, `dmg`, `appimage`, `deb`, `rpm`, `msi`, `nsis`, `updater`. (Tauri v2 dropped `wix` in favor of `nsis` as the default Windows installer.)
  - `paperboy-app/src-tauri/icons/`: present icons are `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`, `icon.png`. **Missing Linux-sized PNGs (e.g. `256x256.png`)** for AppImage/deb, but that's explicitly task **5.7** ("Add missing platform icon sizes") — not in scope for 5.1.
  - `.github/workflows/`: existing `ci.yml`, `publish-paperboy.yml`, `publish-paperboy-converter.yml`, `publish-paperboy-widget.yml`, `publish-paperboy-ai.yml`, `supply-chain-guard.yml`. **No `release-desktop.yml`** — that's task 5.6, not 5.1.
  - `.claude/skills/cargo-build/SKILL.md` L16: "After any change to `paperboy-app/src-tauri/tauri.conf.json` … needs a full rebuild for the Info.plist to regenerate." Local validation of new targets requires a full `cargo build --release` via `tauri build`. That's expensive (~5 min cached); skip the real bundle build in CI/local for this task — `tauri build --help` and a static config-schema validation are enough to gate the turn.
- Commands run:
  - `jq '.groups[] | .tasks[]? | select(.id == "5.1")' paperboy-spec-tasks.json` → confirmed title + `in_progress` / `in_review`.
  - `cat paperboy-app/src-tauri/tauri.conf.json | jq '.bundle.targets'` → `"app"` (string, single target).
  - `ls paperboy-app/src-tauri/icons/` → 6 icons (no Linux 256/512 PNGs).
  - `git log --oneline -3` → last commit `4afc983` (4.13 review_passed), no 5.1 commit exists.
  - `find .github/workflows -name "release*"` → 0 hits.
- Current claim being verified: none. Queue auto-activated 5.1 when 4.13 closed; treating as a turn-1 spec review and routing the work to the builder via the Builder Prompt below.

## Findings

### Finding 1: `bundle.targets` is currently `"app"` (string) — only macOS .app is built; switch to array of platform installers
- Severity: required
- Location:
  - `paperboy-app/src-tauri/tauri.conf.json:31` — `"targets": "app"`.
- Problem: Phase 5 needs per-platform distributable installers — `.dmg` for macOS (instead of a bare `.app` directory that users have to drag-drop), `.exe` via NSIS for Windows, `.deb` + `.AppImage` for Linux. The current `"targets": "app"` only emits the unsigned macOS `.app` directory and skips every other platform's installer pipeline. Tauri v2 supports the `targets` key as either a special string (`"all"`) or an array of canonical names (`["dmg", "nsis", "deb", "appimage"]`). The task title literally names the four targets to add. No additional `bundle.macOS` / `bundle.windows` / `bundle.linux` subkeys are needed for 5.1 — those land in 5.2 (mac signing/notarize), 5.4 (Linux maintainer/deb/AppImage metadata), and 5.7 (icon sizes). Keep this turn surgical: change one JSON value, verify the config still parses, and let downstream tasks add the platform-specific metadata.
- Required fix (Builder): Edit `paperboy-app/src-tauri/tauri.conf.json` so the `bundle.targets` field is an array of the four canonical Tauri v2 installer names:
  ```json
  "targets": ["dmg", "nsis", "deb", "appimage"]
  ```
  Do NOT add `app` to the array (the goal is to STOP producing the bare `.app` directory; `dmg` includes the `.app` internally on macOS). Do NOT add `bundle.macOS`, `bundle.windows`, or `bundle.linux` subkeys yet (those are 5.2 / 5.4). Do NOT touch icons (that is 5.7). Do NOT touch CI workflows (that is 5.6).
- Spec mismatch / risk: One risk: a local `tauri build` on macOS will now attempt the `dmg` bundler. That requires `create-dmg` (Tauri auto-fetches the helper on first run) and may hit notarization paths once 5.2 is wired. For turn 1 we will NOT run a full `tauri build`; we only verify the JSON parses and Tauri's config validator accepts the targets list. The first real bundle build happens after 5.2 + 5.7 land.
- Validation:
```bash
# Verify JSON parses and the targets field is now an array of the four installers
jq '.bundle.targets' /Users/edward/MSDev/projects/paperboy/paperboy-app/src-tauri/tauri.conf.json
# expected output:
# [
#   "dmg",
#   "nsis",
#   "deb",
#   "appimage"
# ]

# Verify only one key changed (no stray edits)
cd /Users/edward/MSDev/projects/paperboy && git diff --stat paperboy-app/src-tauri/tauri.conf.json
# expected: 1 file changed, 1 insertion(+), 1 deletion(-)

# Verify the schema validator is happy. Tauri ships a JSON schema we can run against.
node -e "const ajv=require('ajv').default ? new (require('ajv').default)({strict:false}) : new (require('ajv'))({strict:false}); const c=require('/Users/edward/MSDev/projects/paperboy/paperboy-app/src-tauri/tauri.conf.json'); console.log('targets:', c.bundle.targets); console.log('targets type:', Array.isArray(c.bundle.targets) ? 'array' : typeof c.bundle.targets); if(!Array.isArray(c.bundle.targets)) process.exit(2); const allowed=new Set(['app','dmg','appimage','deb','rpm','msi','nsis','updater']); for (const t of c.bundle.targets){ if(!allowed.has(t)){console.error('invalid target', t); process.exit(3);} } console.log('OK');" 2>&1 || echo "(if ajv missing, skip; raw type check is the gate)"

# Verify cargo can still parse the workspace (cheap — does NOT build the bundle)
cd /Users/edward/MSDev/projects/paperboy/paperboy-app/src-tauri && cargo check --offline 2>&1 | tail -3
# expected: "Finished `dev` profile" or "Checking ..." with no errors

# Workspace test/build still green (nothing source-side changed)
cd /Users/edward/MSDev/projects/paperboy && npm test --workspaces --if-present 2>&1 | grep -E "Test Files|Tests "
# expected: same 5 suites, 52 / 52 tests pass
cd /Users/edward/MSDev/projects/paperboy && npm run build --workspaces --if-present 2>&1 | tail -3
# expected: all workspace builds green
```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 5.1.

Objective: Change the macOS-only `.app` bundle output to a cross-platform installer set by switching `bundle.targets` in `paperboy-app/src-tauri/tauri.conf.json` from the string `"app"` to the array `["dmg", "nsis", "deb", "appimage"]`. Keep the change surgical — one key, one file. No other config, source, icon, CI, or workspace edits.

Files to edit:
1. `paperboy-app/src-tauri/tauri.conf.json` — change `"targets": "app"` to `"targets": ["dmg", "nsis", "deb", "appimage"]`. Preserve existing 2-space indentation and key ordering. The file is JSON (the `$schema` line points to Tauri's published config schema); keep it strictly valid JSON.

Files NOT to edit:
- `paperboy-app/src-tauri/tauri.conf.json` other fields — leave `bundle.active`, `bundle.icon`, `bundle.fileAssociations`, and everything outside the `bundle` block untouched.
- `paperboy-app/src-tauri/Cargo.toml`, `paperboy-app/src-tauri/src/**` — no Rust changes.
- `paperboy-app/src-tauri/icons/**` — 5.7 adds missing sizes; not this task.
- `paperboy-app/package.json`, `paperboy-app/scripts/**`, `paperboy-app/src/**` — no frontend or build-script changes.
- `.github/workflows/**` — 5.6 wires the release workflow; not this task.
- Any other workspace (`paperboy-cli`, `paperboy-widget`, `paperboy-converter`, `paperboy-ai`, `paperboy-ext`) — not touched.
- `paperboy-site/**` — site repo not touched.

Implementation notes:
- Tauri v2 canonical target names (lowercase): `app`, `dmg`, `appimage`, `deb`, `rpm`, `msi`, `nsis`, `updater`. Use exactly `["dmg", "nsis", "deb", "appimage"]` — all lowercase, in that order, no `app`.
- Do NOT add a `"bundle.macOS"`, `"bundle.windows"`, or `"bundle.linux"` block. Those metadata blocks (signing identity, NSIS template, deb maintainer, AppImage runtime) are scoped to tasks 5.2 / 5.4. Adding them now would conflict with the next two reviews.
- Do NOT run a full `tauri build` locally. `dmg` would trigger a 5+ min build and may attempt to pull `create-dmg`. Static schema validation + `cargo check` is the turn-1 gate; the real cross-platform bundle build is gated by 5.6's CI workflow.
- The Synology-NAS / `CARGO_TARGET_DIR` setup from the `cargo-build` skill is NOT needed for turn 1 — `cargo check --offline` in-tree is fine and quick.

Tests to add: none. This task is a static config flip with no behavior to assert; the surrounding 5.x tasks add the platform-specific config that needs testing.

Commands to run (capture exit codes in your reply):
```bash
# 1. Confirm the diff is exactly one field
cd /Users/edward/MSDev/projects/paperboy && git diff paperboy-app/src-tauri/tauri.conf.json
# expected: -  "targets": "app",
#           +  "targets": ["dmg", "nsis", "deb", "appimage"],
git diff --stat paperboy-app/src-tauri/tauri.conf.json
# expected: 1 file changed, 1 insertion(+), 1 deletion(-)

# 2. Verify JSON still parses and `targets` is the expected array
jq '.bundle.targets' paperboy-app/src-tauri/tauri.conf.json
# expected:
# [
#   "dmg",
#   "nsis",
#   "deb",
#   "appimage"
# ]
node -e "const c=require('./paperboy-app/src-tauri/tauri.conf.json'); if(!Array.isArray(c.bundle.targets)) process.exit(1); const expected=['dmg','nsis','deb','appimage']; const actual=c.bundle.targets; if(expected.length!==actual.length || expected.some((t,i)=>actual[i]!==t)) process.exit(2); console.log('OK');"
# expected: OK   (exit 0)

# 3. Cargo still parses the workspace (cheap; ~3-10s)
cd /Users/edward/MSDev/projects/paperboy/paperboy-app/src-tauri && cargo check --offline 2>&1 | tail -3
# expected: "Finished ..." with no errors

# 4. Tauri config-schema acceptance (recommended; skip if tauri CLI is sandbox-restricted)
cd /Users/edward/MSDev/projects/paperboy/paperboy-app && npx tauri info 2>&1 | head -10
# expected: prints `tauri.conf.json` summary including "bundle: targets: dmg, nsis, deb, appimage" or equivalent; exit 0.

# 5. Workspace test/build still green (nothing source-side changed)
cd /Users/edward/MSDev/projects/paperboy && npm test --workspaces --if-present 2>&1 | grep -E "Test Files|Tests "
# expected: 52 / 52 tests pass across 5 suites
cd /Users/edward/MSDev/projects/paperboy && npm run build --workspaces --if-present 2>&1 | tail -3
# expected: all workspace builds green
```

Definition of done (turn 1):
- `paperboy-app/src-tauri/tauri.conf.json` `bundle.targets` is `["dmg", "nsis", "deb", "appimage"]` — array, exact strings, exact order.
- No other field touched in `tauri.conf.json` (confirmed by `git diff --stat` showing 1 insertion, 1 deletion).
- No other file touched in the monorepo (confirmed by `git status --short` showing only `paperboy-app/src-tauri/tauri.conf.json`).
- `cargo check --offline` passes.
- `npm test --workspaces --if-present` still 52 / 52.
- `npm run build --workspaces --if-present` still green.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Should we include `"app"` alongside `["dmg", "nsis", "deb", "appimage"]`? Decision: **no**. The `dmg` bundler internally produces and packages the `.app`, so retaining `app` as a separate target would just emit a redundant bare-directory bundle. The cargo-build skill's `Paperboy.app` is fetched from inside the `dmg`'s contents in 5.2+ flows. If a developer wants the bare `.app` for local install, they can run `tauri build --bundles app` ad-hoc — that override still works.
- Should `rpm` be added? **No** — task title scopes to `dmg/nsis/deb/appimage`. RPM coverage isn't in the plan; leave it for a future cleanup if a Fedora/RHEL distribution path becomes needed.
- Should `updater` be added now? **No** — task 5.5 ("Add tauri-plugin-updater and latest.json endpoint") adds the updater target alongside its config; pre-adding it here would create an empty updater bundle that has no signing key wired.

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
5.1 turn 1: `tauri.conf.json` currently has `"targets": "app"` (string, macOS-only `.app` directory). Change to array `["dmg", "nsis", "deb", "appimage"]` per task title. Single-field flip; no other config, source, icon, or CI edits in this turn (those land in 5.2 / 5.4 / 5.6 / 5.7). Validation: `jq '.bundle.targets'` == 4-item array, `cargo check --offline` green, workspace tests 52/52 still pass.
