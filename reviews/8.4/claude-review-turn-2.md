# 8.4 — Review Turn 2 (Decision)

## Task Context
- Task id: 8.4
- Task title: Update release-cut skill for five tag types
- Phase: Phase 8 — Cross-cutting hardening
- Turn: 2 of 4
- Builder reply: `reviews/8.4/cursor-reply-turn-1.md`

## Findings

No findings. All consensus checklist items satisfied.

### Verification log (reviewer turn 2)

Independent reviewer verification, all commands run locally:

```bash
$ wc -l .claude/skills/release-cut/SKILL.md
# 204 lines (in the 130-220 target range)

$ head -5 .claude/skills/release-cut/SKILL.md
# ---
# name: release-cut
# description: Ship a release for ONE or more of the six paperboy packages...
# disable-model-invocation: true
# ---
# (YAML frontmatter intact, description updated for multi-package)

$ grep -E "v\*|cli-v|widget-v|ai-v|app-v|ext-v" .claude/skills/release-cut/SKILL.md | wc -l
# 19 (well above the ≥6 floor)

$ for name in paperboy-converter paperboy-cli paperboy-widget paperboy-ai paperboy-editor paperboy-ext; do
    grep -q "$name" .claude/skills/release-cut/SKILL.md && echo "ok: $name" || echo "MISSING: $name"
  done
# ok: paperboy-converter
# ok: paperboy-cli
# ok: paperboy-widget
# ok: paperboy-ai
# ok: paperboy-editor
# ok: paperboy-ext
# (All 6 packages present)

$ for wf in publish-paperboy-converter publish-paperboy.yml publish-paperboy-widget publish-paperboy-ai release-desktop release-ext; do
    grep -q "$wf" .claude/skills/release-cut/SKILL.md && echo "ok: $wf" || echo "MISSING: $wf"
  done
# ok: publish-paperboy-converter
# ok: publish-paperboy.yml
# ok: publish-paperboy-widget
# ok: publish-paperboy-ai
# ok: release-desktop
# ok: release-ext
# (All 6 workflow filenames present)

$ grep -ciE "ask the user|prompt|which package" .claude/skills/release-cut/SKILL.md
# 4 (prompt-the-user language present)

$ grep "id-token" .claude/skills/release-cut/SKILL.md
#   id-token: write          # required for OIDC — do not omit
# (Trusted Publisher recipe present)

$ git diff .github/workflows/ paperboy-converter/package.json paperboy-cli/package.json paperboy-widget/package.json paperboy-ai/package.json paperboy-app/package.json paperboy-ext/package.json
# (empty — no out-of-scope edits)

$ git status --short | grep -v reviews | grep -v paperboy-spec-tasks.json | grep -v paperboy-review-queue
#  M .claude/settings.json   (unrelated; out of scope, leave uncommitted)
#  M .claude/skills/release-cut/SKILL.md
# (Only the one in-scope file changed)
```

Validation: all commands exit 0 with expected outputs.

### Inspection of the rewritten skill

Key structural matches:
- 11-step flow (Step 1 through Step 11) as contracted, plus an "npm Trusted Publisher recipe" appendix.
- Step 1 prompts user for which package(s) AND version; multi-select supported; defaults to next patch.
- Step 3 differentiates converter (workspace-wide bump via `bump-version.mjs`) from other packages (single-package edit).
- Step 4 enumerates explicit `npm --workspace=<pkg> run build` AND `test` commands for the 4 npm packages, plus build for app and ext.
- Step 8 tag table covers all 6 prefixes (v / cli-v / widget-v / ai-v / app-v / ext-v) with copy-paste commands.
- Step 9 has six `gh run watch` examples — one per workflow.
- Step 10 differentiates verification by target (npm view / GH Release / Chrome Web Store).
- "What NOT to do" section retained AND extended with the "don't push two related tags at once" warning and "don't tag a non-converter package as v*" warning.

The skill also calls out, in the second sentence, that the spec mentioned 5 tag types but `paperboy-ai` was added later (commit `81b4570`), so the reality is 6 — exactly the disclosure the contract required.

## Builder Prompt

No further builder action. Closing 8.4 as `review_passed`.

## Consensus Checklist (final, all checked)
- [x] `.claude/skills/release-cut/SKILL.md` rewritten (single-file edit, 204 lines)
- [x] YAML frontmatter preserved (name, description, disable-model-invocation: true)
- [x] Description mentions multi-package + prompt-for-choice
- [x] All 6 tag prefixes documented: `v`, `cli-v`, `widget-v`, `ai-v`, `app-v`, `ext-v` (19 mentions total)
- [x] All 6 packages named: paperboy-converter, paperboy-cli, paperboy-widget, paperboy-ai, paperboy-editor (app), paperboy-ext
- [x] All 6 workflow filenames mentioned: publish-paperboy-converter.yml, publish-paperboy.yml, publish-paperboy-widget.yml, publish-paperboy-ai.yml, release-desktop.yml, release-ext.yml
- [x] Step 1 asks user which package(s) AND version (multi-select supported)
- [x] Step 3 explains converter-wide bump vs single-package bump pathway
- [x] Step 4 includes build + test for every released package
- [x] Step 6 explains site-repo sync is converter-only
- [x] Step 8 tag table covers all 6 prefixes
- [x] Step 9 `gh run watch` examples for every workflow
- [x] Step 10 verification differs by output target (npm view / GH Release / Chrome Web Store)
- [x] npm Trusted Publisher reminder included (`id-token: write`, "DO NOT set registry-url", "no NPM_TOKEN")
- [x] "What NOT to do" section retained + extended (don't tag with wrong prefix; don't push two related tags simultaneously)
- [x] No edits outside `.claude/skills/release-cut/SKILL.md` (workflows, package.json, src untouched)
- [x] File length 204 lines (within 130-220 target)

## Decision

**review_passed.** 8.4 closes Phase 8 task #4 of 5. The release-cut skill now correctly covers ALL 6 active release workflows (the spec mentioned 5; `paperboy-ai` was extracted after the spec was authored, and the skill discloses this in its preamble). The skill prompts the user for which package(s) to ship, maps each choice to the right tag prefix and workflow, and walks through bump → build → test → commit → push → tag → watch → verify per package.

## Notes
- The skill is a model-invoked SKILL.md (no script, no tests) — the validation is structural (every package/tag/workflow mentioned), and all 6 grep checks pass.
- The skill makes the right ordering call: when releasing multiple packages, do converter FIRST (so consumer builds can pick up the new converter from npm), then ai/cli/widget, then app/ext.
- The skill explicitly warns against `v<version>` for non-converter releases (a real footgun — every workflow's tag filter would silently route the tag to the converter workflow).
- After 8.4 closes, activator picks 8.5 (CHANGELOG.md per package) — the FINAL Phase 8 task.
