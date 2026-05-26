# 5.4 - Review Turn 2

## Task Context
- Task id: 5.4
- Task title: Add Linux maintainer and AppImage/deb config
- Dashboard implementation status: in_progress → completed (this turn closes the loop)
- Review status: waiting_for_reviewer → review_passed
- Spec sections:
  - Plan line 111: 5.4 — Linux maintainer metadata + AppImage/deb config in `tauri.conf.json`.
  - Turn 1 (`reviews/5.4/claude-review-turn-1.md`) prescribed: seven top-level `bundle` metadata keys + a `bundle.linux` block with `deb` / `appimage` / `rpm` sub-objects. One file only, no Rust / CI / icon / skill / site edits.
  - Cursor's turn-1 reply (`reviews/5.4/cursor-reply-turn-1.md`) claims all seven fields populated, the `bundle.linux` block landed with the exact shape, 5.1 + 5.2 untouched, scope guard empty, tests 52/52, builds green, cargo check clean.
- Files inspected (this turn):
  - `paperboy-app/src-tauri/tauri.conf.json` — `bundle` keys are now `["active","category","copyright","fileAssociations","homepage","icon","license","linux","longDescription","macOS","publisher","shortDescription","targets"]` (was `["active","fileAssociations","icon","macOS","targets"]` at turn 1).
  - Same file, `bundle.linux` block has the exact 3-sub-block shape (`deb` / `appimage` / `rpm`) from turn 1's Finding 1(b).
  - Same file, `bundle.targets` still `["dmg","nsis","deb","appimage"]` (5.1 intact).
  - Same file, `bundle.macOS` still has its 6 keys from 5.2 (`entitlements`, `exceptionDomain`, `frameworks`, `minimumSystemVersion`, `providerShortName`, `signingIdentity`) — no 5.2 regression.
  - `git status --short` for scope-guarded paths (`.claude/`, `.github/`, `paperboy-app/src-tauri/src/`, `paperboy-app/src-tauri/icons/`, `Cargo.toml`, `Entitlements.plist`, `paperboy-site/`) → empty. Scope clean.
  - `git diff --stat paperboy-app/src-tauri/tauri.conf.json` → `1 file changed, 35 insertions(+)`. Pure additive change inside `bundle`; no field deleted, no existing field modified except the five `null`s that became real values.
- Commands run (this turn):
  - `jq empty paperboy-app/src-tauri/tauri.conf.json` → exit 0.
  - `jq '.bundle | {category, copyright, shortDescription, longDescription, publisher, homepage, license}'` → all seven match turn 1 verbatim (publisher is `"Proticom <maintainers@paperboy.run>"` — the `lintian`-critical email-bearing form).
  - `jq '.bundle.linux'` → 3-block object matches turn 1's prescribed shape exactly.
  - `jq '.bundle.linux.deb.depends | length'` → 5.
  - `jq '.bundle.linux.deb.depends'` → contains `"libayatana-appindicator3-1 | libappindicator3-1"` as a single OR-alternative string element.
  - `jq '.bundle.linux.appimage.bundleMediaFramework'` → `true`.
  - `jq '.bundle.linux.appimage.files'` → `{}` (empty object, not array — correct Tauri v2 type).
  - `jq '.bundle.linux.rpm.epoch'` → `0`, `.release` → `"1"`.
  - `jq '.bundle.targets'` → `["dmg","nsis","deb","appimage"]` (5.1 intact).
  - `jq '.bundle.macOS | keys'` → 6 keys from 5.2 (intact).
  - `cd paperboy-app/src-tauri && CARGO_TARGET_DIR=$HOME/.cache/paperboy-target cargo check --offline` → `Finished dev profile ... in 0.41s` (no Rust touched, sanity gate).
  - `npm test --workspaces --if-present` → 52/52 (9 + 6 + 19 + 6 + 12 across 5 workspaces with tests).
  - `npm run build --workspaces --if-present` → green (extension `sidepanel.bundle.js 293.4kb`, widget `paperboy-widget.min.js 35.7kb`, etc.).
  - `git status --short` (scope-guard paths) → empty.
  - `git diff --stat paperboy-app/src-tauri/tauri.conf.json` → `+35 / -0` (additive).
- Current claim being verified: 5.4 turn 2, queue token `5.4-1779779148`. Builder committed nothing; per workflow the reviewer commits the builder's working-tree changes on `review_passed`.

## Findings

