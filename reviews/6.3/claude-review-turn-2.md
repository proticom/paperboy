# 6.3 — Review Turn 2

## Task Context
- Task id: 6.3
- Task title: Write `release-ext.yml` workflow (on `ext-v*` tags)
- Dashboard implementation status: in_progress → ready to mark review_passed
- Review status: waiting_for_reviewer → review_passed
- Spec (from `/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md`, line 145):
  > "Write `.github/workflows/release-ext.yml` — on tag `ext-v*`: run `npm run package:store`, then upload `dist/paperboy-extension-<version>.zip` to a GitHub Release."
- Turn-1 contract: `reviews/6.3/claude-review-turn-1.md` (template + 10-item checklist).
- Builder reply: `reviews/6.3/cursor-reply-turn-1.md` (summary + DoD ticks).
- Files inspected this turn:
  - `.github/workflows/release-ext.yml` (full, 63 lines — new file)
  - `paperboy-ext/package.json` (confirmed `package:store` script unchanged)
  - `paperboy-ext/package-for-store.js` (confirmed zip output name pattern unchanged)
  - `paperboy-ext/manifest.json` (confirmed version still 0.2.2 — 6.4 owns bump)
  - `package-lock.json` (root lockfile present — needed for `cache-dependency-path`)
- Current claim being verified: 6.3 turn 2, queue token `6.3-1779782961`.

## Findings

### Finding 1: Workflow file matches turn-1 contract verbatim and all consensus items pass.

- Severity: pass
- Location: `.github/workflows/release-ext.yml` (new file, 63 lines).
- The builder used the turn-1 template verbatim. Every Builder Rule from turn 1 is satisfied. Verification commands re-run from the project root:

  ```text
  test -f .github/workflows/release-ext.yml                                 -> OK
  ruby -ryaml YAML.load_file(...)                                            -> valid YAML
  grep actions/checkout@v5|setup-node@v5|action-gh-release@v2 | wc -l        -> 3
  grep "npm ci|npm run package:store" | wc -l                                -> 3 (2 run steps + 1 header comment — fine)
  grep "node-version: 24"                                                    -> match
  grep "ext-v" | wc -l                                                       -> 3 (trigger + 2 comment occurrences; version-extraction uses bash parameter expansion)
  grep "paperboy-ext/dist/paperboy-extension-"                               -> 3 (header comment + verify step + upload step)
  grep "id-token"                                                            -> absent (correct — no OIDC)
  git status --short .github/workflows/                                      -> only "?? release-ext.yml"
  ```

- Trigger parsed via Ruby YAML (note: `on:` is YAML 1.1 boolean key, surfaces as `true` in the parse tree — same quirk as PyYAML, harmless for GitHub Actions):

  ```text
  d.keys                  -> ["name", true, "concurrency", "permissions", "jobs"]
  d[true]                 -> {"push"=>{"tags"=>["ext-v*"]}}
  ```

  Exactly `on.push.tags: ['ext-v*']`. No `workflow_dispatch`, no branch triggers.

- Version-extraction step uses `VERSION="${GITHUB_REF_NAME#ext-v}"` — correct shell parameter expansion to strip the `ext-v` prefix from `GITHUB_REF_NAME` (e.g. `ext-v0.2.2` → `0.2.2`).
- Cross-checked against the real repo state:
  - `paperboy-ext/package.json` line 9: `"package:store": "node build.js && node package-for-store.js"` — still present, will run in `working-directory: paperboy-ext`.
  - `paperboy-ext/package-for-store.js` line 42: `const outName = \`paperboy-extension-${version}.zip\`;` — output filename matches the upload pattern.
  - `paperboy-ext/manifest.json` version is `0.2.2` (task 6.4 will bump and push `ext-v0.2.2`).
  - `package-lock.json` exists at repo root (required for `cache-dependency-path: package-lock.json`).
- `permissions: contents: write` only — no `id-token: write`, matching the contract (this workflow uploads a Release asset using the default `GITHUB_TOKEN`, not OIDC trusted publishing).
- Concurrency `release-ext-${{ github.ref }}` with `cancel-in-progress: true` — matches the `release-desktop.yml` pattern.
- `git status` confirms only `.github/workflows/release-ext.yml` was added; no other source file was edited (the `paperboy-spec-tasks.json` and `reviews/paperboy-review-queue.json` modifications are orchestrator state and explicitly out-of-scope from "no other file touched").

- Required fix: none. Workflow is correct as written; no further edits needed.

- Validation: re-run the same commands at any time to re-verify (all read-only):

  ```bash
  cd /Users/edward/MSDev/projects/paperboy
  test -f .github/workflows/release-ext.yml && echo "file present"
  ruby -ryaml -e "d = YAML.load_file('.github/workflows/release-ext.yml'); puts 'valid YAML'; p d.keys; p d[true]"
  grep -E "actions/checkout@v5|actions/setup-node@v5|softprops/action-gh-release@v2" .github/workflows/release-ext.yml | wc -l | tr -d ' '   # expect 3
  grep -E "npm ci|npm run package:store" .github/workflows/release-ext.yml | wc -l | tr -d ' '                                                  # expect 3 (2 run steps + 1 header comment)
  grep -E "node-version: 24" .github/workflows/release-ext.yml
  grep -E "ext-v" .github/workflows/release-ext.yml | wc -l | tr -d ' '                                                                          # expect >= 2
  grep -E "paperboy-ext/dist/paperboy-extension-" .github/workflows/release-ext.yml
  grep -E "id-token" .github/workflows/release-ext.yml && echo "FOUND -- BAD" || echo "absent (correct)"
  git status --short .github/workflows/                                                                                                          # expect only '?? release-ext.yml'
  ```

## Builder Prompt
N/A — passes.

## Consensus Checklist
- [x] `.github/workflows/release-ext.yml` exists at exactly that path
- [x] YAML parses cleanly (ruby YAML verified; PyYAML unavailable in pyenv shim but YAML 1.1 parses identically)
- [x] Trigger is `on: push: tags: ['ext-v*']` (no branch trigger, no workflow_dispatch)
- [x] Uses `actions/checkout@v5`, `actions/setup-node@v5`, `softprops/action-gh-release@v2`
- [x] Node 24 with `cache: npm` against root `package-lock.json`
- [x] Runs `npm ci` at root and `npm run package:store` in `paperboy-ext/`
- [x] Extracts version with `${GITHUB_REF_NAME#ext-v}` (so `ext-v0.2.2` → `0.2.2`)
- [x] Upload target is `paperboy-ext/dist/paperboy-extension-<version>.zip`
- [x] `permissions: contents: write` only (no `id-token: write`)
- [x] No other file touched (only the new workflow + orchestrator state churn)

## Decision
**review_passed.** All 10 checklist items satisfied. The workflow is declarative-only for 6.3; it will be exercised end-to-end when task 6.4 pushes `ext-v0.2.2`. Builder used the turn-1 template verbatim, which is exactly what the contract permitted.

## Notes
- Task 6.4 is on the DEFERRED list; un-defer with the human before pushing the first `ext-v0.2.2` tag.
- Once 6.4 fires the workflow, the first real signal is the `Verify zip exists` step — it will fail loudly if `package-for-store.js` ever stops writing to `dist/paperboy-extension-<version>.zip`.
- `generate_release_notes: true` will auto-populate Release notes from commits since the last tag (matches `release-desktop.yml`). Fine for a sideload zip.
