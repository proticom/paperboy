# 8.4 — Review Turn 1

## Task Context
- Task id: 8.4
- Task title: Update release-cut skill for five tag types
- Phase: Phase 8 — Cross-cutting hardening
- Turn: 1 of 4
- Spec section (`/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md` line 160):
  > "**8.4** Update the `release-cut` skill at `.claude/skills/release-cut/SKILL.md` to handle all five tag types (`v*`, `cli-v*`, `widget-v*`, `app-v*`, `ext-v*`) and prompt the user for which package(s) to ship."

- Related context (verified by reviewer):
  - Working tree: project repo, branch `main`, commit `e96536a`. 8.1/8.2/8.3 just landed.
  - Current skill file: `.claude/skills/release-cut/SKILL.md` (83 lines). Converter-only. Hard-codes the `v<version>` tag → converter publish flow.
  - **Active publish/release workflows** (verified by `cat .github/workflows/*.yml`):
    - `publish-paperboy-converter.yml` ← `v*` tags ← `@proticom/paperboy-converter` (npm OIDC trusted publish)
    - `publish-paperboy.yml` ← `cli-v*` tags ← `@proticom/paperboy-cli` (npm OIDC trusted publish; the workflow filename is historical from before the CLI was renamed)
    - `publish-paperboy-widget.yml` ← `widget-v*` tags ← `@proticom/paperboy-widget` (npm OIDC trusted publish)
    - `publish-paperboy-ai.yml` ← `ai-v*` tags ← `@proticom/paperboy-ai` (npm OIDC trusted publish; this workflow was added when `paperboy-ai` was extracted in commit `81b4570`, AFTER the spec was written)
    - `release-desktop.yml` ← `app-v*` tags ← `paperboy-editor` (Tauri build artifact, not an npm publish)
    - `release-ext.yml` ← `ext-v*` tags ← `@proticom/paperboy-ext` (chromewebstore + tarball, not an npm publish in the same sense as the others)
  - **The spec lists 5 tag types** but the codebase now has **6** active release workflows (because `ai-v*` was added after the plan was authored). The skill MUST handle all 6 — the spec is the floor, not the ceiling. Builder should call this out explicitly.
  - Package → tag mapping (verified):
    | Package | Current version | Tag prefix | Workflow | Publish target |
    |---|---|---|---|---|
    | `@proticom/paperboy-converter` | 0.2.2 | `v` | `publish-paperboy-converter.yml` | npm |
    | `@proticom/paperboy-cli` | 0.2.6 | `cli-v` | `publish-paperboy.yml` | npm |
    | `@proticom/paperboy-widget` | 0.2.2 | `widget-v` | `publish-paperboy-widget.yml` | npm |
    | `@proticom/paperboy-ai` | 0.2.2 | `ai-v` | `publish-paperboy-ai.yml` | npm |
    | `paperboy-editor` (app) | 0.2.2 | `app-v` | `release-desktop.yml` | GitHub Releases (Tauri artifacts) |
    | `@proticom/paperboy-ext` | 0.2.2 | `ext-v` | `release-ext.yml` | Chrome Web Store + tarball |

  - npm Trusted Publishing pattern (verified in `publish-paperboy-converter.yml` and adjacent): `permissions.id-token: write`, no `NPM_TOKEN`, no `registry-url` in `setup-node`, `npm publish --access public`. The skill must document this so a human bootstrapping a new package knows the recipe.

- Files inspected:
  - `.claude/skills/release-cut/SKILL.md` (current 83-line converter-only file)
  - All 6 active workflow files in `.github/workflows/`
  - All 7 `package.json` files in the monorepo
  - `scripts/bump-version.mjs` (referenced by current skill; verified it exists and is workspace-wide)

- Files NOT to touch:
  - `.github/workflows/**` — no workflow changes (those are separate tasks, e.g., 2.1, 6.3).
  - Any source code (`paperboy-*/src/`, `paperboy-*/dist/`).
  - Any `package.json` (no version bumps inside this task).
  - `paperboy-spec-tasks.json` (orchestrator-managed).
  - `paperboy-site/` (separate repo).
- Current claim: 8.4 turn 1, queue activator picked it after 8.3 closed.

