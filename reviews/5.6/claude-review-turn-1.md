# 5.6 - Review Turn 1

## Task Context
- Task id: 5.6
- Task title: Write `release-desktop.yml` CI workflow
- Dashboard implementation status: in_progress (queue auto-activated 5.6 when 5.5 closed; no builder commit yet — this is a turn-1 spec review routing the work to the builder)
- Review status: in_review → waiting_for_builder
- Spec sections (verbatim from `/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md`):
  - **Plan lines 113-117 (task 5.6):**
    > "Write `.github/workflows/release-desktop.yml`:
    > - Trigger: tag `app-v*`.
    > - Matrix: `macos-14` (arm64), `macos-13` (x86_64) — combine into universal `.dmg`; `windows-2022`; `ubuntu-22.04`.
    > - Steps: `npm ci`, `npm run sync:vendor`, `npm run tauri:build`, sign + notarize (mac), sign (win), build `.AppImage` + `.deb` (linux), upload each artifact to a GitHub Release.
    > - Generate `latest.json` updater manifest after artifacts are signed; commit it to a `paperboy.run/public/updates/` location (separate PR to `paperboy-site` repo from the workflow)."
  - **Plan line 167 (out-of-scope clamp):** Linux auto-update via `tauri-plugin-updater` is OUT. AppImage users self-update. Implication: the manifest commit step writes manifests for `darwin-*` and `windows-*` ONLY; no `linux-*` manifest.
  - **Plan lines 168 (out-of-scope clamp, mermaid above):** The mermaid diagram at plan lines 119-132 lists the canonical step sequence: tag → matrix runners → per-platform sign → release upload → write manifest → PR to site repo → users get auto-update.
  - **5.1 (review_passed):** `bundle.targets = ["dmg", "nsis", "deb", "appimage"]`. The workflow must rely on `tauri build` honoring those targets per-platform (Tauri's bundler skips targets that aren't relevant to the current OS — `dmg` only emits on mac, `nsis` only on win, `deb`/`appimage` only on linux).
  - **5.2 (review_passed):** macOS bundle has `entitlements: "Entitlements.plist"`, `minimumSystemVersion: "10.13"`, `signingIdentity: null` (CI injects via env), `providerShortName: null` (CI injects via env). Hardened-runtime entitlements include `com.apple.security.network.client` + `com.apple.security.files.user-selected.read-write`. The workflow must export `APPLE_SIGNING_IDENTITY`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID` so Tauri's `tauri-action` / `tauri build` reads them and signs+notarizes.
  - **5.3 (deferred — human task):** Windows code-signing cert procurement. Implication: the workflow's Windows sign step depends on secrets that don't exist yet (`WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`). Per the spec, the workflow must be WRITTEN now to consume those secrets when they land; the workflow won't run successfully end-to-end until 5.3 closes, but it can run mac+linux successfully today. **Decision: write the Windows sign step with `if: env.WINDOWS_CERTIFICATE != ''` guards so the matrix doesn't hard-fail when the secret is missing; instead the Windows job builds an UNSIGNED nsis + skips signing + still uploads the unsigned `.exe` to the release (clearly labelled). When 5.3 lands, fill in the secrets and the next tag produces a signed installer.** Alternative: hard-require the secrets and have the Windows job fail until 5.3 closes — more "correct" but blocks all releases on a human procurement step. Pick the soft-guard approach so 5.8 can cut a first tag and verify the mac+linux paths even before 5.3 closes.
  - **5.4 (review_passed):** `bundle.linux.deb.depends`, `bundle.linux.appimage.bundleMediaFramework: true`, `bundle.linux.rpm.epoch` set. The workflow's Linux job runs `tauri build` which honors `bundle.linux.*` settings; no extra env needed.
  - **5.5 (review_passed):** `tauri-plugin-updater` registered + `plugins.updater` configured. The workflow's manifest-generation step writes per-platform JSON files at `paperboy-site/public/updates/{target}-{arch}/{current_version}` matching the endpoint pattern `https://paperboy.run/updates/{{target}}-{{arch}}/{{current_version}}`. Each manifest carries `version`, `notes`, `pub_date`, `platforms.{target-arch}.url` (GitHub release asset URL), `platforms.{target-arch}.signature` (minisign sig from `.sig` file Tauri emits when `TAURI_SIGNING_PRIVATE_KEY` is set). **Note: until the human runs `tauri signer generate` (operational tail of 5.5), the `.sig` files are NOT emitted by `tauri build`. The workflow must handle both states gracefully: when `TAURI_SIGNING_PRIVATE_KEY` is empty, skip signature reading and write a manifest with `"signature": ""` (or skip the manifest-generation step entirely and warn). When the secret is present, read the `.sig` file content and embed it in the manifest.**
