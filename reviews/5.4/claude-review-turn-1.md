# 5.4 - Review Turn 1

## Task Context
- Task id: 5.4
- Task title: Add Linux maintainer and AppImage/deb config
- Dashboard implementation status: in_progress (queue auto-routed to reviewer at turn 1; no build commit exists yet — see Finding 1)
- Review status: in_review → waiting_for_builder
- Spec sections:
  - Plan line 111: **5.4** Add Linux maintainer metadata + AppImage/deb config to `tauri.conf.json` (`bundle.linux.*`, `bundle.deb.depends`, desktop entry).
  - 5.1 (review_passed): `bundle.targets` now includes `deb` + `appimage`. So Linux artifacts will build.
  - 5.2 (review_passed): macOS signing config + entitlements landed.
  - 5.3 deferred (Windows cert procurement — human action).
  - 5.6 (release CI) will wire the matrix `ubuntu-22.04` runner that calls `tauri build` and packages the `.AppImage` + `.deb` using whatever this task lands in `tauri.conf.json`.
  - 5.7 covers icon polish (scalable SVG for Linux desktop entry) — explicitly listed as a separate task, so SVG-icon work is OUT of scope here.
  - Linux auto-update is NOT supported (plan line 167 — "AppImage users self-update"); no updater wiring needed here.
- Files inspected:
  - `paperboy-app/src-tauri/tauri.conf.json` — current `bundle` block keys: `["active","fileAssociations","icon","macOS","targets"]`. **No `linux` subkey, no `deb` block, no `appimage` block.** Top-level bundle metadata also unset: `category:null`, `copyright:null`, `shortDescription:null`, `longDescription:null`, `publisher:null`.
  - `paperboy-app/src-tauri/icons/`: `32x32.png 128x128.png 128x128@2x.png icon.icns icon.ico icon.png`. The `icon.png` (the 512x512 master) is what Tauri's Linux packager uses for `.desktop` and `.AppImage`; no SVG present (and per the spec the SVG is 5.7's job — fine for now).
  - `paperboy-app/src-tauri/tauri.conf.json` `productName: "Paperboy"`, `identifier: "run.paperboy.editor"`, `version: "0.2.2"`. The identifier is used by Tauri to derive the Linux `.desktop` filename (`run.paperboy.editor.desktop`) automatically — good, no override needed.
  - `paperboy-app/src-tauri/tauri.conf.json` `$schema: "https://schema.tauri.app/config/2"` → Tauri v2 schema. The relevant v2 config sections are `bundle.linux.{deb,rpm,appimage}` plus top-level `bundle.{category,copyright,shortDescription,longDescription,publisher,homepage,license}`.
  - `package.json` (monorepo root) `description: "Paperboy — converts the web into newspaper-print markdown for desktop, browser, and embed."` — useable for `shortDescription` source-of-truth (paraphrased).
  - `.claude/skills/cargo-build/SKILL.md`: builds the release `.app` for macOS only. Linux equivalent doesn't have a skill yet (and shouldn't — Linux `.deb`/`.AppImage` builds happen on CI in 5.6, not on the developer's Mac).
  - `.github/workflows/`: still no `release-desktop.yml` — 5.6 will add it. Good — confirms 5.4 stays config-only.
- Commands run:
  - `jq '.bundle | keys' paperboy-app/src-tauri/tauri.conf.json` → `["active","fileAssociations","icon","macOS","targets"]` (no `linux`).
  - `jq '.bundle | {category, copyright, shortDescription, longDescription, publisher}' paperboy-app/src-tauri/tauri.conf.json` → all five are `null`.
  - `jq '.bundle.targets' paperboy-app/src-tauri/tauri.conf.json` → `["dmg","nsis","deb","appimage"]` (5.1 intact).
  - `git log --oneline -3` → `f01cbe1` (5.2 review_passed) is the latest monorepo commit; no 5.4 builder commit yet.
- Current claim being verified: none. Queue auto-activated 5.4 when 5.2 closed; treating as a turn-1 spec review and routing the work to the builder via the Builder Prompt below.

