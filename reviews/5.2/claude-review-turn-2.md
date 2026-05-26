# 5.2 - Review Turn 2

## Task Context
- Task id: 5.2
- Task title: Add macOS signing and notarization config
- Dashboard implementation status: in_progress -> ready for review_passed
- Review status: waiting_for_reviewer -> review_passed
- Turn: 2 (verifying cursor's builder reply against the turn-1 Builder Prompt)
- Spec sections: Phase 5 — Desktop distribution. 5.1 (targets) is `review_passed`; 5.3/5.8/5.9/6.4 deferred; 5.4 (Linux config) activates next.
- Builder reply under review: `reviews/5.2/cursor-reply-turn-1.md`
- Files verified:
  - `paperboy-app/src-tauri/tauri.conf.json` — new `bundle.macOS` block present after `fileAssociations`
  - `paperboy-app/src-tauri/Entitlements.plist` — new file, valid plist XML, 8 keys
- Commands run (this turn):
  - `git status --short paperboy-app/src-tauri/` → exactly two lines: ` M tauri.conf.json`, `?? Entitlements.plist`
  - `jq empty paperboy-app/src-tauri/tauri.conf.json` → exit 0
  - `jq '.bundle.macOS' …` → 6-key object: `signingIdentity:null, providerShortName:null, entitlements:"Entitlements.plist", minimumSystemVersion:"10.13", frameworks:[], exceptionDomain:null`
  - `jq '.bundle.targets' …` → `["dmg","nsis","deb","appimage"]` (5.1 intact, no regression)
  - `plutil -lint paperboy-app/src-tauri/Entitlements.plist` → OK
  - `plutil -p … | grep "com.apple.security" | wc -l` → 8 keys, sorted output matches turn-1 expected list exactly (allow-jit:true, allow-unsigned-executable-memory:true, disable-library-validation:true, network.client:true, network.server:true, files.user-selected.read-write:true, files.downloads.read-write:true, automation.apple-events:false)
  - `cargo check --offline` (in src-tauri) → `Finished 'dev' profile … in 0.36s` (no errors, no warnings)
  - `npm test --workspaces --if-present` → 5 suites, 52/52 tests (9+6+19+6+12)
  - `npm run build --workspaces --if-present` → all workspace builds green; widget bundle `dist/paperboy-widget.min.js 35.7kb`
  - `git status --short .claude/ .github/` → empty (no skill or CI edits)
- Last monorepo commit prior to this turn: `3f92557` (5.2 send_to_builder turn 1).

## Findings

### Finding 1 (turn 1): `bundle.macOS` block + `Entitlements.plist` — RESOLVED
- Severity: required → fixed
- Location: `paperboy-app/src-tauri/tauri.conf.json` (modified), `paperboy-app/src-tauri/Entitlements.plist` (new)
- Verification:
  - The `bundle.macOS` block in `tauri.conf.json` matches the turn-1 prescribed shape byte-for-byte (six keys in the prescribed order with the prescribed values).
  - `Entitlements.plist` is a valid Apple property list (`plutil -lint OK`), uses the standard DTD declaration, and contains exactly the 8 entitlement keys with the prescribed true/false values. No `com.apple.security.app-sandbox` was added (correctly avoided — that's the notarization-rejection trap called out in turn 1).
  - `bundle.targets` is unchanged from 5.1's `["dmg","nsis","deb","appimage"]`.
  - Scope respected: zero changes under `.claude/`, `.github/`, `paperboy-app/src-tauri/src/`, `paperboy-app/src-tauri/Cargo.toml`, `paperboy-app/src-tauri/icons/`, `paperboy-app/src/`, `paperboy-app/scripts/`, `paperboy-app/package.json`, or any other workspace. The diff is exactly two paths: one modified, one new.
  - `cargo check --offline` succeeds against the modified config (Tauri v2's schema validator parses the new `bundle.macOS` block cleanly).
  - Workspace tests + builds are unaffected (52/52 tests, all builds green) — expected since this is static signing config that only takes effect during `tauri build`.
- Required fix: none — turn-1 fix verified delivered exactly as specified; no further builder action required.
- Validation (re-run on turn 2):

```bash
# 1. Exactly two paths changed
cd /Users/edward/MSDev/projects/paperboy && git status --short paperboy-app/src-tauri/
#  M paperboy-app/src-tauri/tauri.conf.json
# ?? paperboy-app/src-tauri/Entitlements.plist

# 2. JSON parses and bundle.macOS has exact shape
jq empty paperboy-app/src-tauri/tauri.conf.json                                   # exit 0
jq '.bundle.macOS' paperboy-app/src-tauri/tauri.conf.json
# {
#   "signingIdentity": null,
#   "providerShortName": null,
#   "entitlements": "Entitlements.plist",
#   "minimumSystemVersion": "10.13",
#   "frameworks": [],
#   "exceptionDomain": null
# }

# 3. 5.1 targets intact
jq '.bundle.targets' paperboy-app/src-tauri/tauri.conf.json
# ["dmg","nsis","deb","appimage"]

# 4. Entitlements.plist lints + 8 keys with correct values
plutil -lint paperboy-app/src-tauri/Entitlements.plist                            # OK
plutil -p paperboy-app/src-tauri/Entitlements.plist | grep "com.apple.security" | wc -l   # 8

# 5. Cargo + tests + builds
cd /Users/edward/MSDev/projects/paperboy/paperboy-app/src-tauri && cargo check --offline  # Finished
cd /Users/edward/MSDev/projects/paperboy && npm test --workspaces --if-present            # 52/52
cd /Users/edward/MSDev/projects/paperboy && npm run build --workspaces --if-present       # all green

# 6. Scope guard
cd /Users/edward/MSDev/projects/paperboy && git status --short .claude/ .github/          # empty
```

No new findings. The change is surgical, correct, and matches the turn-1 Builder Prompt verbatim.

## Builder Prompt
N/A — review_passed; no further builder turn needed.

## Consensus Checklist
- [x] Every blocker finding from turn 1 is fixed
- [x] Every required finding from turn 1 is verified with re-run commands
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- None new. Turn-1 open questions (minimumSystemVersion 10.13 vs 11.0; no app-sandbox; no allow-dyld-environment-variables; explicit `frameworks:[]`; no `bundle.macOS.dmg` polish) are all decided as documented in the turn-1 review and the cursor reply honored those decisions.

The first real end-to-end notarization check happens when 5.6 (release-desktop.yml CI) wires the `APPLE_*` secrets and tauri-action runs against this config. That's intentional — 5.2 ships the static config only, per the brief.

## Decision
review_passed

## Notes (becomes the dashboard `--note`)
5.2 turn 2: `bundle.macOS` block + `Entitlements.plist` match the turn-1 Builder Prompt verbatim. Verified: jq shape (6 keys), plutil -lint OK, 8 entitlement keys with correct true/false, 5.1 targets intact, no .claude/.github/Rust edits, cargo check clean, 52/52 tests, all builds green. Surgical two-file change. Review passed.