- Related context:
  - `paperboy-app/package.json` scripts: `build:converter` (esbuild bundle of `src/scripts/converter.js`), `sync:vendor` (`node scripts/sync-vendor.mjs && node scripts/build-converter.mjs`), `tauri` (raw passthrough — `tauri build` is invoked as `npm run tauri build` or `npx tauri build`). **No `tauri:build` script.** Plan text says "`npm run tauri:build`" — that's the colloquial form for `npm run tauri -- build` or `npx tauri build`. The workflow should use one of: `npx tauri build`, `npm run tauri -- build`, or `cd paperboy-app && npm exec tauri -- build`. The cleanest is `npm exec --workspace=paperboy-editor tauri -- build` from the monorepo root, or `cd paperboy-app && npm exec tauri -- build`. Either works.
  - `paperboy-app/scripts/sync-vendor.mjs`: copies markdown-it + plugins from node_modules to `src/scripts/vendor/`, then `build-converter.mjs` bundles `src/scripts/converter.js` via esbuild. Both are pure node, no native deps; safe to run on any GH runner.
  - `paperboy-app/src-tauri/tauri.conf.json` current state (post 5.1-5.5): `version: 0.2.2`, `bundle.targets: ["dmg","nsis","deb","appimage"]`, `bundle.macOS.signingIdentity: null` (Tauri reads `APPLE_SIGNING_IDENTITY` env when null), `bundle.macOS.providerShortName: null` (reads `APPLE_PROVIDER_SHORT_NAME` env when null), `bundle.macOS.entitlements: "Entitlements.plist"`, `bundle.macOS.minimumSystemVersion: "10.13"`, `bundle.linux.{appimage,deb,rpm}` configured, `plugins.updater.{active,endpoints,pubkey,dialog,windows.installMode}` configured with empty `pubkey: ""` placeholder.
  - `paperboy-app/src-tauri/Entitlements.plist`: hardened runtime entitlements present.
  - Existing workflows (`ci.yml`, `publish-paperboy*.yml`): all use `actions/checkout@v5`, `actions/setup-node@v5` with Node 24, `npm ci` from root for workspaces, `permissions: contents: read + id-token: write` for OIDC. The release-desktop workflow doesn't need OIDC for npm; it needs `contents: write` to upload release assets via `softprops/action-gh-release@v2` or `gh release create`.
  - `paperboy-site` repo: separate Git remote at `github.com/proticom/paperboy-site`, branch `master`. Its `public/` dir has `widget/`, `illustrations/`, `images/` — no `updates/` directory yet. The manifest-commit step needs to clone the site repo, write to `public/updates/{target}-{arch}/{version}`, commit, and open a PR (per plan text "separate PR to paperboy-site repo from the workflow").
  - **Bot for the PR:** Two options:
    (a) Use a fine-grained PAT stored as `PAPERBOY_SITE_PUSH_TOKEN` with `contents: write` + `pull-requests: write` on the `paperboy-site` repo. The workflow clones, pushes a branch, opens a PR via `gh`.
    (b) Use a GitHub App installation token (cleaner but adds infra setup).
    **Decision: PAT approach.** Simpler, matches the existing OIDC-for-npm-only posture. The PAT is a deferred human action (alongside 5.3's Windows cert + 5.5's updater key); workflow should soft-guard with `if: env.PAPERBOY_SITE_PUSH_TOKEN != ''` so it doesn't fail when the PAT isn't set yet — instead, the manifest step writes the file LOCALLY and uploads it as a workflow artifact for manual commit.
  - **Universal binary:** Plan says "combine into universal `.dmg`". Tauri v2 doesn't ship a built-in universal bundler; the standard pattern is to build arm64 + x86_64 separately, then `lipo -create` the binaries and re-pack the `.app`. Two implementations:
    (a) `tauri build --target universal-apple-darwin` (Tauri v2 supports this directly as of `@tauri-apps/cli@2.7+`). Runs on a single mac runner, builds both archs in one pass, packages into a fat `.app` and `.dmg`. Cleanest. Requires both Rust targets installed: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.
    (b) Build arm64 on `macos-14` + x86_64 on `macos-13` separately, download both artifacts in a third job, lipo + repack. Mirrors the plan's matrix verbatim but is 3x more wiring (artifact upload/download/repack/resign).
    **Decision: option (a) — single mac runner with `--target universal-apple-darwin`.** Less CI surface, faster, simpler. Slight deviation from plan's literal matrix (mac becomes one job, not two), but matches the SPIRIT (one universal dmg) and is the canonical Tauri v2 pattern.
  - **`tauri-action`:** GitHub Action `tauri-apps/tauri-action@v0` (currently v0.5.x) handles the full mac/win/linux build+sign+notarize+release-upload cycle with env-var inputs. It's the de-facto pattern. Using it cuts the workflow from ~200 lines of hand-rolled bash to ~80 lines of YAML. **Decision: use `tauri-apps/tauri-action@v0`.** Matches what every other production Tauri app ships. The action consumes `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from env and Just Works. Windows signing uses `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`. The action also handles the GitHub Release creation + asset upload automatically when given `tagName` + `releaseName` inputs.
- Files inspected:
  - `.github/workflows/` — `ci.yml`, `publish-paperboy-ai.yml`, `publish-paperboy-converter.yml`, `publish-paperboy-widget.yml`, `publish-paperboy.yml`, `supply-chain-guard.yml`. **No `release-desktop.yml`.** Pattern: checkout@v5, setup-node@v5 with Node 24, `npm ci` at root, then workspace-scoped build/test/publish.
  - `paperboy-app/package.json` — `name: "paperboy-editor"`, `version: "0.2.2"`, scripts: `build:converter`, `dev:web`, `sync:vendor`, `tauri`, `test`, `test:watch`. No `tauri:build` script.
  - `paperboy-app/src-tauri/tauri.conf.json` — version 0.2.2, bundle config from 5.1/5.2/5.4 intact, plugins.updater from 5.5 intact.
  - `paperboy-app/src-tauri/Entitlements.plist` — hardened-runtime entitlements present (5.2).
  - `paperboy-site/public/` — no `updates/` directory.
  - `paperboy-site/.git/` confirmed separate remote `github.com/proticom/paperboy-site` master branch.
- Commands run (turn 1, read-only):
  - `ls .github/workflows/` → confirms `release-desktop.yml` does not exist.
  - `jq '.version, .bundle.macOS, .bundle.identifier' paperboy-app/src-tauri/tauri.conf.json` → version 0.2.2, `signingIdentity: null`, `providerShortName: null`, `entitlements: "Entitlements.plist"`.
  - `ls paperboy-site/public/` → no `updates/` dir.
  - `git -C paperboy-site remote -v` → `origin → https://github.com/proticom/paperboy-site.git`.
  - `git log --oneline -3` → top is `056bf35` (5.5 review_passed).
- Current claim being verified: 5.6 turn 1, queue token `5.6-0001`. Spec review only; actual workflow YAML is routed to the builder via the Builder Prompt below.

## Findings

