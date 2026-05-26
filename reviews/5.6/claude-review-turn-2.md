# 5.6 - Review Turn 2

## Task Context
- Task id: 5.6
- Task title: Write `release-desktop.yml` CI workflow
- Dashboard implementation status: in_progress → completed-pending-dashboard-sync
- Review status: waiting_for_reviewer → review_passed
- Turn 1 routed the workflow spec to the builder (single new file `.github/workflows/release-desktop.yml`, ~150 lines, 3-job topology with `tauri-apps/tauri-action@v0`).
- Cursor's turn-1 reply at `reviews/5.6/cursor-reply-turn-1.md` reports the file added with two minor deviations from my draft (still within turn-1 latitude):
  1. **Separate `rustup target add` step gated on `matrix.target != ''`** instead of relying on `dtolnay/rust-toolchain`'s `targets:` input. Functionally equivalent — both ensure aarch64-apple-darwin + x86_64-apple-darwin targets exist on the mac runner before `tauri build --target universal-apple-darwin` runs.
  2. **Manifest JSON via `jq -n`** instead of a bash heredoc. STRICTLY BETTER — produces guaranteed-valid JSON regardless of newlines in release notes; eliminates a class of escaping bugs.
- Files inspected (turn 2):
  - `.github/workflows/release-desktop.yml` — new file, 235 lines, header comment intact, structure matches spec verbatim.
  - `paperboy-app/src-tauri/tauri.conf.json` — UNCHANGED (verified via `jq` — bundle.targets + plugins.updater keys identical to 5.5 post-state).
  - `package.json`, `paperboy-app/package.json` — UNCHANGED (verified via `git status` scope check).
  - `paperboy-site/**` — UNCHANGED (the site-PR step writes at workflow runtime, not in this diff).
- Commands run (turn 2, verification):
  - `ruby -ryaml -e 'YAML.load_file(...)'` → YAML OK; trigger `app-v*`; concurrency group + cancel-in-progress present; permissions `contents:write + id-token:write`; jobs `[create-release, build, publish-release]`; matrix 3 entries (macos-14 universal-apple-darwin / windows-2022 / ubuntu-22.04).
  - `grep -n "tauri-apps/tauri-action"` → 1 hit at line 125, `@v0` pin.
  - `grep -n "if: env.SITE_TOKEN"` → 1 hit at line 212.
  - `grep -n "rustup target add"` → 1 hit at line 96 (gated by `matrix.target != ''`, fires on mac only).
  - `grep -n "jq -n"` → 1 hit at line 193 (manifest emission).
  - `git status --short .claude/ paperboy-app/ paperboy-site/ paperboy-cli/ paperboy-converter/ paperboy-widget/ paperboy-ext/ paperboy-ai/ scripts/ package.json` → empty. Only `.github/workflows/release-desktop.yml` is new.
  - `npm test --workspaces --if-present` → 5 suites, 52/52 passing (baseline matched).
  - `npm run build --workspaces --if-present` → all green (paperboy-widget 35.7kb, paperboy-ext sidepanel 293.4kb, etc.).
  - `jq '.bundle.targets, (.plugins.updater | keys)' paperboy-app/src-tauri/tauri.conf.json` → `["dmg","nsis","deb","appimage"]` + `["active","dialog","endpoints","pubkey","windows"]` (5.1-5.5 intact).

## Findings

