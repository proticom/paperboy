# 6.3 - Review Turn 1

## Task Context
- Task id: 6.3
- Task title: Write `release-ext.yml` workflow (on `ext-v*` tags)
- Dashboard implementation status: in_progress (queue auto-activated 6.3 when 6.2 closed; no builder commit yet — turn-1 spec route to builder)
- Review status: in_review → waiting_for_builder
- Spec section (verbatim from `/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md`):
  - **Plan line 145 (task 6.3):**
    > "Write `.github/workflows/release-ext.yml` — on tag `ext-v*`: run `npm run package:store`, then upload `dist/paperboy-extension-<version>.zip` to a GitHub Release."
- Related context (verified):
  - **No existing `release-ext.yml`** (confirmed via `ls .github/workflows/release-ext.yml` → No such file).
  - **Existing workflow that we mirror** — `/Users/edward/MSDev/projects/paperboy/.github/workflows/publish-paperboy-widget.yml` (40 lines, OIDC pattern). It triggers on `widget-v*` tags, checks out, sets up Node 24 with `npm` cache against root `package-lock.json`, runs `npm ci` (root, all workspaces), builds in `paperboy-widget`, runs tests, publishes. We mirror the **structure** but adapt the tail: no npm publish, no `id-token`, instead package the zip and upload to a GitHub Release.
  - **GitHub Release upload pattern that's already in use in this repo** — `release-desktop.yml` (line 60) uses `softprops/action-gh-release@v2`. That's our canonical pattern. Use the same action.
  - **Package output path** — `paperboy-ext/package-for-store.js` writes `paperboy-ext/dist/paperboy-extension-${version}.zip` where `version` is read from `manifest.json` (currently `0.2.2`, post-6.4 will be bumped). The zip contains 13 runtime files (manifest, background.js, sidepanel.html, sidepanel.bundle.js, styles.css, readability.js, 4 tesseract files, 3 icon pngs).
  - **`package:store` script** — `paperboy-ext/package.json` line 9: `"package:store": "node build.js && node package-for-store.js"` (build then zip). Runs from `paperboy-ext/` working directory.
  - **Tag → version extraction pattern** — `release-desktop.yml` lines 51-56 use: `VERSION="${GITHUB_REF_NAME#app-v}"` then `echo "version=$VERSION" >> "$GITHUB_OUTPUT"`. We adapt to `ext-v` prefix.
  - **OIDC vs PAT** — widget workflow uses OIDC (`id-token: write`) for npm trusted publishing. For GitHub Release uploads, we only need `contents: write` (the default `GITHUB_TOKEN` is sufficient — no PAT, no OIDC).
  - **Concurrency** — `release-desktop.yml` uses `concurrency: { group: release-desktop-${{ github.ref }}, cancel-in-progress: true }`. Reasonable to mirror so re-pushing a tag doesn't pile up runs.
  - **Existing manifest version** — currently `0.2.2`. Task 6.4 owns the version bump + tag. 6.3 only writes the workflow file; it does not invoke or test the workflow.
- Files inspected:
  - `.github/workflows/publish-paperboy-widget.yml` (40 lines, full read — primary template)
  - `.github/workflows/publish-paperboy-converter.yml` (41 lines, full read — confirms OIDC vs Release distinction)
  - `.github/workflows/release-desktop.yml` (first 80 lines — Release-upload pattern and tag→version extraction)
  - `paperboy-ext/package.json` (full file, 23 lines)
  - `paperboy-ext/package-for-store.js` (full file, 59 lines — confirms output path)
  - Plan line 145 (`/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md`)
- Commands run (turn 1, read-only):
  ```bash
  $ ls .github/workflows/release-ext.yml
  ls: ... No such file or directory  (confirmed not yet written)

  $ ls .github/workflows/
  ci.yml  publish-paperboy-ai.yml  publish-paperboy-converter.yml
  publish-paperboy-widget.yml  publish-paperboy.yml  release-desktop.yml
  supply-chain-guard.yml

  $ grep -n "package:store\|package-for-store" paperboy-ext/package.json
  9:    "package:store": "node build.js && node package-for-store.js"
  ```