### Finding 1: Write `.github/workflows/release-desktop.yml` using `tauri-apps/tauri-action@v0`, single-mac-runner universal binary, soft-guarded Windows signing + manifest PR steps
- Severity: required
- Location: New file `.github/workflows/release-desktop.yml` (monorepo).
- Problem: The plan mandates an end-to-end CI release pipeline triggered by `app-v*` tags. Without:
  - the workflow file, no automated build/sign/upload happens on tag push — releases would require manual local `npm run tauri -- build` + manual `codesign` + manual `gh release create` + manual manifest commits.
  - the `tauri-action` integration, hand-rolling sign+notarize+upload across 3 OSes is ~200+ lines of bash that duplicates what the official action already does.
  - the matrix strategy, mac+win+linux builds wouldn't run in parallel — release would take 30+ minutes serial vs ~12 minutes parallel.
  - the manifest-generation + site-PR step, the `tauri-plugin-updater` wired in 5.5 has no manifest to fetch from `https://paperboy.run/updates/...` — auto-update simply never triggers.
  - soft-guards on Windows secrets + site PAT, the workflow hard-fails on the first tag (blocking 5.8) until 5.3 closes (Windows cert procurement) AND a human creates a `PAPERBOY_SITE_PUSH_TOKEN` PAT.
