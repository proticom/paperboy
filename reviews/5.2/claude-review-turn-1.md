# 5.2 - Review Turn 1

## Task Context
- Task id: 5.2
- Task title: Add macOS signing and notarization config
- Dashboard implementation status: in_progress (queue auto-routed to reviewer at turn 1; no build commit exists yet — see Finding 1)
- Review status: in_review → waiting_for_builder
- Spec sections: Phase 5 — Desktop distribution. 5.2 sits between 5.1 (now `review_passed`, `bundle.targets` includes `dmg`) and 5.6 (release CI). 5.3 (Windows cert procurement) and 5.8 (release tag) are **deferred operational** items; 5.6 (`release-desktop.yml`) will wire CI secrets and `tauri-action` env vars. Per the brief: the macOS signing **config** is in scope here (the JSON block in `tauri.conf.json` + the entitlements plist that hardened runtime needs); the actual signing/notarization run is operational and is already handled by the project skill `/tauri-sign` (`.claude/skills/tauri-sign/SKILL.md`) — do NOT duplicate that skill.
- Files inspected:
  - `paperboy-app/src-tauri/tauri.conf.json` L29-L37: `bundle` block currently contains only `active`, `targets`, `icon`, `fileAssociations`. No `macOS` subkey, no `signingIdentity`, no `entitlements`, no `minimumSystemVersion`. The 5.1 flip is already in place: `"targets": ["dmg", "nsis", "deb", "appimage"]`.
  - `paperboy-app/src-tauri/` directory listing — confirmed via `find … -name "*.plist" -o -name "*.entitlements"` returns 0 hits. **No entitlements file exists yet.** Tauri's default macOS bundle without explicit entitlements will sign with the system's generic hardened-runtime template, which blocks the WKWebView JIT and causes a notarization-acceptance / first-launch crash for a markdown editor that runs JS through WebKit.
  - `.github/workflows/`: `ci.yml`, `publish-paperboy*.yml`, `supply-chain-guard.yml`. No `release-desktop.yml` exists yet (that's 5.6). No `APPLE_*` secrets referenced anywhere in the repo (`grep -rn "APPLE_\|TAURI_SIGNING" .github paperboy-app` → 0 hits). Good — that means the CI/notary env wiring belongs in 5.6, not here.
  - `.claude/skills/tauri-sign/SKILL.md`: full 6-step `codesign` + `notarytool submit --keychain-profile paperboy-notary` + `stapler` + `spctl --assess` recipe already exists. It is the operational runbook. **The 5.2 config must be consistent with the assumptions this skill makes** (hardened runtime via `--options runtime`, Developer ID Application identity, deep signing, ditto-zip for notarization, stapler for both .app and .dmg).
  - `.claude/skills/cargo-build/SKILL.md`: builds the unsigned `.app` to `~/.cache/paperboy-target/release/bundle/macos/Paperboy.app`. The 5.2 entitlements file must apply to that exact bundle path when `codesign --deep --options runtime` runs against it.
  - `Cargo.toml` (tauri = 2, tauri-build = 2) confirms Tauri v2; the relevant config schema is `https://schema.tauri.app/config/2`. In Tauri v2, the macOS signing config lives under `bundle.macOS` with fields: `signingIdentity`, `providerShortName`, `entitlements`, `minimumSystemVersion`, `frameworks`, `exceptionDomain`, `dmg`. Hardened runtime is implicit when `signingIdentity` is set (Tauri passes `--options runtime` to `codesign`).
- Commands run:
  - `jq '.bundle | keys' paperboy-app/src-tauri/tauri.conf.json` → `["active","fileAssociations","icon","targets"]` (no `macOS` key, confirmed scope = greenfield).
  - `jq '."$schema"' paperboy-app/src-tauri/tauri.conf.json` → `"https://schema.tauri.app/config/2"` (Tauri v2).
  - `find paperboy-app/src-tauri -name "*.plist" -o -name "*.entitlements"` → 0 hits.
  - `grep -rn "APPLE_\|TAURI_SIGNING\|signingIdentity\|notarize" .github paperboy-app` → 0 hits.
  - `git log --oneline -3` → `9e1b31f` (5.1 review_passed) is most recent monorepo commit.
- Current claim being verified: none. Queue auto-activated 5.2 when 5.1 closed; treating as a turn-1 spec review and routing the work to the builder via the Builder Prompt below.

## Findings

### Finding 1: `tauri.conf.json` has no `bundle.macOS` block — add signing/notarization config consistent with the `/tauri-sign` skill
- Severity: required
- Location:
  - `paperboy-app/src-tauri/tauri.conf.json` L29-L37 — `bundle` block. After `fileAssociations` (the last existing key), add a sibling `macOS` object.
- Problem: When `tauri build` produces a `.dmg` (now that 5.1's `bundle.targets` includes `dmg`), the `.app` inside it must be sign-able with hardened runtime and notarizable. The current config has zero macOS-side metadata: no `signingIdentity` env-var pointer, no `entitlements` path, no `minimumSystemVersion`. Without these, `codesign --options runtime` (the `/tauri-sign` step 1) will produce an app that fails notarization because the hardened-runtime entitlements aren't declared in a plist, and Tauri's CI integration (`tauri-action`) cannot pick up the identity from `APPLE_SIGNING_IDENTITY` without the `signingIdentity` field being present (even when its value is `null` — the **key existing** is what tells Tauri to look at the env var).
- Spec mismatch / risk: The risk is double-coverage with 5.6 (CI workflow) or with the `/tauri-sign` operational skill. To keep 5.2 surgical:
  - **In scope:** static config inside `tauri.conf.json` (a new `bundle.macOS` block) **plus** a new `Entitlements.plist` file referenced from that block.
  - **Out of scope:** GitHub Actions secrets, `APPLE_*` env-var declarations, `notarytool` `store-credentials` setup, `.github/workflows/release-desktop.yml` — all of those are 5.6 territory (or the operational `/tauri-sign` skill).
  - **Out of scope:** any human-action runbook for procuring the Developer ID Application cert — that's a one-time setup step the `/tauri-sign` skill's "Prerequisites" already documents.
- Required fix (Builder):

  **(a)** Edit `paperboy-app/src-tauri/tauri.conf.json` and add a `macOS` key to the `bundle` block, after `fileAssociations`. Use this exact shape:

  ```json
  "macOS": {
    "signingIdentity": null,
    "providerShortName": null,
    "entitlements": "Entitlements.plist",
    "minimumSystemVersion": "10.13",
    "frameworks": [],
    "exceptionDomain": null
  }
  ```

  Field-by-field rationale:
  - `signingIdentity: null` — Tauri v2 will read `APPLE_SIGNING_IDENTITY` env var at build time when this is null. The **key must exist** for Tauri to consult the env var. CI (5.6) sets the env var; local dev builds (`cargo-build` skill) leave it unset and get an unsigned `.app`.
  - `providerShortName: null` — only needed for App Store Connect (TestFlight). Not needed for Developer ID distribution. Keep null/explicit to make intent clear.
  - `entitlements: "Entitlements.plist"` — path is **relative to `src-tauri/`** per Tauri v2 schema. The plist must exist at `paperboy-app/src-tauri/Entitlements.plist`.
  - `minimumSystemVersion: "10.13"` — matches Tauri v2's default (High Sierra). Conservative; the WKWebView APIs Paperboy uses are all 10.13+.
  - `frameworks: []` — explicit empty array. No extra frameworks bundled.
  - `exceptionDomain: null` — no ATS exceptions needed; all converter network calls go to public HTTPS endpoints.

  **(b)** Create `paperboy-app/src-tauri/Entitlements.plist` with hardened-runtime entitlements suitable for a WKWebView markdown editor. Use this exact content:

  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.files.downloads.read-write</key>
    <true/>
    <key>com.apple.security.automation.apple-events</key>
    <false/>
  </dict>
  </plist>
  ```

  Entitlement-by-entitlement rationale (each one is **required** for a Tauri/WKWebView markdown editor that does what Paperboy does):
  - `com.apple.security.cs.allow-jit: true` — WKWebView's JS engine uses JIT. Without this, the embedded WebView crashes on launch under hardened runtime.
  - `com.apple.security.cs.allow-unsigned-executable-memory: true` — same WebView/JS engine requirement; some V8/JSC paths allocate writable+executable pages.
  - `com.apple.security.cs.disable-library-validation: true` — Tauri's bundled `WebKit.framework` and `Tauri.framework` are signed by Apple/Tauri, not by us. Library validation would reject them under hardened runtime.
  - `com.apple.security.network.client: true` — converter calls public HTTPS endpoints (converter API, future updater). Hardened runtime blocks outbound HTTP without this.
  - `com.apple.security.network.server: true` — Tauri's dev IPC bridge binds a local socket. Production builds don't strictly need this, but it costs nothing and avoids a regression when devs run a release-mode `tauri dev` to repro something.
  - `com.apple.security.files.user-selected.read-write: true` — required for Paperboy's "Open File…" dialog and drag-drop import (cold-launch double-click, commit `6ba9b96`).
  - `com.apple.security.files.downloads.read-write: true` — required for `paperboy-app/src-tauri/src/lib.rs` save-as / export paths (PDF/HTML export targets `~/Downloads`).
  - `com.apple.security.automation.apple-events: false` — explicit deny. Paperboy doesn't drive AppleScript; declaring `false` here makes that intent reviewable.

  Do NOT add `com.apple.security.app-sandbox` — Paperboy is **not** sandboxed (it's a Developer ID app, not an App Store app). Adding sandbox entitlements without sandboxing the app is a notarization-rejection trap.

  **(c)** Do NOT touch:
  - `.github/workflows/**` — 5.6 wires `release-desktop.yml` and references `APPLE_SIGNING_IDENTITY`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_KEY_PATH` secrets. Not 5.2's job.
  - `.claude/skills/tauri-sign/SKILL.md` — already exists and is the operational runbook. Do NOT edit it. (If it referenced `Entitlements.plist` we'd want to confirm the path matches, but it doesn't — `codesign --deep --options runtime` reads entitlements that are **already embedded** at build time by `tauri build` via the config above.)
  - Rust sources (`paperboy-app/src-tauri/src/**`), frontend sources (`paperboy-app/src/**`), `Cargo.toml`, `package.json`, icons.
  - The other workspaces, `paperboy-site`, anywhere else.

- Validation:
```bash
# 1. Confirm only two paths are modified
cd /Users/edward/MSDev/projects/paperboy && git status --short paperboy-app/src-tauri/
# expected (two lines exactly):
#  M paperboy-app/src-tauri/tauri.conf.json
# ?? paperboy-app/src-tauri/Entitlements.plist

git diff --stat paperboy-app/src-tauri/tauri.conf.json
# expected: 1 file changed, ~9 insertions(+), ~1 deletion(-) (the `}` before `]` in fileAssociations becomes `},` plus the new macOS block).

# 2. JSON still parses
jq empty paperboy-app/src-tauri/tauri.conf.json
# expected: exit 0

jq '.bundle.macOS' paperboy-app/src-tauri/tauri.conf.json
# expected:
# {
#   "signingIdentity": null,
#   "providerShortName": null,
#   "entitlements": "Entitlements.plist",
#   "minimumSystemVersion": "10.13",
#   "frameworks": [],
#   "exceptionDomain": null
# }

# 3. Confirm 5.1's bundle.targets is still intact (no regression)
jq '.bundle.targets' paperboy-app/src-tauri/tauri.conf.json
# expected: ["dmg","nsis","deb","appimage"]

# 4. Entitlements.plist parses as a property list
plutil -lint paperboy-app/src-tauri/Entitlements.plist
# expected: paperboy-app/src-tauri/Entitlements.plist: OK

# 5. Verify the exact keys in the entitlements
plutil -p paperboy-app/src-tauri/Entitlements.plist | grep -E "allow-jit|allow-unsigned|disable-library|network|files|automation" | sort
# expected (8 lines):
#   "com.apple.security.automation.apple-events" => 0
#   "com.apple.security.cs.allow-jit" => 1
#   "com.apple.security.cs.allow-unsigned-executable-memory" => 1
#   "com.apple.security.cs.disable-library-validation" => 1
#   "com.apple.security.files.downloads.read-write" => 1
#   "com.apple.security.files.user-selected.read-write" => 1
#   "com.apple.security.network.client" => 1
#   "com.apple.security.network.server" => 1

# 6. Cargo workspace still compiles (cheap; ~3-10s)
cd /Users/edward/MSDev/projects/paperboy/paperboy-app/src-tauri && cargo check --offline 2>&1 | tail -3
# expected: "Finished ..." no errors

# 7. Workspace tests + builds still green (nothing source-side changed)
cd /Users/edward/MSDev/projects/paperboy && npm test --workspaces --if-present 2>&1 | grep -E "Test Files|Tests "
# expected: 5 suites, 52 tests total, all pass
cd /Users/edward/MSDev/projects/paperboy && npm run build --workspaces --if-present 2>&1 | tail -3
# expected: all workspace builds green

# 8. Confirm tauri-sign skill is NOT modified
cd /Users/edward/MSDev/projects/paperboy && git status --short .claude/skills/
# expected: empty (no changes under .claude/skills/)
```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 5.2.

Objective: Add the macOS signing + notarization **config** so that when CI (5.6) runs `tauri build` with the `APPLE_*` secrets exported, the resulting `.app` and `.dmg` are signed with hardened runtime, embed the right entitlements, and notarize cleanly via the existing `/tauri-sign` skill flow. This task adds **two files only** (one new, one modified) — no CI, no Rust, no skill-doc edits.

Files to edit / create:

1. **Edit** `paperboy-app/src-tauri/tauri.conf.json` — add a `macOS` key inside the `bundle` block, sibling to `active`/`targets`/`icon`/`fileAssociations`. Place it **after** `fileAssociations` (the last existing key). The block must be exactly:
   ```json
   "macOS": {
     "signingIdentity": null,
     "providerShortName": null,
     "entitlements": "Entitlements.plist",
     "minimumSystemVersion": "10.13",
     "frameworks": [],
     "exceptionDomain": null
   }
   ```
   Preserve existing 2-space indentation. Keep file strictly valid JSON. Do not reorder existing keys. Add a trailing comma to the closing `]` of `fileAssociations`.

2. **Create** `paperboy-app/src-tauri/Entitlements.plist` with the exact content shown in Finding 1(b) above (XML plist, 8 entitlement keys, hardened-runtime safe defaults for a Tauri WKWebView app).

Files NOT to edit:
- `paperboy-app/src-tauri/tauri.conf.json` fields other than the new `bundle.macOS` block and the trailing comma after `fileAssociations`. Specifically: do NOT touch `bundle.targets` (5.1's flip), `bundle.icon`, `bundle.fileAssociations`, `bundle.active`, `app.*`, `build.*`, `productName`, `version`, `identifier`, `$schema`.
- `paperboy-app/src-tauri/Cargo.toml`, `paperboy-app/src-tauri/src/**` — no Rust changes.
- `paperboy-app/src-tauri/icons/**` — 5.7 territory.
- `paperboy-app/package.json`, `paperboy-app/scripts/**`, `paperboy-app/src/**` — no frontend or build-script changes.
- `.github/workflows/**` — 5.6 wires the release workflow + secrets.
- `.claude/skills/tauri-sign/SKILL.md` and `.claude/skills/cargo-build/SKILL.md` — already exist and are correct; do NOT edit.
- Any other workspace (`paperboy-cli`, `paperboy-widget`, `paperboy-converter`, `paperboy-ai`, `paperboy-ext`).
- `paperboy-site/**` — site repo not touched.

Implementation notes:
- The `Entitlements.plist` filename and path are referenced from `bundle.macOS.entitlements` as the **relative** string `"Entitlements.plist"` (no leading slash, no `./`). Tauri resolves it relative to `src-tauri/`.
- `signingIdentity: null` is intentional. Tauri v2 reads `APPLE_SIGNING_IDENTITY` from the environment when this field is `null` AND the key exists. CI sets the env var; local dev leaves it unset and gets an unsigned `.app` (the `cargo-build` skill's current behavior — no regression).
- DO NOT add `com.apple.security.app-sandbox` to the entitlements. Paperboy is a Developer ID app, not sandboxed; adding sandbox entitlements without sandboxing is a notarization-rejection trap.
- DO NOT add `notarize` keys to the config. Tauri's GitHub Action handles notarization via `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` env vars at build time; the `/tauri-sign` skill handles it for local distribution. Both flows read the embedded entitlements from the signed `.app` — that's the only handoff point this task is responsible for.
- DO NOT run a full `tauri build` locally. Static schema validation + `plutil -lint` + `cargo check` is the turn-1 gate; the first real signed bundle is gated by 5.6's CI workflow.

Tests to add: none. This task is static config + a checked-in plist; the behavior it enables (signing/notarizing) is gated by CI secrets and verified end-to-end by 5.8's release tag.

Commands to run (capture exit codes in your reply):
```bash
# 1. Confirm exactly two paths changed (one M, one ??)
cd /Users/edward/MSDev/projects/paperboy && git status --short paperboy-app/src-tauri/
# expected:
#  M paperboy-app/src-tauri/tauri.conf.json
# ?? paperboy-app/src-tauri/Entitlements.plist

# 2. Confirm tauri.conf.json diff is the new macOS block + trailing comma only
git diff paperboy-app/src-tauri/tauri.conf.json | head -40
# expected: only the new `"macOS": { ... }` block + the trailing comma after `fileAssociations]`. No other edits.

# 3. JSON still parses + macOS block has the right shape
jq empty paperboy-app/src-tauri/tauri.conf.json
jq '.bundle.macOS' paperboy-app/src-tauri/tauri.conf.json
# expected: exit 0; prints the 6-key macOS object verbatim.

# 4. 5.1's targets array still intact
jq '.bundle.targets' paperboy-app/src-tauri/tauri.conf.json
# expected: ["dmg","nsis","deb","appimage"]

# 5. Entitlements.plist lints + has all 8 expected keys
plutil -lint paperboy-app/src-tauri/Entitlements.plist
# expected: paperboy-app/src-tauri/Entitlements.plist: OK
plutil -p paperboy-app/src-tauri/Entitlements.plist | grep -E "com\.apple\.security" | wc -l
# expected: 8

# 6. Cargo workspace still compiles
cd /Users/edward/MSDev/projects/paperboy/paperboy-app/src-tauri && cargo check --offline 2>&1 | tail -3
# expected: "Finished ..." no errors

# 7. Workspace tests + builds still green
cd /Users/edward/MSDev/projects/paperboy && npm test --workspaces --if-present 2>&1 | grep -E "Test Files|Tests "
# expected: 5 suites, 52 / 52 tests
cd /Users/edward/MSDev/projects/paperboy && npm run build --workspaces --if-present 2>&1 | tail -3
# expected: all green

# 8. Confirm no skill or CI edits
cd /Users/edward/MSDev/projects/paperboy && git status --short .claude/ .github/
# expected: empty
```

Definition of done (turn 1):
- `paperboy-app/src-tauri/tauri.conf.json` `bundle.macOS` block matches the exact shape in Finding 1(a).
- `paperboy-app/src-tauri/Entitlements.plist` exists, lints with `plutil -lint`, and contains exactly the 8 entitlement keys shown in Finding 1(b) with the specified true/false values.
- `bundle.targets` is still `["dmg","nsis","deb","appimage"]` (no 5.1 regression).
- `cargo check --offline` passes.
- `npm test --workspaces --if-present` still 52 / 52.
- `npm run build --workspaces --if-present` still green.
- No other file touched anywhere in the monorepo (confirmed by `git status --short`).

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Should `minimumSystemVersion` be `"11.0"` (Big Sur) instead of `"10.13"`? **Decision: `"10.13"`.** Matches Tauri v2's default. WebKit features Paperboy uses are 10.13+. Bumping to 11.0 would cut off Intel Macs running High Sierra/Mojave/Catalina with no observable Paperboy benefit. The DMG installer will still warn on systems below `minimumSystemVersion` — that's the correct UX. If telemetry later shows zero <11.0 traffic, bump in a follow-up.
- Should we add `com.apple.security.app-sandbox` entitlement? **Decision: NO.** Paperboy is a Developer ID app, not an App Store / sandboxed app. Adding sandbox entitlements without sandboxing the app is a notarization-rejection trap (Apple's notary service treats it as a misconfiguration). The `/tauri-sign` skill correctly signs without sandbox; the entitlements above match that.
- Should we add `com.apple.security.cs.allow-dyld-environment-variables`? **Decision: NO.** Paperboy doesn't need DYLD overrides; adding this widens the attack surface for nothing. If a future Rust dependency requires DYLD env vars, revisit then.
- Should `frameworks: []` even be present (vs. omitting the key)? **Decision: keep `[]` explicit.** Makes the intent (no extra bundled frameworks) reviewable. Tauri v2 ignores the empty array — no runtime cost.
- Should we also add `bundle.macOS.dmg` (background, window size, app/applications-link position)? **Decision: NO, not in 5.2.** That's installer polish, not signing/notarization config. If we want a custom DMG layout in a future task, scope it cleanly as "5.x-polish — DMG installer layout"; it doesn't affect signing or notarization correctness.

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
5.2 turn 1: `tauri.conf.json` has no `bundle.macOS` block and no `Entitlements.plist` exists. Add (1) `bundle.macOS` block with `signingIdentity:null` (env-var driven), `entitlements:"Entitlements.plist"`, `minimumSystemVersion:"10.13"`, and (2) a hardened-runtime `Entitlements.plist` with 8 keys (allow-jit, allow-unsigned-executable-memory, disable-library-validation, network.client/server, files.user-selected/downloads.read-write, automation.apple-events:false). Surgical: two files. No CI / no skill edits / no env-var setup (5.6 wires those). The existing `/tauri-sign` skill remains the operational runbook.
