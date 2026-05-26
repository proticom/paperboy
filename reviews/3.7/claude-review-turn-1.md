# 3.7 - Review Turn 1

## Task Context
- Task id: 3.7
- Task title: Switch site from vendored tarball to registry converter
- Dashboard implementation status: in_progress (review just started; on-disk state is "not started")
- Review status: in_review → waiting_for_builder
- Spec sections: plan item **3.7** — "Switch site from vendored tarball to registry converter".
  Unblocked because `@proticom/paperboy-converter@0.2.2` is live on npm (3.4 closed). The site can
  now consume the converter from the registry instead of vendoring a `.tgz`.
- Files inspected:
  - `paperboy-site/package.json` L17 — `"@proticom/paperboy-converter": "file:proticom-paperboy-converter-0.2.2.tgz"`.
  - `paperboy-site/` root — has TWO stale tarballs on disk:
    - `proticom-paperboy-converter-0.2.1.tgz` (11 463 bytes, May 16)
    - `proticom-paperboy-converter-0.2.2.tgz` (11 473 bytes, May 25)
  - `paperboy-site/package-lock.json` L13 + L1441 — both reference `file:proticom-paperboy-converter-0.2.2.tgz`.
  - `paperboy-converter/scripts/sync-all.mjs` — **this** is the script that vendors the .tgz into
    paperboy-site (`npm pack` → copy → rewrite `package.json` dep to `file:<tgz>` → `npm install`).
    Steps 2-5 are obsolete once the site consumes from npm; only step 1 (build) stays useful.
  - `.claude/skills/bump-version/SKILL.md` L11 + L31-35 + L50 — documents "sync the converter
    tarball into paperboy-site" as a step in the bump flow; needs to be flipped to "site consumes
    converter from npm; no vendoring step".
  - `.claude/skills/release-cut/SKILL.md` L3 + L39 + L47 + L79 — references vendoring the tarball
    into paperboy-site and committing the new `.tgz` + lockfile to the site repo; needs the
    tarball-commit step removed (the site now picks up the new version via `npm install`).
  - `.claude/skills/sync-widget/SKILL.md` — **widget-only**; does NOT reference the converter
    tarball. The task description's "update sync-widget skill" is a misnomer — the real
    tarball-emitting plumbing is `bump-version`, `release-cut`, and
    `paperboy-converter/scripts/sync-all.mjs`. Builder should leave `sync-widget` alone.
  - `paperboy-site/.gitignore` (not inspected; check that `*.tgz` is not actively excluded — the
    `0.2.1.tgz` and `0.2.2.tgz` are currently tracked).
- Commands run:
  - `ls -la paperboy-site | grep tgz` → two stale tarballs present.
  - `grep -n "converter" paperboy-site/package.json` → `file:proticom-paperboy-converter-0.2.2.tgz`.
  - `grep -n "proticom-paperboy-converter" paperboy-site/package-lock.json` → 2 hits, both
    `file:proticom-paperboy-converter-0.2.2.tgz`.
  - `npm view @proticom/paperboy-converter@0.2.2 version` → confirms 0.2.2 is live on npm
    (verified earlier in 3.4; M063 release notes confirm trusted-publisher OIDC ran).
  - `npx tsc --noEmit` in `paperboy-site/` → exit 0 (baseline is green).
- Current claim being verified: none — this is the initial review (turn 1 fresh).
- Result: NOT started. The site still vendors the .tgz; the .tgz files are still on disk; the
  bump/release skills + `sync-all.mjs` script still assume vendoring.

## Findings

### Finding 1: Site `package.json` still points at the vendored tarball
- Severity: blocker (this is the entire 3.7 deliverable)
- Location: `paperboy-site/package.json` L17.
- Problem: `dependencies."@proticom/paperboy-converter"` is `file:proticom-paperboy-converter-0.2.2.tgz`.
  Once `0.2.2` is live on npm, the site should consume from the registry so it gets future patch
  releases (`^0.2.2`) without a manual vendor step. This is the spec.
- Spec mismatch / risk: vendoring forces every converter bump to mutate the site repo (extra commit
  in a separate Git remote); a registry pin means `npm install` in CI/local picks up `0.2.x` patches
  automatically.
- Required fix: change to `"@proticom/paperboy-converter": "^0.2.2"` and regenerate
  `package-lock.json` (run `npm install --legacy-peer-deps` in `paperboy-site/`). The new lockfile
  entry should resolve to the registry URL, not `file:`.