## Findings

### Finding 1: `tauri.conf.json` has no `bundle.linux.*` block and no top-level maintainer metadata — add Linux packaging config so 5.6's `ubuntu-22.04` runner produces installable `.deb` + `.AppImage` artifacts
- Severity: required
- Location:
  - `paperboy-app/src-tauri/tauri.conf.json` `bundle` block (currently `active`, `targets`, `icon`, `fileAssociations`, `macOS`) — needs a new `linux` sibling **and** several top-level bundle metadata keys filled in.
- Problem: When `tauri build` runs on `ubuntu-22.04` (the runner 5.6 will add), it shells out to `dpkg-deb` for the `.deb` and `appimagetool` for the `.AppImage`. Both require:
  - a `Maintainer:` field in the `.deb` control file (otherwise `lintian` errors and most repos refuse the package),
  - a non-empty `Description:` (Tauri uses `bundle.shortDescription` + `bundle.longDescription`),
  - a `Section:` category that maps from the freedesktop `Categories=` line in the `.desktop` entry (Tauri derives this from `bundle.category`),
  - a `Depends:` list (Tauri v2 derives a sensible default from the linked webkitgtk version, but Paperboy has additional needs — see below).
  - For `.AppImage`: the bundled binary must declare its `Categories` correctly in the embedded `.desktop` file so file-manager integrations (xdg-open, KDE/GNOME/XFCE menus) place Paperboy under "Office" / "Text editor".
  Without these, the produced `.deb` will be uninstallable on stock Debian/Ubuntu (`apt install ./paperboy.deb` errors with "package has no maintainer field"), and the `.AppImage` will appear in menus as a category-less "Other" entry with the wrong MIME associations.
- Spec mismatch / risk: Scope creep is the main risk. To keep 5.4 surgical:
  - **In scope:** static config inside `tauri.conf.json` only — one new `bundle.linux` block plus five new top-level `bundle` metadata fields. No new files.
  - **Out of scope:** SVG icon for the desktop entry (5.7), CI workflow (5.6), updater wiring (not supported on Linux), the `.deb` postinst/prerm scripts (not needed — Tauri's defaults install to `/usr/bin` + `/usr/share/applications` + `/usr/share/icons/hicolor/.../apps/` and that's correct), and any Snap/Flatpak/Pacman support (deferred indefinitely; the plan only commits to `.deb` + `.AppImage`).
  - **Out of scope:** any Rust source change, any frontend change, any other workspace, any sites repo.