## Findings

### Finding 1 (REQUIRED): Rewrite `.claude/skills/release-cut/SKILL.md` to be tag-type aware across all 6 active release workflows

- Severity: required (this is the entire body of work for 8.4)
- Location: `.claude/skills/release-cut/SKILL.md` (single file; full rewrite is fine since the current contents are converter-specific).

- Problem (current state):
  - The skill hardcodes converter-only logic: a single `v<version>` tag, `npm view @proticom/paperboy-converter@<version>`, "Watch the npm OIDC publish" assuming one workflow.
  - It says nothing about `cli-v`, `widget-v`, `app-v`, `ext-v`, `ai-v`.
  - It doesn't prompt for which package to ship.
  - It still references `/Volumes/Dev/projects/paperboy/` as the path (correct for current setup, but the path string is fragile — the skill should reference `the monorepo root` and let the model resolve `pwd`).

- Required fix: rewrite the SKILL.md to:

  1. **Header (frontmatter)** stays similar but mentions multi-package:
     ```markdown
     ---
     name: release-cut
     description: Ship a release for ONE of the six paperboy packages (converter, cli, widget, ai, app, ext). Prompts the user for which package and what version. Handles the tag-type → workflow mapping and watches the appropriate release run.
     disable-model-invocation: true
     ---
     ```

  2. **Step 1 — Ask which package(s) AND version.**
     - The model MUST ask the user up front: "Which package are you cutting a release for?" with the six options. Multi-select is allowed (e.g. converter + cli together).
     - For each selected package, ask for the version (default: next patch from the current `package.json`).
     - Establish a table that maps each user choice to: package directory, npm package name (or "n/a" for app/ext), tag prefix, workflow name.

  3. **Step 2 — Validate the choice.**
     - For npm packages (converter/cli/widget/ai), confirm npm Trusted Publisher is configured for that scope (a checklist link, not a runtime check; runtime would require npm-cli authentication).
     - For app, confirm the Tauri signing keys exist locally OR that the workflow self-builds.
     - For ext, confirm Chrome Web Store credentials are set as repo secrets.

  4. **Step 3 — Bump versions.**
     - If the user selected ONLY converter, use the workspace-wide `/bump-version` skill (or `node scripts/bump-version.mjs <version>`) — converter version aligns all consumers.
     - If the user selected a single non-converter package, bump JUST that package's `package.json` version (no monorepo-wide bump).
     - If the user selected multiple packages, do them in dependency order: converter → ai → cli → widget → app / ext.

  5. **Step 4 — Build + test every consumer.**
     - For each released package, run `npm --workspace=<name> run build` and `npm --workspace=<name> test` (where the package has tests).
     - Bail if any step exits non-zero.
     - This step is non-negotiable; a bad tag forces a new patch to undo.

  6. **Step 5 — Commit (monorepo).**
     - `git add -A && git commit -m "release: <package-1> v<v1>[, <package-2> v<v2>, ...]"`.
     - Single commit for the whole release batch.

  7. **Step 6 — Site repo sync (only if converter was bumped).**
     - `paperboy-site/` is a separate Git repo. Only if converter was bumped, update `paperboy-site/package.json`'s `@proticom/paperboy-converter` caret to include the new version, then commit + push.
     - Skip otherwise.

  8. **Step 7 — Push monorepo.**
     - `git push origin main`.

  9. **Step 8 — Tag + push tags.**
     - For each released package, push the appropriate tag:
       | Package | Tag command |
       |---|---|
       | converter | `git tag v<version> && git push origin v<version>` |
       | cli | `git tag cli-v<version> && git push origin cli-v<version>` |
       | widget | `git tag widget-v<version> && git push origin widget-v<version>` |
       | ai | `git tag ai-v<version> && git push origin ai-v<version>` |
       | app | `git tag app-v<version> && git push origin app-v<version>` |
       | ext | `git tag ext-v<version> && git push origin ext-v<version>` |
     - If multiple packages were released, push the tags one at a time (each one triggers its own workflow).

  10. **Step 9 — Watch the publish/release runs.**
      - For each tag pushed, use `gh run watch` filtered to the right workflow:
        ```bash
        # converter
        gh run watch --exit-status $(gh run list --workflow="publish-paperboy-converter.yml" --limit 1 --json databaseId --jq '.[0].databaseId')
        # cli
        gh run watch --exit-status $(gh run list --workflow="publish-paperboy.yml" --limit 1 --json databaseId --jq '.[0].databaseId')
        # widget
        gh run watch --exit-status $(gh run list --workflow="publish-paperboy-widget.yml" --limit 1 --json databaseId --jq '.[0].databaseId')
        # ai
        gh run watch --exit-status $(gh run list --workflow="publish-paperboy-ai.yml" --limit 1 --json databaseId --jq '.[0].databaseId')
        # app
        gh run watch --exit-status $(gh run list --workflow="release-desktop.yml" --limit 1 --json databaseId --jq '.[0].databaseId')
        # ext
        gh run watch --exit-status $(gh run list --workflow="release-ext.yml" --limit 1 --json databaseId --jq '.[0].databaseId')
        ```
      - On any failure, surface the last ~40 lines via `gh run view --log-failed`.

  11. **Step 10 — Verify.**
      - For npm packages: `npm view @proticom/<pkg>@<version> version` (use scoped name).
      - For the app: confirm the GitHub Release was created with the expected `app-v<version>` tag and contains `.dmg` / `.app.tar.gz` / `.exe` / `.AppImage` artifacts.
      - For the ext: confirm the Chrome Web Store upload succeeded (workflow logs).

  12. **Step 11 — Report.**
      - For each released package: name, version, tag, npm/GH-Releases status, commit SHA.
      - Site repo commit SHA (only if converter was bumped).
      - Vercel: paperboy-site auto-redeploys on its own push.

  13. **"What NOT to do" section** keeps the existing warnings AND adds:
      - Don't tag a non-converter package using `v<version>` — that triggers the converter workflow.
      - Don't push two related tags simultaneously (e.g. converter `v0.2.3` and cli `cli-v0.2.7`) — push converter first, wait for publish to complete, then push cli. Otherwise the cli build may pick up the old converter from npm and fail.

  14. **Reference: npm Trusted Publisher recipe** (concise, NOT a tutorial — just enough to remind a future bootstrapper):
      ```yaml
      # In any publish-*.yml:
      permissions:
        contents: read
        id-token: write          # required for OIDC
      # In setup-node@v5: DO NOT set registry-url (it writes .npmrc with empty token)
      # In the publish step: `npm publish --access public` — no NPM_TOKEN.
      ```

