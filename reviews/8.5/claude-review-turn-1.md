# 8.5 — Review Turn 1

## Task Context
- Task id: 8.5
- Task title: Add CHANGELOG.md files to each package
- Phase: Phase 8 — Cross-cutting hardening (FINAL task)
- Turn: 1 of 4
- Spec section (`/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md` line 161):
  > "**8.5** Add CHANGELOG.md files to each package; generate entries from commit messages at release time."

- Related context (verified by reviewer):
  - Working tree: monorepo, branch `main`, commit `bdd960a`. 8.1/8.2/8.3/8.4 just landed.
  - Existing CHANGELOGs: **none** anywhere in the repo (verified by `find . -maxdepth 3 -name "CHANGELOG*" -not -path "*/node_modules/*"` returns empty).
  - Current package versions: converter 0.2.2, cli 0.2.6, widget 0.2.2, ai 0.2.2, app (paperboy-editor) 0.2.2, ext 0.2.2.
  - Key release commits visible in git log:
    - `5e2282d feat(converter): heading anchors, better tables, OCR injection (v0.1.2)`
    - `3d0bf2b chore: align all packages to v0.2.0 (Phase 1 wrap)`
    - `48a0634 release: v0.2.2` (most-recent multi-package bump)
    - `81b4570 feat: extract paperboy-ai, wire app AI, and fix npm publish CI` (paperboy-ai birth)
    - `14cea4b chore: convert to npm workspaces; converter symlinked across consumers`
    - `cbd7390 feat(ext): multi-region picker, auto-scroll, content heuristic, prefs (v0.2.1)`
    - `8f6bdb5 release: pin CLI registry deps and add paperboy-ai publish workflow`
  - The spec's parent-message lists 5 packages explicitly: `paperboy-converter`, `paperboy-cli`, `paperboy-app`, `paperboy-ext`, `paperboy-widget`. `paperboy-ai` did not yet exist when the spec was authored; we should ADD `paperboy-ai/CHANGELOG.md` for consistency (same reasoning as 8.4 — it's a published npm package now, should have a changelog).
  - **No CI-side automation is required by this task.** The spec line says "generate entries from commit messages at release time" — that wording is about the future workflow, not a workflow to ship in 8.5. The deliverable is the 6 CHANGELOG.md files seeded with the existing 0.1.x → 0.2.x history.
  - **Format:** Keep a Changelog 1.1.0 + Semantic Versioning. This is the standard adopted across the npm ecosystem (and is what `paperboy-site` would reflect if it had one).

- Files inspected:
  - All 6 package `package.json` files (versions captured above).
  - `git log --oneline --all -- <pkg>/` for each of the 6 packages.

- Files NOT to touch:
  - Any `package.json` (no version bumps inside this task).
  - Any source code (`paperboy-*/src/`, `paperboy-*/dist/`).
  - Any workflow (`.github/workflows/`).
  - `paperboy-site/` (separate repo; the task is monorepo-only).
  - `paperboy-spec-tasks.json` / `reviews/` (orchestrator-managed).
- Current claim: 8.5 turn 1, queue activator picked it after 8.4 closed. Fresh task.

## Findings

### Finding 1 (REQUIRED): Create six CHANGELOG.md files (one per published/release package) following Keep a Changelog 1.1.0