- Code sample / exact change:
```jsonc
// paperboy-site/package.json — dependencies
"@proticom/paperboy-converter": "^0.2.2",
```
- Validation:
```bash
grep '"@proticom/paperboy-converter"' paperboy-site/package.json
# expect:    "@proticom/paperboy-converter": "^0.2.2",
grep '"resolved":.*paperboy-converter' paperboy-site/package-lock.json | head -3
# expect: registry URL (https://registry.npmjs.org/@proticom/paperboy-converter/-/...),
#         NOT "file:proticom-paperboy-converter-...tgz"
```

### Finding 2: Stale `.tgz` files still on disk in `paperboy-site/`
- Severity: blocker
- Location: `paperboy-site/proticom-paperboy-converter-0.2.1.tgz` (11 463 B) and
  `paperboy-site/proticom-paperboy-converter-0.2.2.tgz` (11 473 B).
- Problem: both vendored tarballs are tracked in Git and reside in the site root. After moving to a
  registry dep they're unused dead weight. The 0.2.1 file is doubly stale (the previous lockfile
  hasn't referenced 0.2.1 since `f3d5d8f` site-widget changes).
- Spec mismatch / risk: leaving the .tgz behind invites accidental re-pin (someone runs `npm install`
  against an old branch) and bloats the site repo.
- Required fix: `git rm proticom-paperboy-converter-0.2.1.tgz proticom-paperboy-converter-0.2.2.tgz`
  in `paperboy-site/`. Do NOT delete `proticom-ui-0.1.0.tgz` — that's a separate, still-vendored
  dependency (`@proticom/ui`) governed by a different release flow (out of scope for 3.7).
- Code sample / exact change:
```bash
cd paperboy-site
git rm proticom-paperboy-converter-0.2.1.tgz proticom-paperboy-converter-0.2.2.tgz
```
- Validation:
```bash
ls paperboy-site/*.tgz
# expect only: paperboy-site/proticom-ui-0.1.0.tgz
git -C paperboy-site status --short | grep '\.tgz'
# expect: D proticom-paperboy-converter-0.2.1.tgz
#         D proticom-paperboy-converter-0.2.2.tgz
```

### Finding 3: `paperboy-converter/scripts/sync-all.mjs` still vendors the .tgz into the site
- Severity: required
- Location: `paperboy-converter/scripts/sync-all.mjs` — steps 2 (pack), 3 (copy into site), 4
  (rewrite site `package.json` to `file:<tgz>`), 5 (`npm install` in site).
- Problem: this script is invoked by both the `bump-version` and `release-cut` flows. After 3.7
  closes, vendoring is wrong: the site consumes the converter from npm, so the script must not
  generate a new .tgz in the site root or rewrite the site's `package.json` to `file:`.
- Spec mismatch / risk: the next release would re-create a tarball in `paperboy-site/`, re-pin the
  site to `file:`, and silently undo this task.
- Required fix: rewrite `sync-all.mjs` to a no-op for the site step. Two clean options:

  **Option A (preferred — simpler).** Reduce the script to "build the workspace converter; print a
  note that workspaces + site already pick up the new version via `npm install`/`npm publish`".
  Drop steps 2-5. Update the bump-version SKILL.md and release-cut SKILL.md to match.

  **Option B.** Keep `npm pack` for sanity (still useful as a publish dry-run) but stop copying
  into the site and stop rewriting the site `package.json`. Delete the freshly-built tarball after
  `npm pack` succeeds, or move it under `paperboy-converter/.tarballs/` (gitignored).

- Code sample / exact change (Option A skeleton):
```js
// paperboy-converter/scripts/sync-all.mjs (simplified)
async function main() {
  console.log("1/1 Building shared converter package...");
  run("npm", ["run", "build"], converterDir);
  console.log("Build complete. Site now consumes @proticom/paperboy-converter from npm; no vendor step.");
}
```
- Validation:
```bash
node paperboy-converter/scripts/sync-all.mjs
# expect: build succeeds; no .tgz written under paperboy-site/; no rewrite of
#         paperboy-site/package.json
ls paperboy-site/*.tgz | grep -v proticom-ui
# expect: empty (no converter tarball)
git -C paperboy-site status --short
# expect: clean (sync-all did not touch the site)
```