### Verification of turn-1 required fix (the workflow file)
- Severity: pass
- Location: `.github/workflows/release-desktop.yml` lines 1-235.
- Status: All turn-1 requirements satisfied.
  - **Header comment block (lines 1-23):** documents soft-guarded vs hard-required secrets — present, matches spec, includes the `.app.tar.gz` / `.sig` caveat when `TAURI_SIGNING_PRIVATE_KEY` is unset.
  - **Trigger (lines 27-30):** `on.push.tags: ['app-v*']` — verbatim spec match.
  - **Concurrency (lines 32-34):** `group: release-desktop-${{ github.ref }}, cancel-in-progress: true` — matches open-question Q9 decision (concurrency guard included).
  - **Permissions (lines 36-38):** `contents: write` + `id-token: write` — matches spec (release upload + future-proof OIDC).
  - **3-job topology:** `create-release` (lines 41-66, draft) → `build` (lines 68-141, matrix needs create-release) → `publish-release` (lines 143-234, needs build, flips draft + writes manifests + opens site PR). Verbatim.
  - **Matrix (lines 73-78):** exactly 3 entries — `macos-14`+`universal-apple-darwin`, `windows-2022`+empty target, `ubuntu-22.04`+empty target. The literal `ubuntu-22.04` matches plan; line 77 comments the 24.04 fallback if `libwebkit2gtk-4.1-dev` is unavailable. Open question Q2 honored.
  - **`tauri-apps/tauri-action@v0` (line 125):** present, v0 float (will resolve to latest v0.5.x at runtime). `projectPath: paperboy-app`, `releaseId` plumbed from `create-release.outputs.release_id`, `args` conditionally includes `--target {target}` only when set.
  - **Secrets env block (lines 127-137):** all 11 secrets listed — Apple 6 (hard-required on mac), Windows 2 (soft-guarded inside action), Tauri updater 2 (soft-guarded inside action), GITHUB_TOKEN. Matches spec verbatim.
  - **Rust target install (lines 94-96):** gated by `matrix.target != ''`. Fires only on the mac entry. Adds both archs. This is slightly different from my turn-1 draft (which passed `targets:` to `dtolnay/rust-toolchain`); the explicit `rustup target add` step is equally valid and arguably more readable.
  - **Linux apt deps (lines 103-115):** gated by `matrix.os == 'ubuntu-22.04'`. Includes `libwebkit2gtk-4.1-dev` + `libappindicator3-dev` + `librsvg2-dev` + `patchelf` + `libssl-dev` + `build-essential` + `file` + `wget`. Matches spec.
  - **`npm ci` at root (line 118):** workspace install, matches `ci.yml` pattern.
  - **`sync:vendor` step (lines 120-122):** `working-directory: paperboy-app`, runs `npm run sync:vendor`. Required pre-tauri-build step.
  - **Publish-release: flip draft (lines 150-154):** `softprops/action-gh-release@v2` with `draft: false`.
  - **Manifest generation (lines 156-203):** loops over `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64` (Linux skipped per plan line 167); uses regex patterns `\.app\.tar\.gz$` (mac) + `-setup\.nsis\.zip$` (win); resolves `ASSET_URL` via `gh release view --json assets | jq`; resolves `ASSET_NAME` for `.sig` lookup; downloads signature via `curl` when present; emits JSON via `jq -n` (cleaner than heredoc); writes to `updates/{KEY}/{VERSION}`; gracefully skips a target when no matching asset (mac case when `TAURI_SIGNING_PRIVATE_KEY` is unset — `.app.tar.gz` won't exist).
  - **Manifest artifact upload (lines 205-209):** unconditional — manifests always available as a workflow artifact `updater-manifests` for manual review.
  - **Site PR step (lines 211-234):** `if: env.SITE_TOKEN != ''` soft-guard; clones via `x-access-token:${SITE_TOKEN}@github.com/proticom/paperboy-site.git`; checks out `updates/{VERSION}` branch; copies `$GITHUB_WORKSPACE/updates/.` to `public/updates/`; `git add` + `commit` + `git push -f` (handles retag per open-question Q3); `gh pr create --repo proticom/paperboy-site --base master --head updates/{VERSION}` with deterministic title + body; **both `SITE_TOKEN` AND `GH_TOKEN` are set to the PAT** (this is the correct way — `gh` reads `GH_TOKEN` to authenticate against the cross-repo target).
- Spec mismatch / risk: none. The two cursor-flagged deviations (separate `rustup target add` step + `jq -n` for manifest JSON) are both within builder discretion and arguably improvements over my turn-1 draft.
- Validation: all 10 turn-1 validation commands re-run in turn 2; all pass.

  ```bash
  # Re-verified at turn 2, cwd=/Users/edward/MSDev/projects/paperboy

  $ ruby -ryaml -e 'w = YAML.load_file(".github/workflows/release-desktop.yml"); puts "YAML OK"; puts w[true]["push"]["tags"].inspect; puts w["jobs"].keys.inspect; w["jobs"]["build"]["strategy"]["matrix"]["include"].each { |e| puts "#{e["os"]} #{e["target"].inspect}" }'
  YAML OK
  ["app-v*"]
  ["create-release", "build", "publish-release"]
  macos-14 "universal-apple-darwin"
  windows-2022 ""
  ubuntu-22.04 ""

  $ grep -c "tauri-apps/tauri-action@v0" .github/workflows/release-desktop.yml
  1

  $ grep -c "if: env.SITE_TOKEN != ''" .github/workflows/release-desktop.yml
  1

  $ git status --short .claude/ paperboy-app/ paperboy-site/ paperboy-cli/ paperboy-converter/ paperboy-widget/ paperboy-ext/ paperboy-ai/ scripts/ package.json
  (empty)

  $ git status --short .github/
  ?? .github/workflows/release-desktop.yml

  $ npm test --workspaces --if-present 2>&1 | grep -E "Tests " | tail
   Tests  9 passed (9)
   Tests  6 passed (6)
   Tests  19 passed (19)
   Tests  6 passed (6)
   Tests  12 passed (12)
  # → 52/52 (matches 5.5 baseline)

  $ npm run build --workspaces --if-present 2>&1 | tail -3
    dist/paperboy-widget.min.js  35.7kb
  ⚡ Done in 5ms
  Built dist/paperboy-widget.min.js (v0.2.2)

  $ jq '.bundle.targets, (.plugins.updater | keys)' paperboy-app/src-tauri/tauri.conf.json
  ["dmg","nsis","deb","appimage"]
  ["active","dialog","endpoints","pubkey","windows"]
  ```

## Builder Prompt
No further builder work required. Decision routes to the decider.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix (no blockers in turn 2)
- [x] Every required finding has a validation command (all turn-1 commands re-run and pass in turn 2)
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions: No open questions.
- Turn-1 open questions (mac matrix shape, ubuntu version, manifest filename, concurrency, etc.) were all resolved by decision flags in turn 1. The two minor deviations in cursor's reply (rustup step shape + jq manifest emission) are within latitude and the builder explicitly flagged them in the summary.

## Decision
review_passed

## Notes (becomes the dashboard `--note`)
5.6 turn 2: PASS. `.github/workflows/release-desktop.yml` added verbatim per turn-1 spec — 3-job topology (create-release draft → build matrix → publish-release), `tauri-apps/tauri-action@v0`, matrix `macos-14`+`universal-apple-darwin` / `windows-2022` / `ubuntu-22.04`, soft-guards on Windows cert + updater key + site PAT, per-platform manifests for `darwin-aarch64`/`darwin-x86_64`/`windows-x86_64` (no Linux per plan line 167), site-PR via `git push -f` + `gh pr create` against `paperboy-site` master when PAT present else artifact upload only. Minor builder deviations (separate `rustup target add` step + `jq -n` for manifest JSON) are within latitude. Scope clean — only `.github/` touched; 5.1-5.5 config intact; npm tests 52/52, builds green.