- Severity: required (the entire body of work for 8.5)
- Location:
  - **New files (6):**
    1. `paperboy-converter/CHANGELOG.md`
    2. `paperboy-cli/CHANGELOG.md`
    3. `paperboy-widget/CHANGELOG.md`
    4. `paperboy-ai/CHANGELOG.md` (added to the spec's 5-package list; same rationale as 8.4)
    5. `paperboy-app/CHANGELOG.md`
    6. `paperboy-ext/CHANGELOG.md`
  - **No edits** to `package.json`, `src/`, workflows, or other files.

- Problem (current state): No CHANGELOG.md anywhere. End users installing from npm have no quick way to see what changed between versions. Internal contributors have to grep git log to find when a feature landed.

- Required fix: create each of the six CHANGELOG.md files with:

  1. **Header** (exact):
     ```markdown
     # Changelog

     All notable changes to this package will be documented in this file.

     The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
     and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
     ```

  2. **Per-version sections** (newest first), each starting `## [X.Y.Z] - YYYY-MM-DD`, with Keep-a-Changelog category subsections (`### Added`, `### Changed`, `### Fixed`, `### Removed`, `### Deprecated`, `### Security` — include ONLY the categories that have entries). Entries should be terse one-liners. Source commits to mine for each entry can be referenced parenthetically by short SHA where it materially helps a future reader, but this is NOT required for every entry.

  3. **Required versions per package** (current version on top; earlier history below):

     - **paperboy-converter** — 0.2.2 (current), 0.2.1, 0.2.0, 0.1.2 (the converter's first multi-feature release per commit `5e2282d feat(converter): heading anchors, better tables, OCR injection (v0.1.2)`), 0.1.1, 0.1.0. Entries should reference: heading anchors, better tables, OCR injection (0.1.2 feat); the npm workspaces conversion that symlinked the converter across consumers (commit `14cea4b`); the 0.2.0 alignment (commit `3d0bf2b`); and any docx/pdf/epub/xlsx test coverage gained in 0.2.2 from 8.1 (commit `b86b45f`).

     - **paperboy-cli** — 0.2.6 (current), 0.2.5, 0.2.4, 0.2.3, 0.2.2, 0.2.1, 0.2.0, 0.1.x (collapse to one "0.1.0" entry: "Initial CLI release"). Entries should reference: doctor crawl-readiness + crawl command + OCR injection (commit `d4e484d`); expanded AI providers (OpenAI/Anthropic/xAI + Windows keychain, commit `1e673db`); paperboy-ai extraction (commit `81b4570`); and the 8.2 crawl test coverage in the current 0.2.6 (commit `a49eb70`). The patch versions between 0.2.0 and 0.2.6 absorbed CI fixes (`38f920b`, `ee64044`, `8f6bdb5`, `dd5f410`) — collapse these into one "0.2.3–0.2.6" combined entry if that reads better; the goal is readability, not commit-by-commit faithfulness.

     - **paperboy-widget** — 0.2.2 (current), 0.2.1, 0.2.0, 0.1.0. Entries should reference: paper-aesthetic redesign + inline render mode + theming knobs (commit `fad60bf`); `data-toggle-mount-target` (commit `f3d5d8f`); pill anchor + flex layout (`0748270`); masthead toggle / compact / collapse opt-in (`8ef3480`); jsdom integration tests in 0.2.2 (commit `e96536a`).

     - **paperboy-ai** — 0.2.2 (current), 0.2.1, 0.2.0 (the package's birth — commit `81b4570 feat: extract paperboy-ai, wire app AI, and fix npm publish CI`). 0.1.x does NOT exist for this package. Entries should be brief; the package is young.

     - **paperboy-app** (`paperboy-editor` internal name) — 0.2.2 (current), 0.2.1, 0.2.0, 0.1.0. Entries should reference: tauri-plugin-dialog 2.7 bump + rebuilt bundled converter (`396ae5f`); macOS file association handling (`089fd16`, `6ba9b96`); status bar (4.11), export submenu (4.10), unused headingId action fix (4.12), desktop smoke tests (4.13); 5.x phase work: macOS signing/notarization (5.2), Linux maintainer + AppImage/deb (5.4), tauri-plugin-updater + latest.json (5.5), missing platform icon sizes (5.7). 8.1's docx handler fix that the app vendors is part of the current 0.2.2 (`b86b45f`).

     - **paperboy-ext** — 0.2.2 (current), 0.2.1, 0.2.0, 0.1.0. Entries should reference: MV3 modernization + side panel preview toggle (`c1ec340`); region picker + chrome-aware extraction + OCR toggle (`196aa64`); restored host_permissions + skip Readability for chat sites (`d52dbdc`); tesseract core bundling for MV3 + friendlier policy errors (`d39c070`); multi-region picker + auto-scroll + content heuristic + prefs (`cbd7390`); split Copy button with chevron menu + Download .md (`5b5fa90`); in-window drag-and-drop import (4.6, `07b4551`); homepage_url in manifest (6.2, `dac16ad`); ext README cleanup (6.1, `782dae4`).

  4. **Footer / link reference section** (optional but recommended):
     - At the bottom of each file, link references to git compares: `[0.2.2]: https://github.com/proticom/paperboy/compare/<pkg>-v0.2.1...<pkg>-v0.2.2` etc. For the converter, the tag is just `vX.Y.Z` (no prefix). Builder may skip this footer if it's too tedious for the older versions whose tags don't exist yet — but it should at least be present for the CURRENT version of each package.

  5. **Style rules**:
     - One-line entries, leading verb (Added/Fixed/Changed reads naturally).
     - Never fabricate features. If the commit log doesn't support a claim, leave it out.
     - Don't include cleanup-only commits (e.g. `cleanup: paperboy-converter (skill) — drop orphaned reflowPdfPageText tests`) unless they have observable impact for an end user.
     - Don't include workspace-mechanical commits (`14cea4b chore: convert to npm workspaces`) unless they actually changed something a downstream consumer would notice.
     - "Internal" / build / CI changes can go under `### Changed` if relevant, or be omitted.
     - Use past tense for entries ("Added support for…" not "Add support for…") — Keep a Changelog convention.

- Builder rules:
  - **6 new files** in 6 package directories. NO edits elsewhere.
  - No `package.json` changes. No source changes. No workflow changes.
  - Each file MUST start with the exact header in step 1 above (verbatim) to keep them grep-friendly.
  - Each file MUST have at least one entry under at least one Keep-a-Changelog subsection per version listed.
  - Entries should be SHORT — one sentence, no more. Long-form context belongs in commit messages, not changelogs.
  - File length budget per CHANGELOG: 40–120 lines. Outliers OK if the package's history justifies it (cli + ext have more history than ai).
  - Builder may rely on `git log --oneline -- <pkg>/` to mine entries; do NOT invent.
  - Builder should explicitly call out in the reply that `paperboy-ai` was ADDED to the spec's 5-package list (same justification as 8.4: it's a published npm package now).

- Validation:

  ```bash
  cd /Users/edward/MSDev/projects/paperboy

  # 1. All 6 CHANGELOG.md files exist
  ls paperboy-converter/CHANGELOG.md paperboy-cli/CHANGELOG.md paperboy-widget/CHANGELOG.md paperboy-ai/CHANGELOG.md paperboy-app/CHANGELOG.md paperboy-ext/CHANGELOG.md
  # expect: 6 paths printed

  # 2. Each file has the exact Keep-a-Changelog header
  for f in paperboy-converter/CHANGELOG.md paperboy-cli/CHANGELOG.md paperboy-widget/CHANGELOG.md paperboy-ai/CHANGELOG.md paperboy-app/CHANGELOG.md paperboy-ext/CHANGELOG.md; do
    grep -q "Keep a Changelog 1.1.0" "$f" && echo "ok: $f" || echo "MISSING header: $f"
  done
  # expect: 6 "ok:" lines

  # 3. Each file has the current version section
  grep -l "## \[0.2.2\]" paperboy-converter/CHANGELOG.md paperboy-widget/CHANGELOG.md paperboy-ai/CHANGELOG.md paperboy-app/CHANGELOG.md paperboy-ext/CHANGELOG.md | wc -l
  # expect: 5 (CLI is on 0.2.6 so it has [0.2.6] instead)

  grep -q "## \[0.2.6\]" paperboy-cli/CHANGELOG.md && echo "ok: cli 0.2.6"
  # expect: ok: cli 0.2.6

  # 4. No package.json edits
  git diff paperboy-converter/package.json paperboy-cli/package.json paperboy-widget/package.json paperboy-ai/package.json paperboy-app/package.json paperboy-ext/package.json
  # expect: empty

  # 5. No src/ or workflow edits
  git diff paperboy-converter/src/ paperboy-cli/src/ paperboy-widget/src/ paperboy-ai/src/ paperboy-app/src/ paperboy-ext/src/ .github/workflows/
  # expect: empty

  # 6. File length sanity
  wc -l paperboy-*/CHANGELOG.md
  # expect: each between ~30 and ~150 lines; total <600 lines

  # 7. No fabricated stats / hype words
  grep -iE "fastest|best-in-class|revolutionary|99\.9%|enterprise-grade" paperboy-*/CHANGELOG.md
  # expect: no matches (changelogs are factual)

  # 8. No other workspace changes
  cd /Users/edward/MSDev/projects/paperboy && git status --short | grep -v reviews | grep -v paperboy-spec-tasks.json | grep -v paperboy-review-queue
  # expect: only the 6 new CHANGELOG.md files (and possibly the .claude/settings.json unrelated change)
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 8.5 (the FINAL Phase 8 task).

**Objective:** Seed CHANGELOG.md files for the 6 published/release packages with their 0.1.x → 0.2.x history mined from `git log`. Use [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) format. The spec line said "generate entries from commit messages at release time" — this task seeds the FIRST version of each file; future automation is out of scope.

**Files to create (6 total, all new):**

1. `paperboy-converter/CHANGELOG.md`
2. `paperboy-cli/CHANGELOG.md`
3. `paperboy-widget/CHANGELOG.md`
4. `paperboy-ai/CHANGELOG.md` (added to the spec's 5-package list because `paperboy-ai` is now a published npm package; same justification as 8.4)
5. `paperboy-app/CHANGELOG.md`
6. `paperboy-ext/CHANGELOG.md`

**Required version coverage per package:**

| Package | Versions to include | Notes |
|---------|---------------------|-------|
| converter | 0.2.2, 0.2.1, 0.2.0, 0.1.2, 0.1.1, 0.1.0 | 0.1.2 was the heading-anchors/better-tables/OCR release (commit `5e2282d`) |
| cli | 0.2.6, 0.2.5–0.2.3 (collapsible), 0.2.2, 0.2.1, 0.2.0, 0.1.0 | 0.2.3–0.2.6 absorbed CI fixes; collapse if it reads better |
| widget | 0.2.2, 0.2.1, 0.2.0, 0.1.0 | 0.2.2 includes the new jsdom integration tests from 8.3 |
| ai | 0.2.2, 0.2.1, 0.2.0 | Package birth was `81b4570`; no 0.1.x history |
| app | 0.2.2, 0.2.1, 0.2.0, 0.1.0 | Lots of 4.x and 5.x phase work landed here |
| ext | 0.2.2, 0.2.1, 0.2.0, 0.1.0 | MV3, region picker, tesseract bundling, multi-region, in-window DnD |

**Do not edit:**
- Any `package.json`.
- Any source code.
- Any `.github/workflows/` file.
- Any other monorepo file.
- `paperboy-site/`.

**Style:**
- Past-tense one-line entries.
- Keep-a-Changelog category subsections (`### Added`, `### Changed`, `### Fixed`, `### Removed`, `### Deprecated`, `### Security`).
- Include ONLY subsections that have entries.
- Reference commits parenthetically with short SHA only where it materially helps a future reader.
- DO NOT fabricate features. If the git log doesn't support it, leave it out.
- DO NOT include cleanup / CI-mechanical commits unless they have observable end-user impact.

**Validate (run from project root, paste outputs into the reply):**

```bash
cd /Users/edward/MSDev/projects/paperboy

# 1. All 6 CHANGELOG.md files exist
ls paperboy-converter/CHANGELOG.md paperboy-cli/CHANGELOG.md paperboy-widget/CHANGELOG.md paperboy-ai/CHANGELOG.md paperboy-app/CHANGELOG.md paperboy-ext/CHANGELOG.md

# 2. Keep-a-Changelog 1.1.0 header in each
for f in paperboy-converter/CHANGELOG.md paperboy-cli/CHANGELOG.md paperboy-widget/CHANGELOG.md paperboy-ai/CHANGELOG.md paperboy-app/CHANGELOG.md paperboy-ext/CHANGELOG.md; do
  grep -q "Keep a Changelog 1.1.0" "$f" && echo "ok: $f" || echo "MISSING: $f"
done

# 3. Current versions documented
grep -l "## \[0.2.2\]" paperboy-converter/CHANGELOG.md paperboy-widget/CHANGELOG.md paperboy-ai/CHANGELOG.md paperboy-app/CHANGELOG.md paperboy-ext/CHANGELOG.md | wc -l
grep -q "## \[0.2.6\]" paperboy-cli/CHANGELOG.md && echo "ok: cli 0.2.6"

# 4. No out-of-scope edits
git diff paperboy-converter/package.json paperboy-cli/package.json paperboy-widget/package.json paperboy-ai/package.json paperboy-app/package.json paperboy-ext/package.json

git diff paperboy-converter/src/ paperboy-cli/src/ paperboy-widget/src/ paperboy-ai/src/ paperboy-app/src/ paperboy-ext/src/ .github/workflows/

# 5. Per-file length sanity
wc -l paperboy-converter/CHANGELOG.md paperboy-cli/CHANGELOG.md paperboy-widget/CHANGELOG.md paperboy-ai/CHANGELOG.md paperboy-app/CHANGELOG.md paperboy-ext/CHANGELOG.md

# 6. No fabricated marketing language
grep -iE "fastest|best-in-class|revolutionary|99\.9%|enterprise-grade" paperboy-*/CHANGELOG.md
```

When you reply, write `reviews/8.5/cursor-reply-turn-1.md` with:
(a) the per-file line counts,
(b) one-sentence summary of each CHANGELOG's current-version entry,
(c) outputs of all validation commands above,
(d) confirmation that `paperboy-ai/CHANGELOG.md` is included (the spec only named 5).

## Consensus Checklist
- [ ] `paperboy-converter/CHANGELOG.md` exists
- [ ] `paperboy-cli/CHANGELOG.md` exists
- [ ] `paperboy-widget/CHANGELOG.md` exists
- [ ] `paperboy-ai/CHANGELOG.md` exists
- [ ] `paperboy-app/CHANGELOG.md` exists
- [ ] `paperboy-ext/CHANGELOG.md` exists
- [ ] Each file has the exact Keep-a-Changelog 1.1.0 + SemVer header
- [ ] Each file lists the package's CURRENT version at the top
- [ ] Each file includes pre-0.2.0 history where it exists (converter 0.1.2, cli/widget/app/ext 0.1.0; ai has no 0.1.x)
- [ ] Entries use Keep-a-Changelog category subsections (Added/Changed/Fixed/Removed/Deprecated/Security)
- [ ] No `package.json` changes
- [ ] No source / workflow / other-file changes
- [ ] No marketing/hype language (`fastest`, `best-in-class`, `99.9%`, etc.)
- [ ] Per-file length is 30-150 lines (allow outliers for cli + ext)
- [ ] No fabricated features (every entry traces back to a real commit)
- [ ] Builder reply discloses paperboy-ai inclusion (the spec named only 5 packages)

## Decision

**send_to_builder.** Fresh task, no builder commit yet. Scope: 6 new CHANGELOG.md files seeded from git log, Keep-a-Changelog 1.1.0 format. The spec named 5 packages; `paperboy-ai` is added for the same reason as in 8.4 (it's a published npm package, born after the spec was authored). 16-item validation checklist.

## Notes
- Future automation (auto-generate entries from commit messages at tag time) is OUT OF SCOPE for 8.5. The deliverable is the FIRST version of each file. A follow-up task can add a release-time generator that appends an `## [Unreleased]` section.
- The spec named only 5 packages because `paperboy-ai` was extracted in commit `81b4570` after the plan was written. Same disclosure pattern as 8.4.
- The CLI's 0.2.3–0.2.6 versions absorbed CI fixes — collapse them into a single entry if it reads better, but DON'T just write "Various CI fixes" — name the specific fixes (workspace `*` restoration, registry pinning, etc.).
- 0.2.2 changelogs should mention the Phase 8 test additions where applicable: converter 0.2.2 — added docx/pdf/epub/xlsx tests + fixed docx browser-bundle handler bug; cli 0.2.6 — added crawl tests; widget 0.2.2 — added jsdom integration tests.
- After 8.5 closes, the entire 56-task production-readiness run is fully green (modulo the human-gated 5.3/5.8/5.9/6.4 operational tasks awaiting Edward).