### Finding 4: `bump-version` and `release-cut` skills still describe the vendor step
- Severity: required
- Location:
  - `.claude/skills/bump-version/SKILL.md` L11, L31-35, L50.
  - `.claude/skills/release-cut/SKILL.md` L3, L39, L47, L79.
  - Mirror copies under `.agents/skills/bump-version/` and `.agents/skills/release-cut/` (the project
    keeps `.agents/` and `.claude/skills/` in sync — update both, or symlink one to the other).
- Problem: these skills are the runbook for cutting a release. They still say "sync the converter
  tarball into paperboy-site", "commit the new .tgz to the site repo", and `git -C paperboy-site
  add proticom-paperboy-converter-<version>.tgz package.json package-lock.json`. After 3.7, those
  steps are wrong.
- Spec mismatch / risk: a future release would follow the obsolete runbook and re-vendor the .tgz.
- Required fix: rewrite the affected sections to "site consumes converter from npm — no vendor or
  site-commit step needed". In `release-cut`, drop the `paperboy-site` git add for the tarball;
  keep any unrelated site-commit logic (none currently, but document the change). In `bump-version`,
  drop the "Sync the converter tarball into paperboy-site" subsection entirely and explain that the
  site picks up the new converter on its next `npm install` against the registry.
- Code sample / exact change: prose edits — the gist is to replace every "tarball into
  paperboy-site" sentence with "the site consumes the converter from npm; no vendor step." Builder
  should make the wording match the new `sync-all.mjs` from Finding 3.
- Validation:
```bash
grep -n "tgz\|tarball" .claude/skills/bump-version/SKILL.md .claude/skills/release-cut/SKILL.md \
                       .agents/skills/bump-version/SKILL.md .agents/skills/release-cut/SKILL.md
# expect: zero hits about vendoring the converter tarball into paperboy-site
grep -rn "paperboy-converter-.*\.tgz\|file:proticom-paperboy-converter" \
        .claude/skills/ .agents/skills/ paperboy-converter/scripts/
# expect: zero hits
```

### Finding 5: Confirm site build + typecheck stay green after the swap
- Severity: required
- Location: site repo (`paperboy-site/`).
- Problem: registry resolution should produce an identical install footprint, but we need to prove
  it before pushing.
- Required fix: after Findings 1-2, run `npm install --legacy-peer-deps` in `paperboy-site/` to
  regenerate the lockfile, then `npx tsc --noEmit` and `npm run build`.
- Validation:
```bash
cd paperboy-site
npm install --legacy-peer-deps                          # exit 0
npx tsc --noEmit                                        # exit 0
npm run build                                           # exit 0
grep '"resolved":' package-lock.json | grep paperboy-converter | head -1
# expect: a registry URL, not file:
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: switch `paperboy-site` from the vendored `proticom-paperboy-converter-*.tgz` to the
published `@proticom/paperboy-converter@^0.2.2` on npm, delete both stale converter tarballs from
the site repo, and update the release plumbing (`paperboy-converter/scripts/sync-all.mjs`,
`bump-version` skill, `release-cut` skill) so future releases stop vendoring the tarball.

Files to edit:
- `paperboy-site/package.json` — change L17 to `"@proticom/paperboy-converter": "^0.2.2"`.
- `paperboy-site/package-lock.json` — regenerated by `npm install --legacy-peer-deps` in the site
  repo. Do not hand-edit; let npm produce a registry-resolved entry.
- `paperboy-converter/scripts/sync-all.mjs` — replace steps 2-5 (pack/copy/rewrite/install) with a
  no-op or a clear "site consumes from npm" message. See Finding 3 Option A skeleton.
- `.claude/skills/bump-version/SKILL.md` and `.agents/skills/bump-version/SKILL.md` — drop the
  "Sync the converter tarball into paperboy-site" subsection and any mention of `file:` /
  `proticom-paperboy-converter-<version>.tgz` in the site.
- `.claude/skills/release-cut/SKILL.md` and `.agents/skills/release-cut/SKILL.md` — drop the
  `git -C paperboy-site add proticom-paperboy-converter-<version>.tgz ...` step and any prose that
  describes vendoring the tarball into the site.

Files to delete (in `paperboy-site/`):
- `proticom-paperboy-converter-0.2.1.tgz`
- `proticom-paperboy-converter-0.2.2.tgz`

Do NOT delete `paperboy-site/proticom-ui-0.1.0.tgz` — `@proticom/ui` is a separate vendored dep,
out of scope for 3.7.

Files not to edit:
- `.claude/skills/sync-widget/SKILL.md` and `.agents/skills/sync-widget/SKILL.md` — the task
  description mentions "sync-widget" but that skill is widget-only and does NOT reference the
  converter tarball. Leave it.