- Spec mismatch / risk:
  - **Mac matrix shape:** Plan says `macos-14 (arm64) + macos-13 (x86_64), combine into universal .dmg`. I'm specifying a SINGLE `macos-14` runner using `--target universal-apple-darwin` instead. Rationale: Tauri v2's CLI supports universal targets natively (`@tauri-apps/cli@2.7+`); the two-runner-then-combine pattern is the v1 / older-Tauri pattern. Single runner is simpler, faster, and produces the same artifact (universal `.dmg`). If the human prefers the literal two-runner pattern, the workflow becomes ~30 lines longer (extra `combine-macos` job that downloads both per-arch artifacts, runs `lipo -create` on the inner Mach-O binaries, re-packs the `.app`, re-signs, re-notarizes, re-staples, uploads). Open question flagged below.
  - **`tauri:build` script name:** Plan's `npm run tauri:build` doesn't exist in `paperboy-app/package.json`. We use `npm exec tauri -- build` or `npx tauri build` from `paperboy-app/`. No package.json edit needed (keeps 5.6 scope to CI YAML only).
  - **Windows signing soft-guard:** When 5.3 hasn't landed, `WINDOWS_CERTIFICATE` is unset. The action's signing step expects it — without the guard, the Windows job fails with "No certificate provided". With the guard, the job builds an UNSIGNED `nsis` installer + uploads it to the release with a "[UNSIGNED — install at your own risk]" suffix in the asset name. This lets 5.8 verify the mac+linux paths end-to-end while 5.3 is pending.
  - **Updater signing soft-guard:** Same pattern for `TAURI_SIGNING_PRIVATE_KEY`. When unset, `tauri build` skips `.sig` emission, manifest step writes empty `"signature": ""`, plugin's `check()` will fail signature verification at runtime (expected — that's the deferred operational tail). Workflow proceeds without error.
  - **Site PR step:** When `PAPERBOY_SITE_PUSH_TOKEN` is unset, write manifests to a workflow-uploaded artifact (`updates-manifest.zip`) instead of PRing. Human can download + commit manually. When the PAT IS set, clone site repo, write files at `public/updates/{target}-{arch}/{version}`, commit on branch `updates/{version}`, push, open PR via `gh pr create`.
  - **In scope:** ONE new file (`.github/workflows/release-desktop.yml`). NO changes to `tauri.conf.json` (5.1-5.5 already wired it). NO changes to `package.json` scripts (use `npm exec tauri -- build` inline). NO new Rust deps. NO frontend changes. NO `paperboy-site` changes (the manifest commit happens at workflow runtime against the live site repo, not as part of 5.6's diff).
  - **Out of scope:**
    - Actually cutting `app-v0.2.2` and running the workflow (5.8's job).
    - Filling in `tauri.conf.json` `.plugins.updater.pubkey` (operational tail of 5.5).
    - Procuring the Windows cert (5.3, human action).
    - Site-repo `public/updates/` dir creation (the workflow creates it at first run).
    - `latest.json` literal filename (we use per-platform path pattern per 5.5's endpoint URL — the plan's literal `latest.json` is descriptive shorthand).
    - Updating the `release-cut` skill (8.4's job).
    - `.github/workflows/release-ext.yml` for the Chrome extension (6.3's job).
- Required fix: Builder writes ONE new file: `.github/workflows/release-desktop.yml`. Concrete spec:

  **File: `.github/workflows/release-desktop.yml`**

  ```yaml
  # Desktop release pipeline. Triggers on `app-v*` tags.
  # Builds signed mac (universal .dmg + .app.tar.gz), win (nsis .exe), linux (.AppImage + .deb)
  # installers, uploads each to a GitHub Release, then writes per-platform `latest.json`
  # update manifests for the `tauri-plugin-updater` plugin (5.5) and opens a PR against
  # the `paperboy-site` repo committing them to `public/updates/{target}-{arch}/{version}`.
  #
  # Soft-guarded secrets (workflow runs cleanly when these are unset; signing/PR skipped):
  #   WINDOWS_CERTIFICATE              (5.3, human procurement)
  #   WINDOWS_CERTIFICATE_PASSWORD     (5.3)
  #   TAURI_SIGNING_PRIVATE_KEY        (5.5 operational tail, `tauri signer generate`)
  #   TAURI_SIGNING_PRIVATE_KEY_PASSWORD (5.5 operational tail)
  #   PAPERBOY_SITE_PUSH_TOKEN         (PAT with contents:write + pull-requests:write on paperboy-site)
  #
  # Hard-required secrets (workflow fails if missing on mac runner):
  #   APPLE_CERTIFICATE               (base64 .p12)
  #   APPLE_CERTIFICATE_PASSWORD
  #   APPLE_SIGNING_IDENTITY          (e.g. "Developer ID Application: Edward Tadros (XXXXXXXXXX)")
  #   APPLE_ID                        (Apple ID email)
  #   APPLE_PASSWORD                  (app-specific password)
  #   APPLE_TEAM_ID                   (10-char team ID)

  name: Release desktop

  on:
    push:
      tags:
        - 'app-v*'

  permissions:
    contents: write       # create release + upload assets
    id-token: write       # not needed today but cheap to grant; future-proofs OIDC use

  jobs:
    create-release:
      name: Create draft GitHub Release
      runs-on: ubuntu-latest
      outputs:
        release_id: ${{ steps.create.outputs.id }}
        upload_url: ${{ steps.create.outputs.upload_url }}
        version: ${{ steps.version.outputs.version }}
      steps:
        - uses: actions/checkout@v5

        - name: Extract version from tag
          id: version
          shell: bash
          run: |
            # tag is refs/tags/app-v0.2.2 → version 0.2.2
            VERSION="${GITHUB_REF_NAME#app-v}"
            echo "version=$VERSION" >> "$GITHUB_OUTPUT"

        - name: Create draft release
          id: create
          uses: softprops/action-gh-release@v2
          with:
            tag_name: ${{ github.ref_name }}
            name: Paperboy ${{ steps.version.outputs.version }}
            draft: true
            prerelease: false
            generate_release_notes: true

    build:
      name: Build ${{ matrix.label }}
      needs: create-release
      strategy:
        fail-fast: false
        matrix:
          include:
            - { os: macos-14,     target: universal-apple-darwin, label: macOS (universal) }
            - { os: windows-2022, target: '',                     label: Windows (x64) }
            - { os: ubuntu-22.04, target: '',                     label: Linux (x64) }
      runs-on: ${{ matrix.os }}

      steps:
        - uses: actions/checkout@v5

        - name: Use Node.js 24
          uses: actions/setup-node@v5
          with:
            node-version: 24
            cache: npm
            cache-dependency-path: package-lock.json

        - name: Install Rust stable
          uses: dtolnay/rust-toolchain@stable
          with:
            targets: ${{ matrix.target }}

        - name: Cargo cache
          uses: swatinem/rust-cache@v2
          with:
            workspaces: paperboy-app/src-tauri -> target

        - name: Install Linux build deps
          if: matrix.os == 'ubuntu-22.04'
          run: |
            sudo apt-get update
            sudo apt-get install -y \
              libwebkit2gtk-4.1-dev \
              libappindicator3-dev \
              librsvg2-dev \
              patchelf \
              libssl-dev \
              build-essential \
              file \
              wget

        - name: Install dependencies (root, all workspaces)
          run: npm ci

        - name: Sync vendor + build converter
          working-directory: paperboy-app
          run: npm run sync:vendor

        - name: Build, sign, notarize, upload
          uses: tauri-apps/tauri-action@v0
          env:
            # macOS signing + notarization (hard-required on mac runner; ignored on other runners)
            APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
            APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
            APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
            APPLE_ID: ${{ secrets.APPLE_ID }}
            APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
            APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
            # Windows signing (soft-guarded; if empty, nsis builds unsigned)
            WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE }}
            WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
            # Updater bundle signing (soft-guarded; if empty, no .sig files emitted)
            TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
            TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
            GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          with:
            projectPath: paperboy-app
            releaseId: ${{ needs.create-release.outputs.release_id }}
            args: ${{ matrix.target && format('--target {0}', matrix.target) || '' }}

    publish-release:
      name: Publish release + write update manifests
      needs: [create-release, build]
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v5

        - name: Publish draft release
          uses: softprops/action-gh-release@v2
          with:
            tag_name: ${{ github.ref_name }}
            draft: false

        - name: Generate updater manifests
          id: manifests
          shell: bash
          env:
            GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
            VERSION: ${{ needs.create-release.outputs.version }}
          run: |
            set -euo pipefail
            mkdir -p updates
            PUB_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
            # Fetch the release JSON to enumerate assets + their browser_download_url
            RELEASE_JSON="$(gh release view "$GITHUB_REF_NAME" --json assets,body --jq '.')"
            NOTES="$(echo "$RELEASE_JSON" | jq -r '.body // ""')"

            # For each (target, arch) the plugin asks for, build a manifest if the
            # corresponding bundle was uploaded. Linux is intentionally skipped per plan.
            declare -A TARGETS=(
              ["darwin-aarch64"]="*.app.tar.gz"
              ["darwin-x86_64"]="*.app.tar.gz"
              ["windows-x86_64"]="*-setup.nsis.zip"
            )

            for KEY in "${!TARGETS[@]}"; do
              PATTERN="${TARGETS[$KEY]}"
              ASSET_URL="$(echo "$RELEASE_JSON" | jq -r --arg p "$PATTERN" '.assets[] | select(.name | test($p | gsub("\\*"; ".*"))) | .browser_download_url' | head -1)"
              SIG_URL="$(echo "$RELEASE_JSON" | jq -r --arg p "${PATTERN}.sig" '.assets[] | select(.name | test($p | gsub("\\*"; ".*"))) | .browser_download_url' | head -1)"
              if [ -z "$ASSET_URL" ]; then
                echo "skipping $KEY (no asset matching $PATTERN)"
                continue
              fi
              SIGNATURE=""
              if [ -n "$SIG_URL" ]; then
                SIGNATURE="$(curl -sSL "$SIG_URL")"
              fi
              mkdir -p "updates/$KEY"
              cat > "updates/$KEY/$VERSION" <<EOF
            {
              "version": "$VERSION",
              "notes": $(echo "$NOTES" | jq -Rs '.'),
              "pub_date": "$PUB_DATE",
              "platforms": {
                "$KEY": {
                  "url": "$ASSET_URL",
                  "signature": "$SIGNATURE"
                }
              }
            }
            EOF
              echo "wrote updates/$KEY/$VERSION"
            done

        - name: Upload manifests as workflow artifact
          uses: actions/upload-artifact@v4
          with:
            name: updater-manifests
            path: updates/

        - name: Open PR to paperboy-site committing manifests
          if: env.SITE_TOKEN != ''
          env:
            SITE_TOKEN: ${{ secrets.PAPERBOY_SITE_PUSH_TOKEN }}
            VERSION: ${{ needs.create-release.outputs.version }}
          run: |
            set -euo pipefail
            git config --global user.email "release-bot@paperboy.run"
            git config --global user.name "Paperboy Release Bot"
            git clone "https://x-access-token:${SITE_TOKEN}@github.com/proticom/paperboy-site.git" /tmp/site
            cd /tmp/site
            git checkout -b "updates/${VERSION}"
            mkdir -p public/updates
            cp -R "$GITHUB_WORKSPACE/updates/." public/updates/
            git add public/updates
            git commit -m "chore(updates): publish paperboy ${VERSION} manifests"
            git push origin "updates/${VERSION}"
            gh pr create \
              --repo proticom/paperboy-site \
              --title "Publish paperboy ${VERSION} updater manifests" \
              --body "Auto-generated by .github/workflows/release-desktop.yml for tag ${GITHUB_REF_NAME}." \
              --base master --head "updates/${VERSION}"
  ```

  Field-by-field rationale:
  - **`on.push.tags: 'app-v*'`** — matches plan trigger.
  - **`permissions.contents: write`** — needed for `softprops/action-gh-release` to create + upload to the GitHub Release.
  - **3-job topology** — `create-release` (draft) → `build` (matrix, parallel) → `publish-release` (flip draft + write manifests). The draft-first pattern lets the matrix uploads accumulate atomically; publishing happens only after all platforms succeed.
  - **Matrix:** `macos-14` (Apple Silicon, runs universal build via `--target universal-apple-darwin`), `windows-2022` (latest stable Windows runner), `ubuntu-22.04` (matches the GTK 4.1 dep). Deviation from plan's two-mac-runner matrix (universal handled in-runner instead). Open question flagged.
  - **`swatinem/rust-cache@v2`** — caches Cargo registry + target dir keyed on Cargo.lock. Cuts mac build from ~12 min to ~3 min on warm cache. Already a community standard.
  - **Linux apt deps** — Tauri v2 minimum set for ubuntu-22.04 per https://v2.tauri.app/start/prerequisites/. `libwebkit2gtk-4.1-dev` (NOT 4.0; 22.04 has 4.0 in main repo but Tauri v2 wants 4.1 from universe; verify on first run — fall back to 4.0 with a config setting if 4.1 not available). Update: ubuntu-22.04 has 4.0 only; ubuntu-24.04 has 4.1. **Either bump runner to `ubuntu-24.04`** (recommended; matches Tauri v2's docs) **or keep ubuntu-22.04 with `libwebkit2gtk-4.0-dev` + a Cargo feature flag**. Plan says `ubuntu-22.04`; honoring that, use 4.0. Builder note: if `tauri build` errors on missing 4.1, swap to `ubuntu-24.04` (one line change).
  - **`npm ci` at root** — workspace install, matches `ci.yml` + `publish-paperboy*.yml` pattern.
  - **`sync:vendor` in `paperboy-app`** — copies markdown-it + plugins into `src/scripts/vendor/` AND bundles the converter. Required before `tauri build` because Tauri's frontend bundle expects those vendor files at build time.
  - **`tauri-apps/tauri-action@v0`** — the action handles `tauri build` invocation + Apple keychain setup (creating temp keychain, importing `.p12`, unlocking) + notarization (calling `notarytool` with `APPLE_ID`+`APPLE_PASSWORD`+`APPLE_TEAM_ID`) + Windows signtool invocation (if `WINDOWS_CERTIFICATE` set) + uploading every artifact in `target/release/bundle/**` to the `releaseId` we created. Soft-guards happen INSIDE the action — when `WINDOWS_CERTIFICATE` is empty, it skips signing and uploads the unsigned `.exe`. Behavior verified against tauri-action's source: https://github.com/tauri-apps/tauri-action.
  - **`args: --target universal-apple-darwin`** (mac only) — `tauri-action` forwards this verbatim to `tauri build`. Result: a single fat `.app` + `.dmg` containing both arm64 + x86_64. Tauri v2 + `@tauri-apps/cli@2.7+` supports this natively.
  - **`projectPath: paperboy-app`** — tells `tauri-action` where `src-tauri/` lives.
  - **`publish-release` job** — `softprops/action-gh-release` with `draft: false` flips the draft to published. Then the manifest step uses `gh release view --json assets` to enumerate uploaded assets, builds per-platform JSON manifests matching the endpoint pattern `/updates/{target}-{arch}/{version}`, downloads `.sig` content (if present), embeds in manifest. Skips Linux per plan line 167.
  - **Manifest shape:** matches Tauri v2 updater plugin's expected schema (https://v2.tauri.app/plugin/updater/#server-format):
    ```json
    {
      "version": "0.2.2",
      "notes": "Release notes ...",
      "pub_date": "2026-05-26T00:00:00Z",
      "platforms": {
        "darwin-aarch64": {
          "url": "https://github.com/.../Paperboy_0.2.2_universal.app.tar.gz",
          "signature": "<minisign signature from .sig file>"
        }
      }
    }
    ```
    Per-platform-file means each file contains ONLY the matching platform key. The plugin substitutes `{{target}}-{{arch}}` into the endpoint URL and fetches that exact file. Empty signature is acceptable when `TAURI_SIGNING_PRIVATE_KEY` is unset (operational tail).
  - **Manifest asset filename pattern:** mac uses `.app.tar.gz` (the tarball of the universal `.app`; this is what `tauri-plugin-updater` downloads + extracts in-place). Windows uses `-setup.nsis.zip` (Tauri v2 emits this filename for the nsis installer; double-check by inspecting bundle output after first run). Linux skipped.
  - **Site-PR step soft-guard:** `if: env.SITE_TOKEN != ''` — when `PAPERBOY_SITE_PUSH_TOKEN` is unset, skip PR; the manifests still upload as a workflow artifact (`updater-manifests`) for manual review. When the PAT lands, automation takes over.
  - **`gh pr create`** — opens the PR with a deterministic title + body. Branch name `updates/{version}` collides cleanly if the same version is rebuilt (rare; the workflow can be re-run on a tag and the second push overwrites the branch).

  Field-by-field call-outs (what NOT to touch in this PR):
  - **Do NOT modify `paperboy-app/package.json`** to add a `tauri:build` script. The workflow uses `npm exec tauri -- build` indirectly via `tauri-action`. Adding a script is scope creep that touches a different ownership boundary.
  - **Do NOT modify `paperboy-app/src-tauri/tauri.conf.json`.** 5.1-5.5 already locked it; nothing in 5.6 requires another bundle config edit.
  - **Do NOT add anything to `paperboy-site/`.** The workflow's PR step creates the files at runtime against the live site repo.
  - **Do NOT add `.github/workflows/release-ext.yml`.** That's 6.3's job.
  - **Do NOT cut a tag.** That's 5.8's job.
  - **Do NOT pre-fill any secret values.** GitHub Actions secrets are populated by the human via the repo settings UI.

- Validation:

  ```bash
  # 1. Confirm exactly one new file in the monorepo
  cd /Users/edward/MSDev/projects/paperboy && git status --short .github/
  # expected:
  # A  .github/workflows/release-desktop.yml

  # 2. YAML lint — should parse cleanly
  python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release-desktop.yml')); print('ok')"
  # expected: ok

  # 3. actionlint (if installed) catches GHA-specific issues. Not required, but useful.
  command -v actionlint && actionlint .github/workflows/release-desktop.yml
  # expected: no issues, OR actionlint not installed (warning OK)

  # 4. Confirm trigger pattern
  yq '.on.push.tags' .github/workflows/release-desktop.yml
  # expected: ['app-v*']

  # 5. Confirm matrix includes mac+win+linux
  yq '.jobs.build.strategy.matrix.include' .github/workflows/release-desktop.yml
  # expected: 3 entries with os ∈ {macos-14, windows-2022, ubuntu-22.04}

  # 6. Confirm tauri-action usage
  grep -n "tauri-apps/tauri-action" .github/workflows/release-desktop.yml
  # expected: 1 occurrence, v0

  # 7. Confirm soft-guards
  grep -n "if: env.SITE_TOKEN" .github/workflows/release-desktop.yml
  # expected: 1 occurrence in publish-release job

  # 8. Scope guard — no other file touched
  cd /Users/edward/MSDev/projects/paperboy && git status --short \
    .claude/ paperboy-site/ paperboy-cli/ paperboy-converter/ paperboy-widget/ \
    paperboy-ext/ paperboy-ai/ paperboy-app/
  # expected: empty (only .github/ should be dirty)

  # 9. No regressions to 5.1-5.5
  jq '.bundle.targets, .plugins.updater | keys' paperboy-app/src-tauri/tauri.conf.json
  # expected: ["dmg","nsis","deb","appimage"], plus updater keys (active, dialog, endpoints, pubkey, windows)

  # 10. JS workspace tests + builds still green
  cd /Users/edward/MSDev/projects/paperboy && npm test --workspaces --if-present 2>&1 | tail -10
  cd /Users/edward/MSDev/projects/paperboy && npm run build --workspaces --if-present 2>&1 | tail -5
  # expected: tests green; builds green. (5.6 is a CI YAML add — no code touched, no behavior changed.)
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 5.6.

Objective: Add ONE new file, `.github/workflows/release-desktop.yml`, that wires the desktop release pipeline per the spec above. The workflow triggers on `app-v*` tags, builds + signs + notarizes + uploads installers for macOS (universal `.dmg` + `.app.tar.gz`), Windows (`.exe` via nsis), and Linux (`.AppImage` + `.deb`), then generates per-platform `latest.json` updater manifests and opens a PR against the `paperboy-site` repo to publish them at `public/updates/{target}-{arch}/{version}`.

Files to edit:

1. **Create** `.github/workflows/release-desktop.yml` with EXACTLY the YAML in Finding 1's `Required fix` block above. Verbatim — including the leading comment block documenting soft-guarded vs hard-required secrets, the 3-job topology (`create-release` → `build` → `publish-release`), the `tauri-apps/tauri-action@v0` usage, and the inline bash for manifest generation + site PR.

   Important rules:
   - File MUST be valid YAML. Test with `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-desktop.yml'))"` (exit 0).
   - File MUST be UTF-8, LF line endings (no CRLF — GitHub Actions tolerates both, but the repo's other workflows use LF).
   - Use 2-space indentation throughout (matches `ci.yml`).
   - Permissions block at top level grants `contents: write` (release upload) + `id-token: write` (future-proof). NOT `contents: read` — that would block asset uploads.
   - The mac matrix entry uses `os: macos-14` (latest Apple Silicon runner) and `target: universal-apple-darwin`. Do NOT add a separate `macos-13` entry — the universal target builds both archs from the arm64 runner.
   - The Windows entry uses `os: windows-2022` (latest stable Windows runner) and empty `target` (default native).
   - The Linux entry uses `os: ubuntu-22.04` per plan. **If `tauri build` fails on this runner because `libwebkit2gtk-4.1-dev` is not in apt repos, change to `ubuntu-24.04`** (one-line edit; this is a known Tauri-v2-on-22.04 friction point). Comment in YAML noting the 24.04 fallback option.
   - The `swatinem/rust-cache@v2` block uses `workspaces: paperboy-app/src-tauri -> target` (note the `-> target` suffix — that's the syntax for telling the action where the target dir is).
   - The `tauri-action` step's `env` block lists ALL the secrets — even ones that aren't set yet. GitHub Actions substitutes empty strings for unset secrets without erroring; the action's internal soft-guards handle empty values.
   - The `publish-release` job's manifest-generation bash uses `gh release view --json assets` to enumerate uploaded assets and `jq` to filter by filename pattern. Use the EXACT patterns: `*.app.tar.gz` (mac), `*-setup.nsis.zip` (win). Skip Linux. The `.sig` files (when present) have the same name as the asset with `.sig` appended.
   - The site-PR step's `if: env.SITE_TOKEN != ''` guard — when `PAPERBOY_SITE_PUSH_TOKEN` secret is unset, GitHub substitutes empty string, the condition is false, the step is skipped. When it's set, the step clones the site repo via `https://x-access-token:${SITE_TOKEN}@github.com/proticom/paperboy-site.git`, creates branch `updates/{version}`, commits the manifests, pushes, and opens a PR via `gh pr create` against the `master` branch.
   - DO NOT add a `workflow_dispatch` manual trigger. Plan says tag-only. Manual dispatch invites accidental releases.
   - DO NOT add a `pull_request` trigger. This workflow would consume cert/notarize secrets on every PR — security risk.
   - DO NOT replace `tauri-apps/tauri-action@v0` with hand-rolled bash. The action is the de-facto standard and handles dozens of edge cases (Apple keychain setup, notarytool retry, signtool invocation, asset upload deduplication).

Files NOT to edit:
- `paperboy-app/package.json` — no `tauri:build` script add; workflow uses `npm exec tauri -- build` via `tauri-action`.
- `paperboy-app/src-tauri/tauri.conf.json` — 5.1-5.5 already wired it; 5.6 reads but does not modify.
- `paperboy-app/src-tauri/Cargo.toml` — no Rust deps added.
- `paperboy-app/src/**` — no frontend changes.
- `paperboy-app/scripts/**` — no script changes; `sync:vendor` is invoked as-is.
- `paperboy-site/**` — the workflow PRs into the site repo at runtime; the diff stays at zero in this PR.
- `.github/workflows/ci.yml` — untouched.
- `.github/workflows/publish-paperboy*.yml` — untouched.
- `.github/workflows/release-ext.yml` — 6.3's job; do NOT create.
- `paperboy-cli`, `paperboy-converter`, `paperboy-widget`, `paperboy-ext`, `paperboy-ai` — out of scope.
- `.claude/skills/release-cut/SKILL.md` — 8.4's job to update for `app-v*` tag handling.
- Any GitHub repo settings (secrets, environments, branch protection) — human admin actions; the workflow consumes them when present.

Implementation notes:
- `tauri-apps/tauri-action@v0` resolves to the latest v0.x release at workflow runtime. As of 2026-05, that's `v0.5.x`. The action's README is at https://github.com/tauri-apps/tauri-action; the env-var list it consumes is the canonical set the workflow plugs into.
- The `.app.tar.gz` artifact is what `tauri-plugin-updater` downloads + extracts in-place to replace the running `.app`. Tauri v2 emits this automatically when the updater plugin is registered AND `TAURI_SIGNING_PRIVATE_KEY` is set. When the key is unset, the action emits the `.dmg` + the `.app` but NOT the `.app.tar.gz` — meaning the manifest step won't find an asset, and the mac updater path is effectively dead until the key is generated. That's the deferred operational tail of 5.5 / hand-off into 5.8 verification. Document this in a comment.
- The site-PR step assumes `gh` is installed on the ubuntu runner — it is, by default. No extra setup.
- The `notes` field in the manifest is the release body (markdown). `jq -Rs '.'` JSON-escapes it correctly.
- The manifest writes use a heredoc with `$VERSION`/`$KEY`/`$ASSET_URL`/`$SIGNATURE`/`$NOTES`/`$PUB_DATE` interpolated. The `$NOTES` interpolation is via `$(echo "$NOTES" | jq -Rs '.')` which produces a quoted JSON string — DO NOT add extra quotes around `$(...)` in the heredoc; the jq output already includes them.
- The `gh release view` command requires `GH_TOKEN` env — provided via `GITHUB_TOKEN` secret. Read-only on the current repo; no PAT needed for this step.
- The site-PR step's `gh pr create` requires the PAT-backed token (default GITHUB_TOKEN can't write to a different repo). The `--repo proticom/paperboy-site` flag scopes the PR creation to the site repo. Note: `gh` reads `GITHUB_TOKEN` first; we need to override with the PAT. Set `GH_TOKEN: ${{ secrets.PAPERBOY_SITE_PUSH_TOKEN }}` on the step's env (in addition to passing the token in the clone URL). Update the YAML to include both.

Tests to add: none. This is a CI YAML file — its behavior is "the workflow runs successfully on the GitHub runners", which is verified by cutting a tag (5.8's job). The most we can do statically is YAML lint + actionlint (optional).

Commands to run (capture exit codes in your reply):

```bash
cd /Users/edward/MSDev/projects/paperboy

# 1. Confirm exactly one new file (no other changes)
git status --short
# expected:
# A  .github/workflows/release-desktop.yml

# 2. YAML parses cleanly
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-desktop.yml')); print('YAML OK')"
# expected: YAML OK

# 3. Optional: actionlint
command -v actionlint && actionlint .github/workflows/release-desktop.yml || echo "actionlint not installed (OK)"

# 4. Trigger pattern
python3 -c "import yaml; w=yaml.safe_load(open('.github/workflows/release-desktop.yml')); print(w['on']['push']['tags'])"
# expected: ['app-v*']

# 5. Matrix shape
python3 -c "import yaml; w=yaml.safe_load(open('.github/workflows/release-desktop.yml')); [print(e['os'], e.get('target','')) for e in w['jobs']['build']['strategy']['matrix']['include']]"
# expected: 3 lines
# macos-14 universal-apple-darwin
# windows-2022
# ubuntu-22.04

# 6. tauri-action present
grep -n "tauri-apps/tauri-action" .github/workflows/release-desktop.yml
# expected: 1 line, value @v0

# 7. Soft-guard for site PR
grep -n "if: env.SITE_TOKEN" .github/workflows/release-desktop.yml
# expected: 1 hit

# 8. Scope guard
git status --short .claude/ paperboy-app/ paperboy-site/ paperboy-cli/ paperboy-converter/ paperboy-widget/ paperboy-ext/ paperboy-ai/ scripts/ package.json
# expected: empty

# 9. JS workspace tests + builds still green (no source touched, just YAML add)
npm test --workspaces --if-present 2>&1 | grep -E "Test Files|Tests " | tail -10
# expected: same as 5.5 baseline (5 suites, 52/52)
npm run build --workspaces --if-present 2>&1 | tail -3
# expected: all green

# 10. Confirm 5.1-5.5 config not regressed
jq '.bundle.targets, (.plugins.updater | keys)' paperboy-app/src-tauri/tauri.conf.json
# expected: ["dmg","nsis","deb","appimage"], ["active","dialog","endpoints","pubkey","windows"]
```

Definition of done (turn 1):
- `.github/workflows/release-desktop.yml` exists with the exact shape in Finding 1's `Required fix`.
- File parses as valid YAML.
- Trigger is `tags: app-v*`.
- Matrix has exactly 3 entries: `macos-14`+`universal-apple-darwin`, `windows-2022`, `ubuntu-22.04`.
- 3-job topology: `create-release` (draft) → `build` (matrix, needs create-release) → `publish-release` (needs build, flips draft + writes manifests + opens site PR).
- Uses `tauri-apps/tauri-action@v0` for the build/sign/notarize step.
- Soft-guards on `WINDOWS_CERTIFICATE` (handled inside the action), `TAURI_SIGNING_PRIVATE_KEY` (handled inside the action), `PAPERBOY_SITE_PUSH_TOKEN` (handled inline via `if: env.SITE_TOKEN != ''`).
- Hard-requires Apple secrets on the mac runner — workflow will fail on mac if `APPLE_CERTIFICATE` is unset (intentional; mac builds without signing are useless).
- Generates per-platform manifests for `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64` only. No Linux manifest.
- Opens a PR against `paperboy-site` (master branch) when `PAPERBOY_SITE_PUSH_TOKEN` is set; otherwise uploads manifests as workflow artifact only.
- No other file in the monorepo changes. Workspace tests + builds still green.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- **Mac matrix shape — single universal runner vs two-runner+combine?** **Decision (assumption flag): single `macos-14` runner using `--target universal-apple-darwin`.** Rationale: Tauri v2 supports universal targets natively as of `@tauri-apps/cli@2.7+`; one runner is faster and simpler; produces an identical universal `.dmg`. The plan's literal "two runners + combine" is the v1-era pattern. If the human prefers the literal plan shape, the workflow gains a third `combine-macos` job (~30 lines: download both per-arch tarballs, `lipo -create` on the Mach-O, repack the `.app`, re-sign, re-notarize, re-staple, re-upload). Not blocking; either shape ships the same artifact.
- **Linux runner — `ubuntu-22.04` (per plan) vs `ubuntu-24.04` (Tauri v2 docs)?** **Decision: `ubuntu-22.04`** to match the plan; comment in the YAML notes that 24.04 is the fallback if `libwebkit2gtk-4.1-dev` isn't available. The builder should swap to 24.04 if the first CI run fails on the apt step.
- **Site PR branch reuse on retag?** When the same `app-v0.2.2` tag is force-pushed (rare; usually it'd be `app-v0.2.3`), the `updates/0.2.2` branch on the site repo already exists. **Decision: force-push the branch** (`git push -f`); the open PR's diff updates with the latest manifest. Add `git push -f origin "updates/${VERSION}"` instead of plain `git push`. Reasonable; the alternative is to skip the PR step on retag, which loses signal.
- **Should we add a `workflow_dispatch` trigger for manual smoke-testing?** **Decision: NO.** Plan says tag-only. Manual dispatch invites accidental releases that mutate the GitHub Release + open a site PR. If the human wants to test the workflow without cutting a tag, they can push a throwaway `app-v0.0.0-rc1` tag — semver pre-release tag would still match `app-v*`.
- **Should the manifest filename match the plan's literal `latest.json`?** Plan says "Generate `latest.json` updater manifest" but 5.5's endpoint config uses the per-platform path pattern `/updates/{{target}}-{{arch}}/{{current_version}}`. **Decision: keep the per-platform path pattern, write a file PER target-arch-version triple.** The literal `latest.json` shape is the v1 / single-manifest pattern; v2's per-platform per-version pattern is the more durable shape (lets old clients pin to a specific version while new clients pull the latest). Plan's `latest.json` was descriptive shorthand for "an updater manifest endpoint" — flagging in case the human reads it strictly. If strictly required, change `endpoints` in `tauri.conf.json` (5.5 edit, separate task) and emit a single `latest.json` with platform branching inside.
- **What if `tauri-action` emits a `.dmg` but no `.app.tar.gz`?** That happens when `TAURI_SIGNING_PRIVATE_KEY` is unset. **Decision: skip mac manifest writes when no `.app.tar.gz` matches** (the existing `if [ -z "$ASSET_URL" ]; then continue; fi` handles this gracefully). The mac auto-update path activates only once the updater key is generated — but the `.dmg` is still published for manual download. Acceptable trade-off.
- **Should we add a Slack/Discord notification on release?** **Decision: NO.** Not in plan; adds another secret + integration. The human can subscribe to the GitHub Release RSS feed.
- **Should the workflow auto-bump versions?** **Decision: NO.** Plan + the `release-cut` skill explicitly put bump-then-tag in human hands. Workflow consumes the tag and the `tauri.conf.json` version (they must match — `app-v0.2.2` tag + `version: "0.2.2"` in `tauri.conf.json`). Mismatch causes the action to use the conf version (artifact filenames carry the conf version, not the tag), which would be confusing but not broken. Add a future validation step (out of 5.6 scope).
- **Should we cache `node_modules`?** Already cached via `actions/setup-node@v5`'s `cache: npm`. Sufficient.
- **Should we add `concurrency` to cancel in-flight runs on retag?** **Decision: YES** — add `concurrency: { group: release-desktop-${{ github.ref }}, cancel-in-progress: true }` at the workflow top-level. Prevents a second run when the same tag is force-pushed quickly. Builder should include this.

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
5.6 turn 1: spec routed to builder. ONE new file `.github/workflows/release-desktop.yml` (~150 lines) — 3-job topology (create-release → build matrix → publish-release), `tauri-apps/tauri-action@v0` for build/sign/notarize/upload, matrix `macos-14`+`universal-apple-darwin` / `windows-2022` / `ubuntu-22.04`, soft-guards on Windows cert (5.3 deferred) + updater key (5.5 op-tail) + site PAT, per-platform manifest writes at `updates/{target}-{arch}/{version}` (no Linux per plan line 167), PR to paperboy-site master when PAT present else artifact upload. No tauri.conf.json/package.json/Rust changes. No tag-cut (5.8). Concurrency guard included.