### Finding 1: Turn 1 prescription landed verbatim — no blockers, no required changes
- Severity: info (review_passed)
- Location: `paperboy-app/src-tauri/tauri.conf.json` `bundle` block.
- Problem: None. Every turn-1 prescription landed exactly as specified; all turn-1 validation commands pass.
- Required fix: None.
- Observed state (verbatim from `jq` against the working tree):

  ```json
  {
    "category": "Office",
    "copyright": "Copyright (c) 2026 Proticom",
    "shortDescription": "Convert the web into newspaper-print markdown.",
    "longDescription": "Paperboy is a desktop markdown editor that converts web pages, PDFs, DOCX, EPUB, and images into clean, newspaper-style markdown. It ships as a Tauri 2 app for macOS, Windows, and Linux, with a side-by-side source/preview editor and one-click export to PDF, HTML, and DOCX.",
    "publisher": "Proticom <maintainers@paperboy.run>",
    "homepage": "https://paperboy.run",
    "license": "MIT",
    "linux": {
      "deb": {
        "depends": [
          "libwebkit2gtk-4.1-0",
          "libgtk-3-0",
          "libayatana-appindicator3-1 | libappindicator3-1",
          "librsvg2-2",
          "libsoup-3.0-0"
        ],
        "section": "text",
        "priority": "optional"
      },
      "appimage": {
        "bundleMediaFramework": true,
        "files": {}
      },
      "rpm": {
        "depends": ["webkit2gtk4.1","gtk3","libappindicator-gtk3","librsvg2","libsoup3"],
        "epoch": 0,
        "release": "1"
      }
    }
  }
  ```

  Summary of what's verified:
  - Seven top-level `bundle` metadata keys (`category`, `copyright`, `shortDescription`, `longDescription`, `publisher`, `homepage`, `license`) populated with the verbatim values from turn 1 Finding 1(a). Critical `publisher` uses the `"Proticom <maintainers@paperboy.run>"` form so the `.deb` `Maintainer:` field will pass `lintian`.
  - `bundle.linux` block landed as a sibling of `bundle.macOS` with the exact 3-sub-block shape from turn 1 Finding 1(b): `deb` (5 depends including the ayatana OR-alternative + libsoup-3.0-0 + librsvg2-2; `section:"text"`; `priority:"optional"`), `appimage` (`bundleMediaFramework:true`, `files:{}`), `rpm` (inert future-proofing — 5 Fedora-style depends, `epoch:0`, `release:"1"`).
  - Zero regressions: `bundle.targets` still `["dmg","nsis","deb","appimage"]` (5.1), `bundle.macOS` still has its 6 keys (5.2), all other bundle fields untouched, JSON parses, cargo compiles, 52/52 tests pass, all workspaces build, scope guard empty.

- Validation:

  ```bash
  cd /Users/edward/MSDev/projects/paperboy

  jq empty paperboy-app/src-tauri/tauri.conf.json
  # exit 0

  jq '.bundle | {category, copyright, shortDescription, longDescription, publisher, homepage, license}' paperboy-app/src-tauri/tauri.conf.json
  # all 7 fields populated with turn-1 verbatim values; publisher = "Proticom <maintainers@paperboy.run>"

  jq '.bundle.linux' paperboy-app/src-tauri/tauri.conf.json
  # 3-sub-block object matching turn 1 Finding 1(b)

  jq '.bundle.linux.deb.depends | length' paperboy-app/src-tauri/tauri.conf.json
  # 5

  jq '.bundle.linux.appimage.bundleMediaFramework' paperboy-app/src-tauri/tauri.conf.json
  # true

  jq '.bundle.targets' paperboy-app/src-tauri/tauri.conf.json
  # ["dmg","nsis","deb","appimage"]   (5.1 intact)

  jq '.bundle.macOS | keys' paperboy-app/src-tauri/tauri.conf.json
  # ["entitlements","exceptionDomain","frameworks","minimumSystemVersion","providerShortName","signingIdentity"]   (5.2 intact)

  cd paperboy-app/src-tauri && CARGO_TARGET_DIR=$HOME/.cache/paperboy-target cargo check --offline
  # Finished dev profile ... in 0.41s

  cd /Users/edward/MSDev/projects/paperboy && npm test --workspaces --if-present 2>&1 | grep -E "Test Files|Tests "
  # 52/52 (9+6+19+6+12 across 5 workspaces)

  cd /Users/edward/MSDev/projects/paperboy && npm run build --workspaces --if-present
  # all workspaces green

  cd /Users/edward/MSDev/projects/paperboy && git status --short .claude/ .github/ paperboy-app/src-tauri/src/ paperboy-app/src-tauri/icons/ paperboy-app/src-tauri/Cargo.toml paperboy-app/src-tauri/Entitlements.plist paperboy-site/
  # empty (scope guard clean)

  cd /Users/edward/MSDev/projects/paperboy && git diff --stat paperboy-app/src-tauri/tauri.conf.json
  # 1 file changed, 35 insertions(+)
  ```

## Builder Prompt

N/A — this is a `review_passed` decision; no further builder work for 5.4.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A, no blockers.
- [x] Every required finding has a validation command — N/A, no required findings.
- [x] Code samples or exact data/CLI examples are included where useful — yes, jq commands inline.
- [x] Open questions are listed below, or "No open questions" — see below.

Open questions:
- License field is set to `"MIT"` as an assumption flag in turn 1. Still no `LICENSE` file in `paperboy-app/`. Not blocking 5.4; flag remains as a future cleanup if the project's actual license differs. Tauri uses the string verbatim in the `.deb` `License:` field, so a follow-up edit is one line of JSON.
- The `rpm` block is configured but `bundle.targets` doesn't include `"rpm"`, so it's inert. Per turn 1 Open Question this is intentional future-proofing for Fedora/openSUSE.

## Decision
review_passed

## Notes (becomes the dashboard `--note`)
5.4 turn 2 review_passed: verified `tauri.conf.json` has all 7 top-level bundle metadata keys (incl. `publisher:"Proticom <maintainers@paperboy.run>"` for lintian) and a `bundle.linux` block with deb (5 depends, section:text, priority:optional), appimage (bundleMediaFramework:true, files:{}), and inert rpm sub-blocks. 5.1 targets + 5.2 macOS intact. Cargo check clean, 52/52 tests, all workspaces build, scope guard empty, +35/-0 lines in one file.