- Current claim being verified: 6.3 turn 1, queue token `6.3-0001`. Fresh spec route, no builder commit yet.

## Findings

### Finding 1: Create `.github/workflows/release-ext.yml` mirroring the widget workflow pattern, with Release-upload tail instead of npm-publish tail.

- Severity: required
- Location: `/Users/edward/MSDev/projects/paperboy/.github/workflows/release-ext.yml` — new file.
- Problem: Plan line 145 requires a GitHub Actions workflow that fires on `ext-v*` tags, runs `npm run package:store` in the extension workspace, and uploads the resulting zip to a GitHub Release. Without this, task 6.4's `ext-v0.2.2` tag push will produce no artifact, blocking 6.5 (site copy serving the sideload zip).
- **In scope (6.3):**
  1. One new file: `.github/workflows/release-ext.yml`.
  2. Trigger: `push` on tags matching `ext-v*`.
  3. Job that: checks out, sets up Node 24 with npm cache, runs `npm ci`, runs `npm run package:store` in `paperboy-ext/`, extracts version from the tag, uploads `paperboy-ext/dist/paperboy-extension-<version>.zip` to a GitHub Release.
- **Out of scope (6.3):**
  - Bumping the manifest version (6.4 owns that).
  - Pushing or testing the tag (6.4 owns the first tag push).
  - Modifying `paperboy-ext/package.json` or `package-for-store.js`.
  - Modifying other workflows or any other file in the repo.
  - Adding a Chrome Web Store auto-upload step (out of scope for this spec; sideload zip only).
  - Modifying `paperboy-site/`.
- Required fix: Builder creates exactly one file at `.github/workflows/release-ext.yml` with the following structure. **Use this as a starting template, not verbatim** — builder must read the existing widget + desktop workflows and adapt as needed. The key constraints are: trigger spec, Node 24, `npm ci`, `npm run package:store` in `paperboy-ext`, upload the produced zip via `softprops/action-gh-release@v2`.

  ```yaml
  # Releases paperboy-ext as a sideload zip on `ext-v*` tags.
  # Builds the Chrome Web Store packaging (npm run package:store) and uploads the
  # resulting paperboy-ext/dist/paperboy-extension-<version>.zip to a GitHub Release.
  # The Chrome Web Store upload itself is out of scope; consumers can sideload the zip
  # from the GitHub Release page (and task 6.5 may also mirror it to paperboy-site).
  name: Release paperboy-ext

  on:
    push:
      tags:
        - 'ext-v*'

  concurrency:
    group: release-ext-${{ github.ref }}
    cancel-in-progress: true

  permissions:
    contents: write   # required to create/upload to a GitHub Release

  jobs:
    release:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v5

        - name: Use Node.js 24
          uses: actions/setup-node@v5
          with:
            node-version: 24
            cache: npm
            cache-dependency-path: package-lock.json

        - name: Install dependencies (root, all workspaces)
          run: npm ci

        - name: Extract version from tag
          id: version
          shell: bash
          run: |
            VERSION="${GITHUB_REF_NAME#ext-v}"
            echo "version=$VERSION" >> "$GITHUB_OUTPUT"

        - name: Package extension for store
          working-directory: paperboy-ext
          run: npm run package:store

        - name: Verify zip exists
          shell: bash
          run: |
            ZIP="paperboy-ext/dist/paperboy-extension-${{ steps.version.outputs.version }}.zip"
            test -f "$ZIP" || { echo "Missing $ZIP"; exit 1; }
            ls -la "$ZIP"

        - name: Upload zip to GitHub Release
          uses: softprops/action-gh-release@v2
          with:
            tag_name: ${{ github.ref_name }}
            name: paperboy-ext ${{ steps.version.outputs.version }}
            draft: false
            prerelease: false
            generate_release_notes: true
            files: paperboy-ext/dist/paperboy-extension-${{ steps.version.outputs.version }}.zip
  ```

  **Builder rules:**
  - File path exactly `.github/workflows/release-ext.yml`. Do not place it elsewhere.
  - Trigger exactly `tags: ['ext-v*']`. Do not add branch triggers or `workflow_dispatch` for this spec.
  - Use `actions/checkout@v5`, `actions/setup-node@v5`, `softprops/action-gh-release@v2` — same major versions as the other workflows in this repo.
  - Node 24 (matches widget + converter workflows). Cache `npm` against root `package-lock.json`.
  - Use `npm ci` at the root (workspaces — same as widget workflow). Do not run `npm ci` inside `paperboy-ext/`.
  - `npm run package:store` must run with `working-directory: paperboy-ext`.
  - Tag → version extraction must strip the `ext-v` prefix exactly (so tag `ext-v0.2.2` produces version `0.2.2`, matching the zip filename `paperboy-extension-0.2.2.zip`).
  - Upload target is the zip at `paperboy-ext/dist/paperboy-extension-<version>.zip`.
  - `permissions: { contents: write }` — do not add `id-token: write` (we don't need OIDC; we're not publishing to npm).
  - YAML indent: 2 spaces (match other workflows).
  - File must end with a single trailing newline (POSIX).
  - Do not touch any other file. No edits to `paperboy-ext/package.json`, `package-for-store.js`, `manifest.json`, or other workflows.