- Builder rules:
  - **Single file only:** `.claude/skills/release-cut/SKILL.md`.
  - No edits to `.github/workflows/**`, no edits to any `package.json`, no edits to any source code.
  - The rewrite MUST keep the YAML frontmatter (`name`, `description`, `disable-model-invocation: true`).
  - The skill text MUST mention all 6 packages explicitly. The spec says 5 because `paperboy-ai` was extracted after the spec was written — the skill must include `ai-v*` and the builder should call this out in the reply with the commit hash that introduced it.
  - The skill should reference "the monorepo root" rather than a hardcoded path. The current `/Volumes/Dev/projects/paperboy/` is fine to keep IF it stays as informative context, not as an instruction.
  - Total file length: aim for 130-200 lines. Concise instructions over prose.
  - Keep the existing "Prerequisites (one-time)" section but reorganize it: pre-reqs for npm publishing, pre-reqs for desktop releases, pre-reqs for extension releases.

- Validation:

  ```bash
  cd /Users/edward/MSDev/projects/paperboy

  # 1. File still exists, only this one file changed
  git status --short | grep -v reviews | grep -v paperboy-spec-tasks.json
  # expect: only " M .claude/skills/release-cut/SKILL.md" (plus the orchestrator state files)

  # 2. Frontmatter intact
  head -5 .claude/skills/release-cut/SKILL.md
  # expect: --- name: release-cut description: ... disable-model-invocation: true ---

  # 3. All 6 tag prefixes mentioned
  grep -E "v\*|cli-v|widget-v|ai-v|app-v|ext-v" .claude/skills/release-cut/SKILL.md | wc -l
  # expect: ≥ 6 distinct mentions

  # 4. All 6 packages named
  for name in paperboy-converter paperboy-cli paperboy-widget paperboy-ai paperboy-editor paperboy-ext; do
    grep -q "$name" .claude/skills/release-cut/SKILL.md && echo "ok: $name" || echo "MISSING: $name"
  done
  # expect: 6 "ok:" lines

  # 5. Workflow names mentioned
  for wf in publish-paperboy-converter publish-paperboy.yml publish-paperboy-widget publish-paperboy-ai release-desktop release-ext; do
    grep -q "$wf" .claude/skills/release-cut/SKILL.md && echo "ok: $wf" || echo "MISSING: $wf"
  done
  # expect: 6 "ok:" lines

  # 6. Prompt-the-user language present
  grep -iE "ask the user|prompt|which package" .claude/skills/release-cut/SKILL.md | head -3
  # expect: ≥ 1 match

  # 7. Trusted Publisher reminder present (id-token: write)
  grep "id-token" .claude/skills/release-cut/SKILL.md
  # expect: ≥ 1 match

  # 8. No other workspace touched
  git diff paperboy-converter/ paperboy-cli/ paperboy-widget/ paperboy-ai/ paperboy-app/ paperboy-ext/ paperboy-site/ 2>&1 | head
  # expect: empty

  # 9. No workflow edits
  git diff .github/workflows/
  # expect: empty

  # 10. File length sanity
  wc -l .claude/skills/release-cut/SKILL.md
  # expect: 130-220 lines
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 8.4.

**Objective:** Rewrite `.claude/skills/release-cut/SKILL.md` so the skill works for ALL 6 active release workflows in this monorepo (not just the converter). Prompt the user for which package(s) to release, then drive the right bump → build → tag → watch loop per choice.

**File to modify (1 total):**

1. **`.claude/skills/release-cut/SKILL.md`** — full rewrite is acceptable; keep the YAML frontmatter shape.

**Do not edit:**
- `.github/workflows/**` (workflows are correct; the skill just needs to know them by name).
- Any `package.json`, any source code, any other skill file.
- `paperboy-spec-tasks.json` (orchestrator-managed).
- `paperboy-site/`.

**Must cover (cross-check against the table below):**

| Package | npm name | Tag | Workflow file | Output |
|---|---|---|---|---|
| converter | `@proticom/paperboy-converter` | `v<version>` | `publish-paperboy-converter.yml` | npm registry |
| cli | `@proticom/paperboy-cli` | `cli-v<version>` | `publish-paperboy.yml` | npm registry |
| widget | `@proticom/paperboy-widget` | `widget-v<version>` | `publish-paperboy-widget.yml` | npm registry |
| ai | `@proticom/paperboy-ai` | `ai-v<version>` | `publish-paperboy-ai.yml` | npm registry |
| app | `paperboy-editor` (private; no npm publish) | `app-v<version>` | `release-desktop.yml` | GitHub Release (Tauri bundles) |
| ext | `@proticom/paperboy-ext` (npm-private; sideload tarball + Chrome Web Store) | `ext-v<version>` | `release-ext.yml` | GitHub Release + Chrome Web Store |

The spec line names 5 packages because `paperboy-ai` was extracted from the converter AFTER the spec was written (commit `81b4570`, "feat: extract paperboy-ai, wire app AI, and fix npm publish CI"). Treat the 6-package table as authoritative; mention this in your reply.

**Validate (run all from project root, paste outputs into the reply):**

```bash
cd /Users/edward/MSDev/projects/paperboy

# 1. Frontmatter intact
head -5 .claude/skills/release-cut/SKILL.md

# 2. Length sanity
wc -l .claude/skills/release-cut/SKILL.md
# expect: 130-220 lines

# 3. All 6 tag prefixes present
grep -E "v\*|cli-v|widget-v|ai-v|app-v|ext-v" .claude/skills/release-cut/SKILL.md | wc -l

# 4. All 6 packages named
for name in paperboy-converter paperboy-cli paperboy-widget paperboy-ai paperboy-editor paperboy-ext; do
  grep -q "$name" .claude/skills/release-cut/SKILL.md && echo "ok: $name" || echo "MISSING: $name"
done

# 5. All 6 workflows named
for wf in publish-paperboy-converter publish-paperboy.yml publish-paperboy-widget publish-paperboy-ai release-desktop release-ext; do
  grep -q "$wf" .claude/skills/release-cut/SKILL.md && echo "ok: $wf" || echo "MISSING: $wf"
done

# 6. Prompt-the-user language
grep -ciE "ask the user|prompt|which package" .claude/skills/release-cut/SKILL.md
# expect: ≥ 1

# 7. Trusted Publisher reminder
grep "id-token" .claude/skills/release-cut/SKILL.md

# 8. Scope: no other file changed
git status --short | grep -v reviews | grep -v paperboy-spec-tasks.json | grep -v paperboy-review-queue
# expect: " M .claude/skills/release-cut/SKILL.md" only

# 9. No workflow / package.json / src edits
git diff .github/workflows/ paperboy-converter/package.json paperboy-cli/package.json paperboy-widget/package.json paperboy-ai/package.json paperboy-app/package.json paperboy-ext/package.json
# expect: empty
```

When you reply, write `reviews/8.4/cursor-reply-turn-1.md` with:
(a) the final line count of SKILL.md,
(b) a short outline of the 11 steps you wrote (one bullet each),
(c) outputs of all validation commands above,
(d) confirmation that `paperboy-ai` is included as the 6th package (the spec only named 5).

## Consensus Checklist
- [ ] `.claude/skills/release-cut/SKILL.md` rewritten (single-file edit)
- [ ] YAML frontmatter preserved (name, description, disable-model-invocation: true)
- [ ] Description mentions multi-package + prompt-for-choice
- [ ] All 6 tag prefixes documented: `v`, `cli-v`, `widget-v`, `ai-v`, `app-v`, `ext-v`
- [ ] All 6 packages named: paperboy-converter, paperboy-cli, paperboy-widget, paperboy-ai, paperboy-editor (app), paperboy-ext
- [ ] All 6 workflow filenames mentioned: publish-paperboy-converter.yml, publish-paperboy.yml, publish-paperboy-widget.yml, publish-paperboy-ai.yml, release-desktop.yml, release-ext.yml
- [ ] Step 1 asks user which package(s) AND version
- [ ] Step 3 explains the bump pathway differs between converter (workspace-wide) and other packages (single-package)
- [ ] Step 4 includes build + test for every released package
- [ ] Step 6 explains site-repo sync is converter-only
- [ ] Step 8 tag table covers all 6 prefixes
- [ ] Step 9 `gh run watch` examples for every workflow
- [ ] Step 10 verification differs by output target (npm vs GH Release vs Chrome Web Store)
- [ ] npm Trusted Publisher reminder included (id-token: write)
- [ ] "What NOT to do" section retained + extended
- [ ] No edits outside `.claude/skills/release-cut/SKILL.md` (workflows, package.json, src untouched)
- [ ] File length 130-220 lines (range chosen to match the breadth of 6 packages without bloating)

## Decision

**send_to_builder.** Fresh task, no builder commit yet. Scope: single-file rewrite of `.claude/skills/release-cut/SKILL.md` to cover ALL 6 active release workflows (spec says 5, but `paperboy-ai` was extracted after the spec was written — the skill must reflect reality). 17-item validation checklist.

## Notes
- The spec line says 5 tag types; the reality is 6 because `paperboy-ai` was extracted from the converter (commit `81b4570`) after the spec was authored. Builder MUST include `paperboy-ai` and call this out in the reply. This is a faithful interpretation of the spec's intent ("cover all release workflows"), not a scope creep.
- The skill is a model-invoked SKILL.md (read by the assistant before driving a release), not a script. So "no tests" is correct — the validation is structural (every package + tag + workflow mentioned).
- The skill's "do not push two tags simultaneously" guidance addresses a real ordering risk: cli's build depends on the published converter, so the cli release must wait for the converter's npm publish to complete.
- After 8.4 closes, activator picks 8.5 (CHANGELOG.md per package) — the FINAL Phase 8 task before the run is fully green.