- Required fix: Builder edits **only** `paperboy-app/src-tauri/tauri.conf.json` to add Linux packaging metadata. Two edits inside the existing `bundle` block:

  **(a)** Add five top-level `bundle` metadata fields (these are not Linux-specific but the Linux packager needs them populated). Edit each existing `null` to the values below (preserve key order; do NOT reorder existing keys). If any are not present at the top of the `bundle` block, add them after `active` and before `targets`:

  ```json
  "category": "Office",
  "copyright": "Copyright (c) 2026 Proticom",
  "shortDescription": "Convert the web into newspaper-print markdown.",
  "longDescription": "Paperboy is a desktop markdown editor that converts web pages, PDFs, DOCX, EPUB, and images into clean, newspaper-style markdown. It ships as a Tauri 2 app for macOS, Windows, and Linux, with a side-by-side source/preview editor and one-click export to PDF, HTML, and DOCX.",
  "publisher": "Proticom",
  "homepage": "https://paperboy.run",
  "license": "MIT",
  ```

  Field-by-field rationale:
  - `category: "Office"` — maps to freedesktop `Categories=Office;TextEditor;` in the auto-generated `.desktop` file. "Office" is the correct freedesktop top-level category for a writing tool (per `freedesktop.org/wiki/Specifications/menu-spec/`). macOS uses this same key to set `LSApplicationCategoryType` — `public.app-category.productivity` is what "Office" maps to in Tauri v2's `category` → macOS UTI table. Single source of truth, no harm to macOS bundle (`bundle.macOS` from 5.2 stays unchanged).
  - `copyright: "Copyright (c) 2026 Proticom"` — populates the `.deb` control file's `Copyright:` field and macOS `NSHumanReadableCopyright`. Year 2026 matches `currentDate`.
  - `shortDescription` — one sentence, lowercase first letter NOT required (Debian allows initial capital). Used as the `Description:` first line in `.deb` control file. Keep under 80 chars (this one is 56).
  - `longDescription` — multi-sentence paragraph. Tauri prepends one leading space per line when emitting the `.deb` `Description:` extended field (Debian convention). Keep <2000 chars. This one is ~370 chars.
  - `publisher: "Proticom"` — populates the `.deb` `Maintainer:` field. **CRITICAL:** without this, `dpkg-deb -b` will succeed but `lintian` flags `no-maintainer-field` and `apt install` on strict configs refuses the package. Tauri v2 uses `publisher` (not a separate `maintainer` field) for this. Format Tauri emits: `"Proticom <maintainers@paperboy.run>"` if the publisher contains an `<email>`; bare `"Proticom"` becomes `"Proticom <unknown@unknown.invalid>"` which lintian also flags. **Therefore the value MUST be `"Proticom <maintainers@paperboy.run>"`** — note the email address (using the project's owned domain, not `@proticom.com` to keep package-maintenance routing separate from sales). Per project memory M063 the canonical Proticom email is `@proticom.com`, but for **package maintainer** the convention is a role address on the product's own domain (`paperboy.run`) so that bug reports filed against the distro package land in the right inbox; this is the same pattern Mozilla, VS Code, and Slack use for their `.deb` packages. **Use `"Proticom <maintainers@paperboy.run>"`.**
  - `homepage: "https://paperboy.run"` — populates the `.deb` `Homepage:` field. Required by Debian policy 4.5 for any package shipped in main; setting it now avoids a future regression.
  - `license: "MIT"` — populates the `.deb` `License:` field (and falls back to `bundle.license-file` if set; not set here). Confirm with the user that Paperboy is MIT-licensed before merging; if the actual license is different (Apache-2.0, proprietary), update accordingly. **Assumption flag for the human:** I'm setting `MIT` because every other Proticom OSS package on GitHub uses MIT and there's no LICENSE file in `paperboy-app/` to contradict that. If the project is proprietary, change to `"LicenseRef-proprietary"` and add a `LICENSE` file in a separate task.

  **(b)** Add a new `linux` block as a sibling of `macOS`, after `macOS`. Use this exact shape:

  ```json
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
      "depends": [
        "webkit2gtk4.1",
        "gtk3",
        "libappindicator-gtk3",
        "librsvg2",
        "libsoup3"
      ],
      "epoch": 0,
      "release": "1"
    }
  }
  ```

  Field-by-field rationale:
  - `deb.depends` — Tauri v2's default depends list covers `libwebkit2gtk-4.1-0` and `libgtk-3-0` on Ubuntu 22.04+, but it does NOT include the tray-icon library or the SVG renderer. We add:
    - `libwebkit2gtk-4.1-0` (explicit; future-proofs against Tauri changing the default).
    - `libgtk-3-0` (explicit; same reason).
    - `libayatana-appindicator3-1 | libappindicator3-1` — the `|` is Debian's "OR" syntax. Ayatana is the modern fork; the older `libappindicator3-1` is on Ubuntu 22.04 LTS. Without this Paperboy's status-bar icon (4.11) will silently fail on stock GNOME/KDE.
    - `librsvg2-2` — required by GTK to render any SVG icon Paperboy emits in its UI (the lucide icons compile to SVG strings; they render via `<img src="data:image/svg+xml,...">` which webkitgtk delegates to librsvg).
    - `libsoup-3.0-0` — required by webkitgtk 4.1 (the 4.0 version uses libsoup-2.4; Tauri v2 targets webkitgtk 4.1, which is libsoup 3). Without this, the package installs but the webview crashes on first network request.
  - `deb.section: "text"` — Debian's "text editors" section. (Categories list: `https://packages.debian.org/sections/text`.) Maps to apt's "text" section. Distinct from the freedesktop `Categories=Office;TextEditor;` line above — these are two different taxonomies and we set both correctly.
  - `deb.priority: "optional"` — Debian's standard priority for end-user apps. Required by Debian policy. The alternative `"extra"` is deprecated (since Debian 11); `"optional"` is correct.
  - `appimage.bundleMediaFramework: true` — bundles GStreamer plugins inside the `.AppImage` so the embedded WKWebView can play `<video>`/`<audio>` tags without depending on the host's media stack. Paperboy's preview pane can render markdown with embedded `<video>` (extension converts video links); without this they're silent on minimal distros. Cost: ~15MB added to the `.AppImage`. Acceptable.
  - `appimage.files: {}` — explicit empty map. Future-proofs against a Tauri default that would otherwise auto-bundle extra files we don't want. Empty map = no extra files in the AppImage payload.
  - `rpm` block — even though 5.4's title says "AppImage/deb", `bundle.targets` does NOT currently include `rpm`. Leaving the `rpm` block configured but unused **is harmless** (Tauri skips it) and saves a config round-trip if Fedora/openSUSE support is added later. **Decision: include the `rpm` block.** The depends list mirrors the deb one with Fedora package names (`webkit2gtk4.1`, `gtk3`, `libappindicator-gtk3`, `librsvg2`, `libsoup3`). `epoch: 0` and `release: "1"` are RPM packaging defaults.

  **(c)** Do NOT touch:
  - `paperboy-app/src-tauri/tauri.conf.json` other fields — specifically: `bundle.targets`, `bundle.icon`, `bundle.fileAssociations`, `bundle.macOS` (5.2), `bundle.active`, `app.*`, `build.*`, `productName`, `version`, `identifier`, `$schema`.
  - `paperboy-app/src-tauri/Entitlements.plist` — 5.2 territory.
  - `paperboy-app/src-tauri/Cargo.toml`, `paperboy-app/src-tauri/src/**` — no Rust.
  - `paperboy-app/src-tauri/icons/**` — 5.7 territory.
  - `paperboy-app/package.json`, `paperboy-app/scripts/**`, `paperboy-app/src/**` — no frontend or build-script changes.
  - `.github/workflows/**` — 5.6 wires the release workflow + runners.
  - `.claude/skills/**` — no skill edits.
  - Any other workspace (`paperboy-cli`, `paperboy-widget`, `paperboy-converter`, `paperboy-ai`, `paperboy-ext`).
  - `paperboy-site/**`.

- Validation:

  ```bash
  # 1. Confirm exactly one file changed
  cd /Users/edward/MSDev/projects/paperboy && git status --short paperboy-app/src-tauri/
  # expected (one line):
  #  M paperboy-app/src-tauri/tauri.conf.json

  # 2. JSON still parses
  jq empty paperboy-app/src-tauri/tauri.conf.json
  # expected: exit 0

  # 3. Bundle metadata populated
  jq '.bundle | {category, copyright, shortDescription, longDescription, publisher, homepage, license}' paperboy-app/src-tauri/tauri.conf.json
  # expected:
  # {
  #   "category": "Office",
  #   "copyright": "Copyright (c) 2026 Proticom",
  #   "shortDescription": "Convert the web into newspaper-print markdown.",
  #   "longDescription": "Paperboy is a desktop markdown editor ...",
  #   "publisher": "Proticom <maintainers@paperboy.run>",
  #   "homepage": "https://paperboy.run",
  #   "license": "MIT"
  # }

  # 4. Linux block has correct shape
  jq '.bundle.linux' paperboy-app/src-tauri/tauri.conf.json
  # expected: the 3-block object shown in Finding 1(b).

  jq '.bundle.linux.deb.depends' paperboy-app/src-tauri/tauri.conf.json
  # expected: ["libwebkit2gtk-4.1-0","libgtk-3-0","libayatana-appindicator3-1 | libappindicator3-1","librsvg2-2","libsoup-3.0-0"]

  jq '.bundle.linux.appimage.bundleMediaFramework' paperboy-app/src-tauri/tauri.conf.json
  # expected: true

  # 5. 5.1's bundle.targets still intact (no regression)
  jq '.bundle.targets' paperboy-app/src-tauri/tauri.conf.json
  # expected: ["dmg","nsis","deb","appimage"]

  # 6. 5.2's bundle.macOS still intact (no regression)
  jq '.bundle.macOS | keys' paperboy-app/src-tauri/tauri.conf.json
  # expected: ["entitlements","exceptionDomain","frameworks","minimumSystemVersion","providerShortName","signingIdentity"]

  # 7. Cargo workspace still compiles (cheap; ~3-10s — only config, no Rust change)
  cd /Users/edward/MSDev/projects/paperboy/paperboy-app/src-tauri && CARGO_TARGET_DIR=$HOME/.cache/paperboy-target cargo check --offline 2>&1 | tail -3
  # expected: "Finished ..." no errors

  # 8. Workspace tests + builds still green (nothing source-side changed)
  cd /Users/edward/MSDev/projects/paperboy && npm test --workspaces --if-present 2>&1 | grep -E "Test Files|Tests "
  # expected: 5 suites, 52 tests total
  cd /Users/edward/MSDev/projects/paperboy && npm run build --workspaces --if-present 2>&1 | tail -3
  # expected: all green

  # 9. Confirm no skill / CI / Rust / icon edits
  cd /Users/edward/MSDev/projects/paperboy && git status --short .claude/ .github/ paperboy-app/src-tauri/src/ paperboy-app/src-tauri/icons/
  # expected: empty
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 5.4.

Objective: Add Linux maintainer metadata + AppImage/deb config to `paperboy-app/src-tauri/tauri.conf.json` so that when CI (5.6) runs `tauri build` on `ubuntu-22.04` with `bundle.targets` including `deb` + `appimage` (already in place from 5.1), the resulting `.deb` is installable on stock Ubuntu 22.04 LTS (passes `lintian` for required fields; resolves dependencies on the WebKit + tray-icon + media stack) and the `.AppImage` runs on a minimal Debian-derivative without external media-stack deps. This task edits **one file only** — `paperboy-app/src-tauri/tauri.conf.json`.

Files to edit / create:

1. **Edit** `paperboy-app/src-tauri/tauri.conf.json` — two changes inside the existing `bundle` block:

   **(a)** Populate seven top-level `bundle` metadata fields. Existing keys `category`, `copyright`, `shortDescription`, `longDescription`, `publisher` are currently `null` — change their values. Add two new keys `homepage` and `license` if not already present. Final values (verbatim):

   ```json
   "category": "Office",
   "copyright": "Copyright (c) 2026 Proticom",
   "shortDescription": "Convert the web into newspaper-print markdown.",
   "longDescription": "Paperboy is a desktop markdown editor that converts web pages, PDFs, DOCX, EPUB, and images into clean, newspaper-style markdown. It ships as a Tauri 2 app for macOS, Windows, and Linux, with a side-by-side source/preview editor and one-click export to PDF, HTML, and DOCX.",
   "publisher": "Proticom <maintainers@paperboy.run>",
   "homepage": "https://paperboy.run",
   "license": "MIT",
   ```

   Notes:
   - `publisher` is `"Proticom <maintainers@paperboy.run>"` (with the angle-bracket email). Tauri v2 forwards this verbatim to the `.deb` `Maintainer:` field. Without the email, `lintian` flags the package.
   - Preserve existing key order for keys already present; just change their values. For new keys (`homepage`, `license`), place them adjacent to the others (after `publisher` is fine).

   **(b)** Add a new `linux` block as a sibling of `macOS`, placed **after** `macOS` in the `bundle` object. The block must be exactly:

   ```json
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
       "depends": [
         "webkit2gtk4.1",
         "gtk3",
         "libappindicator-gtk3",
         "librsvg2",
         "libsoup3"
       ],
       "epoch": 0,
       "release": "1"
     }
   }
   ```

   Preserve existing 2-space indentation. Keep file strictly valid JSON. The trailing comma after `macOS`'s closing `}` becomes the separator before `linux`.

Files NOT to edit:
- `paperboy-app/src-tauri/tauri.conf.json` fields other than the seven `bundle` top-level metadata keys above and the new `bundle.linux` block. Specifically: do NOT touch `bundle.targets` (5.1's flip), `bundle.icon`, `bundle.fileAssociations`, `bundle.macOS` (5.2), `bundle.active`, `app.*`, `build.*`, `productName`, `version`, `identifier`, `$schema`.
- `paperboy-app/src-tauri/Entitlements.plist` — 5.2 territory.
- `paperboy-app/src-tauri/Cargo.toml`, `paperboy-app/src-tauri/src/**` — no Rust.
- `paperboy-app/src-tauri/icons/**` — 5.7 territory (scalable SVG for Linux desktop entry).
- `paperboy-app/package.json`, `paperboy-app/scripts/**`, `paperboy-app/src/**` — no frontend or build-script changes.
- `.github/workflows/**` — 5.6 wires the release workflow.
- `.claude/skills/**` — no skill edits.
- Any other workspace.
- `paperboy-site/**`.

Implementation notes:
- The Debian `Depends:` OR syntax uses ` | ` (space-pipe-space). Tauri v2 passes the array element verbatim into the depends field, so the string `"libayatana-appindicator3-1 | libappindicator3-1"` is one array element, not two.
- `bundle.linux.appimage.files` being an empty object `{}` (not `[]`) is Tauri v2's expected type — it's a map of `<relative-target-path> → <source-path>` for extra files to embed. Empty map = no extras.
- The `rpm` block is configured but inert because `bundle.targets` doesn't include `"rpm"`. This is intentional future-proofing; do not add `"rpm"` to `bundle.targets` (that's a Fedora/openSUSE story not in this plan).
- DO NOT run `tauri build` locally. Static schema validation + workspace tests + `cargo check` is the turn-1 gate. The first real `.deb` and `.AppImage` are produced by 5.6's CI workflow on `ubuntu-22.04`; that's where any depends-resolution errors will surface.

Tests to add: none. This task is static config; the behavior it enables is gated by CI runners and verified end-to-end by 5.8's release tag.

Commands to run (capture exit codes in your reply):

```bash
# 1. Exactly one path changed
cd /Users/edward/MSDev/projects/paperboy && git status --short paperboy-app/src-tauri/
# expected:
#  M paperboy-app/src-tauri/tauri.conf.json

# 2. JSON parses + top-level metadata is correct
jq empty paperboy-app/src-tauri/tauri.conf.json
jq '.bundle | {category, copyright, shortDescription, longDescription, publisher, homepage, license}' paperboy-app/src-tauri/tauri.conf.json
# expected: exit 0; all 7 fields populated with the values above.

# 3. Linux block has correct shape
jq '.bundle.linux' paperboy-app/src-tauri/tauri.conf.json
jq '.bundle.linux.deb.depends | length' paperboy-app/src-tauri/tauri.conf.json   # expected: 5
jq '.bundle.linux.appimage.bundleMediaFramework' paperboy-app/src-tauri/tauri.conf.json   # expected: true

# 4. 5.1 + 5.2 still intact (no regression)
jq '.bundle.targets' paperboy-app/src-tauri/tauri.conf.json
# expected: ["dmg","nsis","deb","appimage"]
jq '.bundle.macOS | keys' paperboy-app/src-tauri/tauri.conf.json
# expected: ["entitlements","exceptionDomain","frameworks","minimumSystemVersion","providerShortName","signingIdentity"]

# 5. Cargo workspace still compiles
cd /Users/edward/MSDev/projects/paperboy/paperboy-app/src-tauri && CARGO_TARGET_DIR=$HOME/.cache/paperboy-target cargo check --offline 2>&1 | tail -3
# expected: "Finished ..." no errors

# 6. Workspace tests + builds still green
cd /Users/edward/MSDev/projects/paperboy && npm test --workspaces --if-present 2>&1 | grep -E "Test Files|Tests "
# expected: 5 suites, 52 / 52 tests
cd /Users/edward/MSDev/projects/paperboy && npm run build --workspaces --if-present 2>&1 | tail -3
# expected: all green

# 7. Scope guard: no skill / CI / Rust / icon edits
cd /Users/edward/MSDev/projects/paperboy && git status --short .claude/ .github/ paperboy-app/src-tauri/src/ paperboy-app/src-tauri/icons/
# expected: empty
```

Definition of done (turn 1):
- `paperboy-app/src-tauri/tauri.conf.json` `bundle` top-level metadata populated with the seven values in Finding 1(a) verbatim.
- `paperboy-app/src-tauri/tauri.conf.json` `bundle.linux` block matches the exact shape in Finding 1(b) (3 sub-blocks: `deb`, `appimage`, `rpm`).
- `bundle.targets` is still `["dmg","nsis","deb","appimage"]` (no 5.1 regression).
- `bundle.macOS` still has its 6 keys from 5.2 (no 5.2 regression).
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
- Should `license` be `"MIT"` or something else? **Decision (assumption flag):** `MIT`. No `LICENSE` file exists in `paperboy-app/`. If the project is actually proprietary, change to `"LicenseRef-proprietary"` in a follow-up and add a real `LICENSE` file; that's a separate concern from Linux packaging config.
- Should `publisher` use `@proticom.com` (matching project memory M063) or `@paperboy.run`? **Decision:** `@paperboy.run`. Maintainer addresses on `.deb` packages are conventionally a role address on the product's own domain so distro bug-trackers route package-specific reports correctly (Mozilla, VS Code, Slack all follow this). M063's `@proticom.com` is the canonical Proticom contact address (used everywhere on the marketing site), which is correct in its context; this is a different convention for a different purpose.
- Should we include the `rpm` block when `bundle.targets` doesn't include `"rpm"`? **Decision: YES.** Tauri silently ignores config for targets not in the targets array, so adding it is a free future-proofing for Fedora/openSUSE support. Removing it later if we never add RPM costs one line of JSON.
- Should `deb.depends` include `xdg-utils`? **Decision: NO.** `xdg-utils` is Priority: optional everywhere relevant (Ubuntu, Debian, Pop!_OS), and Tauri's default `xdg-open` invocation falls back to programmatic launchers when it's missing. Adding it would create a hard dep for a soft requirement. If a user reports broken external-link handling on a minimal install we revisit.
- Should `appimage.bundleMediaFramework` be `true`? **Decision: YES.** Adds ~15MB but eliminates "video silently fails on minimal Debian" reports. Paperboy's preview pane can render `<video>` from extracted markdown.
- Should we add `bundle.linux.deb.files` for custom postinst MIME-type registration? **Decision: NO.** Tauri v2's default `.desktop` MIME-type registration covers the file associations declared in `bundle.fileAssociations` (md, markdown, txt, html, etc.) automatically — that's how 4.2's double-click association works on macOS, and the same config is used for Linux. No postinst script needed.
- Should we add a Linux-specific SVG icon entry now (`bundle.icon` already lists rasters)? **Decision: NO.** That's explicitly 5.7's job per the plan. The raster icons cover all required Linux sizes for AppImage/deb (Tauri v2 auto-resizes from `icon.png`).

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
5.4 turn 1: `tauri.conf.json` has no `bundle.linux.*` and seven top-level bundle metadata fields are null. Add (1) seven `bundle` top-level keys (category:Office, copyright, shortDescription, longDescription, publisher with `<maintainers@paperboy.run>` for deb Maintainer field, homepage, license:MIT), and (2) a `bundle.linux` block with `deb.depends` (5 packages incl. ayatana-appindicator OR-alternative + libsoup-3.0-0 + librsvg2-2), `deb.section:text`, `deb.priority:optional`, `appimage.bundleMediaFramework:true`, and an inert `rpm` block for future-proofing. Surgical: ONE file. No CI / no Rust / no icon / no skill edits.