- Validation:

  ```bash
  cd /Users/edward/MSDev/projects/paperboy

  # 1. File exists at exact path
  test -f .github/workflows/release-ext.yml && echo "file present"
  # expected: file present

  # 2. YAML parses cleanly (using python's PyYAML, which is preinstalled on macOS via Homebrew or pip)
  python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-ext.yml'))" && echo "valid YAML"
  # expected: valid YAML

  # 3. Trigger is exactly ext-v*
  python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/release-ext.yml')); print(d.get('on', d.get(True)))"
  # expected: a dict containing push: {tags: ['ext-v*']}
  # NOTE: PyYAML parses the bare key `on` as boolean True — that's a known YAML 1.1 quirk.
  # The workflow itself is valid; GitHub Actions parses `on:` correctly.

  # 4. Required steps present (grep, not parse — quirk-free)
  grep -E "actions/checkout@v5|actions/setup-node@v5|softprops/action-gh-release@v2" .github/workflows/release-ext.yml | wc -l | tr -d ' '
  # expected: 3

  grep -E "npm ci|npm run package:store" .github/workflows/release-ext.yml | wc -l | tr -d ' '
  # expected: 2

  grep -E "node-version: 24" .github/workflows/release-ext.yml
  # expected: a single match line

  grep -E "ext-v" .github/workflows/release-ext.yml | wc -l | tr -d ' '
  # expected: >= 2  (one in trigger, one in version-extraction)

  grep -E "paperboy-ext/dist/paperboy-extension-" .github/workflows/release-ext.yml
  # expected: a line referencing the zip path with ${{ steps.version.outputs.version }}

  # 5. No other workflow modified
  git status --short .github/workflows/
  # expected: only '?? .github/workflows/release-ext.yml'

  # 6. Repo-wide: only the new workflow file
  git status --short | grep -v -E "(reviews/|paperboy-spec-tasks.json|paperboy-review-queue.json)" | head -10
  # expected: only the new workflow file (plus the orchestrator's own review/queue/spec churn which is expected)

  # 7. Optional: actionlint if installed (won't block — but report)
  command -v actionlint >/dev/null && actionlint .github/workflows/release-ext.yml || echo "actionlint not installed (optional)"
  # expected: clean output if installed; otherwise the "not installed" notice
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 6.3.

**Objective:** Create `.github/workflows/release-ext.yml` so pushing a tag `ext-v<version>` builds `paperboy-ext`, runs `npm run package:store`, and uploads the resulting `paperboy-ext/dist/paperboy-extension-<version>.zip` to a GitHub Release for that tag. Mirror the structure of `.github/workflows/publish-paperboy-widget.yml` (Node 24 + npm ci) and use the `softprops/action-gh-release@v2` upload pattern already in `.github/workflows/release-desktop.yml`.

**Files to create:**

1. **`.github/workflows/release-ext.yml`** (new file, ~50 lines, see Required fix above for a template). Adapt the template to taste but respect every Builder Rule listed.

**Do not edit:** anything else. No changes to other workflows, no changes to `paperboy-ext/package.json`, `package-for-store.js`, `manifest.json`, or any other file in any workspace. Do not push or create a tag.

**Validate (run these exact commands and report back the outputs):**

```bash
cd /Users/edward/MSDev/projects/paperboy