- `paperboy-converter/package.json` — no version bump; this task ships against 0.2.2 (already live).
- The monorepo's other workspace consumers (CLI, app, widget, extension) already consume the
  converter via npm workspaces — they need no changes.
- The site's other dependencies and their lockfile entries — only the
  `@proticom/paperboy-converter` resolution should change.

Exact changes: see Findings 1-4 code samples.

Data shapes / CLI examples:
- New `package.json` dep value: `"@proticom/paperboy-converter": "^0.2.2"` (semver caret, registry).
- New `package-lock.json` resolution shape:
  `"resolved": "https://registry.npmjs.org/@proticom/paperboy-converter/-/paperboy-converter-0.2.2.tgz"`
  with an `integrity` sha512 — produced by npm, do not hand-craft.

Tests to add or update:
- No unit-test changes required.
- Validation (capture exit codes):
```bash
# In monorepo root (/Users/edward/MSDev/projects/paperboy):
cd paperboy-site
git rm proticom-paperboy-converter-0.2.1.tgz proticom-paperboy-converter-0.2.2.tgz
# Edit package.json dep to "^0.2.2"
npm install --legacy-peer-deps                                                # exit 0
npx tsc --noEmit                                                              # exit 0
npm run build                                                                 # exit 0
grep '"@proticom/paperboy-converter"' package.json                            # ^0.2.2 (no file:)
grep '"resolved":' package-lock.json | grep paperboy-converter | head -1      # registry URL, not file:
ls *.tgz                                                                      # only proticom-ui-0.1.0.tgz
cd ..

# Re-run sync-all to confirm it no longer touches the site:
node paperboy-converter/scripts/sync-all.mjs                                  # exit 0; no site mutation
git -C paperboy-site status --short                                           # clean
ls paperboy-site/*.tgz                                                        # only proticom-ui-0.1.0.tgz

# Confirm skill docs are clean:
grep -n "tgz\|tarball" .claude/skills/bump-version/SKILL.md .claude/skills/release-cut/SKILL.md \
                       .agents/skills/bump-version/SKILL.md .agents/skills/release-cut/SKILL.md
# expect: no hits about vendoring the converter tarball
grep -rn "file:proticom-paperboy-converter" .                                 # zero hits
```

Commands to run:
- See "Validation" block above.

Definition of done:
- `paperboy-site/package.json` declares `"@proticom/paperboy-converter": "^0.2.2"` (registry).
- `paperboy-site/package-lock.json` resolves the converter from `https://registry.npmjs.org/...`,
  not `file:`.
- Both `proticom-paperboy-converter-*.tgz` are removed from the site repo (only `proticom-ui-0.1.0.tgz`
  remains).
- `paperboy-converter/scripts/sync-all.mjs` no longer copies a tarball into the site or rewrites
  the site `package.json` — it builds the converter and exits.
- `bump-version` and `release-cut` skill docs (both `.claude/skills/` and `.agents/skills/` copies)
  no longer reference vendoring the converter tarball into the site.
- `paperboy-site` `npx tsc --noEmit` and `npm run build` exit 0.
- Re-running `node paperboy-converter/scripts/sync-all.mjs` leaves `paperboy-site/` clean.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Sync-all.mjs simplification: Option A (drop steps 2-5 entirely) or Option B (keep `npm pack` as
  a publish dry-run, drop only the site-vendoring tail)? Reviewer recommends Option A — the
  workspace already runs `npm pack --dry-run` in CI; an unused tarball on disk is dead weight.
  Builder may pick either; state your choice.
- Two parallel skill trees (`.claude/skills/` and `.agents/skills/`): the project keeps both in
  sync. If one is a symlink to the other (check `ls -la .agents/skills/bump-version`), edit only
  the source and re-verify. Otherwise edit both. State which you found.

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
Blocker: site still vendors `file:proticom-paperboy-converter-0.2.2.tgz`. Builder: swap to `^0.2.2` registry, `git rm` both stale `.tgz`s (0.2.1 + 0.2.2; keep proticom-ui), regenerate lockfile, then strip the vendoring tail from `paperboy-converter/scripts/sync-all.mjs` + `bump-version`/`release-cut` skill docs (both `.claude/skills/` and `.agents/skills/` copies). `sync-widget` skill is NOT in scope — it's widget-only. Validation: registry URL in lockfile, no `file:` for converter, no converter `.tgz` in site, site build + tsc green.
