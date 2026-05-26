# 3.7 - Review Turn 2

## Task Context
- Task id: 3.7
- Task title: Switch site from vendored tarball to registry converter
- Dashboard implementation status: in_progress
- Review status before this turn: waiting_for_reviewer
- Builder reply: `reviews/3.7/cursor-reply-turn-1.md`
- Turn-1 contract: `reviews/3.7/claude-review-turn-1.md` (5 findings; all required/blocker)

## Findings

Re-verified each of the 5 turn-1 findings against the real repo state. All fixed.

### Finding 1 (was: site `package.json` still vendored) — FIXED
- Severity: blocker (was)
- Location: `paperboy-site/package.json` L17; `paperboy-site/package-lock.json` L1441.
- Resolution: dep is now `"^0.2.2"`; lockfile resolves from the npm registry. No `file:` references.
- Validation:
```bash
grep '"@proticom/paperboy-converter"' paperboy-site/package.json
# observed: "@proticom/paperboy-converter": "^0.2.2",
grep '"resolved":' paperboy-site/package-lock.json | grep paperboy-converter
# observed: "resolved": "https://registry.npmjs.org/@proticom/paperboy-converter/-/paperboy-converter-0.2.2.tgz"
```

### Finding 2 (was: stale `.tgz` files in site repo) — FIXED
- Severity: blocker (was)
- Location: `paperboy-site/*.tgz`.
- Resolution: both converter tarballs `git rm`-ed; `proticom-ui-0.1.0.tgz` correctly preserved.
- Validation:
```bash
git -C paperboy-site status --short | grep '\.tgz'
# observed: D  proticom-paperboy-converter-0.2.1.tgz
#           D  proticom-paperboy-converter-0.2.2.tgz
ls paperboy-site/*.tgz
# observed: paperboy-site/proticom-ui-0.1.0.tgz
```

### Finding 3 (was: `sync-all.mjs` still vendored) — FIXED (Option A)
- Severity: required (was)
- Location: `paperboy-converter/scripts/sync-all.mjs`.
- Resolution: script reduced to a build-only step; logs "site consumes from npm — no vendor step";
  no `npm pack`, no copy into the site, no rewrite of the site `package.json`, no site `npm install`.
- Validation:
```bash
node paperboy-converter/scripts/sync-all.mjs
# observed: exit 0; build runs, prints "no vendor step" message
git -C paperboy-site status --short
# observed: only the existing 3.7 deliverable diff; no new mutations from sync-all
```

### Finding 4 (was: `bump-version`/`release-cut` skill docs) — FIXED
- Severity: required (was)
- Location: `.claude/skills/{bump-version,release-cut}/SKILL.md` and `.agents/skills/{bump-version,release-cut}/SKILL.md` (verified as separate copies, not symlinks, via `ls -la`).
- Resolution: vendoring steps removed; only negative-guardrail mentions remain ("don't vendor a `.tgz` into paperboy-site").
- Validation:
```bash
grep -rn "file:proticom-paperboy-converter\|proticom-paperboy-converter-.*\.tgz" \
        .claude/skills/ .agents/skills/ paperboy-converter/scripts/
# observed: zero hits
grep -n "tgz\|tarball" \
        .claude/skills/bump-version/SKILL.md .claude/skills/release-cut/SKILL.md \
        .agents/skills/bump-version/SKILL.md .agents/skills/release-cut/SKILL.md
# observed: only negative guardrail wording (Don't vendor a converter `.tgz`...)
```

### Finding 5 (was: site build + tsc green) — FIXED
- Severity: required (was)
- Location: `paperboy-site/` + monorepo workspaces.
- Resolution: all gates green against the registry-resolved converter.
- Validation:
```bash
cd paperboy-site && npx tsc --noEmit                    # exit 0
cd paperboy-site && npm run build                       # exit 0 (18 static pages)
npm run build --workspaces --if-present                 # exit 0 (converter, ai, cli, ext, widget)
npm test --workspaces --if-present                      # exit 0 (cli 19 tests, widget 12 tests)
```
- Note: the macOS `objc[…] GNotificationCenterDelegate` warning during the site build is unrelated
  sharp/libvips vs. homebrew glib duplicate-symbol noise — pre-existing, not a regression.

### Note: incidental `.gitignore` change
- `M .gitignore` adds an entry for `.claude/worktrees/` (Claude Code sub-agent worktree directory).
- This is unrelated to 3.7's spec but is a benign housekeeping line that prevents future agent
  worktrees from polluting `git status`. It's safe to include in this commit. Not a blocker.

## Builder Prompt
No further builder work required. Task closes as `review_passed`.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — all 5 verified fixed
- [x] Every required finding has a validation command — all re-run with exit 0
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions: none. Builder chose Option A for `sync-all.mjs` (reviewer's recommendation).

## Decision
review_passed

## Notes (becomes the dashboard `--note`)
All 5 findings fixed. Site consumes `@proticom/paperboy-converter@^0.2.2` from npm (registry-resolved lockfile); both stale converter `.tgz` removed (`proticom-ui-0.1.0.tgz` correctly preserved); `sync-all.mjs` is Option A (build-only); `bump-version`+`release-cut` skill docs in both trees scrubbed of vendoring. Site `tsc` + `npm run build` green; monorepo `build --workspaces` + `test --workspaces` green.