test -f .github/workflows/release-ext.yml && echo "file present"

python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-ext.yml'))" && echo "valid YAML"

grep -E "actions/checkout@v5|actions/setup-node@v5|softprops/action-gh-release@v2" .github/workflows/release-ext.yml | wc -l | tr -d ' '
# expect: 3

grep -E "npm ci|npm run package:store" .github/workflows/release-ext.yml | wc -l | tr -d ' '
# expect: 2

grep -E "node-version: 24" .github/workflows/release-ext.yml

grep -E "ext-v" .github/workflows/release-ext.yml | wc -l | tr -d ' '
# expect: >= 2

grep -E "paperboy-ext/dist/paperboy-extension-" .github/workflows/release-ext.yml

git status --short .github/workflows/
# expect: only '?? .github/workflows/release-ext.yml'
```

When you reply, write `reviews/6.3/cursor-reply-turn-1.md` with: (a) the full contents of the new workflow file (so the reviewer can read it without checking out the diff); (b) the output of each validation command; (c) a one-line confirmation that no other file was touched.

## Consensus Checklist
- [ ] `.github/workflows/release-ext.yml` exists at exactly that path
- [ ] YAML parses cleanly via `python3 -c "import yaml; yaml.safe_load(...)"`
- [ ] Trigger is `on: push: tags: ['ext-v*']` (no branch trigger, no workflow_dispatch)
- [ ] Uses `actions/checkout@v5`, `actions/setup-node@v5`, `softprops/action-gh-release@v2` (matches repo conventions)
- [ ] Node 24 with `cache: npm` against root `package-lock.json`
- [ ] Runs `npm ci` at root (workspaces) and `npm run package:store` in `paperboy-ext/`
- [ ] Extracts version with `${GITHUB_REF_NAME#ext-v}` (so `ext-v0.2.2` → `0.2.2`)
- [ ] Upload target is `paperboy-ext/dist/paperboy-extension-<version>.zip` (matches `package-for-store.js` output)
- [ ] `permissions: contents: write` (no `id-token: write` — we're not OIDC publishing)
- [ ] No other file touched (no edits to other workflows, no edits to `paperboy-ext/*`)

## Decision
**send_to_builder.** Fresh task, no builder commit yet. Routing the new workflow file to the builder with a concrete template, six-action pin set, and a deterministic validation suite. Builder may use the template verbatim or adapt — but must satisfy every checklist item.

## Notes
- This workflow is **declarative only** for 6.3; it doesn't fire until 6.4 pushes the first `ext-v*` tag. So this task can pass on syntax/grep validation alone — actual execution will be verified in 6.4.
- The `softprops/action-gh-release@v2` action auto-creates the Release if it doesn't exist for the tag, and idempotently updates it on re-tags. Same behavior as `release-desktop.yml`.
- The `id-token: write` permission is intentionally **omitted** — this workflow doesn't publish to npm (no OIDC trusted publishing). Only `contents: write` is required for the Release upload via the default `GITHUB_TOKEN`.
- `generate_release_notes: true` mirrors `release-desktop.yml`; GitHub will auto-generate notes from commits since the last tag. Acceptable for a sideload zip.
- After 6.3 passes, 6.4 (manifest version bump + first `ext-v0.2.2` tag push) activates and will exercise this workflow end-to-end. Task 6.4 is currently in the DEFERRED list per the worker's running-state notes — confirm with the human before un-deferring.
