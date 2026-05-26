# 2.3 - Review Turn 1

## Task Context
- Task id: 2.3
- Task title: Add typecheck step to CI for converter, cli, and site
- Dashboard implementation status: todo (in spec) — verified NOT done
- Review status: in_review → waiting_for_builder
- Spec sections: Phase 2 item **2.3** (interacts with 2.4, which also targets "the site repo's CI")
- Files inspected:
  - `.github/workflows/ci.yml` (monorepo; no typecheck step)
  - `paperboy-converter/package.json`, `paperboy-cli/package.json`, `paperboy-widget/package.json`
  - `paperboy-site/package.json`, `paperboy-site/tsconfig.json`, `paperboy-site/package-lock.json`
- Commands run:
  - `jq '.scripts.typecheck' <each package.json>`
  - `grep -n "typecheck|tsc" .github/workflows/ci.yml` → none
  - `ls paperboy-site/.github/workflows` → none; `git rev-parse --show-toplevel` (site is its own repo)
- Current claim being verified: CI typechecks converter, cli, and the site.

## Findings

### Finding 1: no typecheck step in the monorepo CI
- Severity: required
- Location: `.github/workflows/ci.yml`
- Problem: ci.yml runs build + test but no typecheck. `paperboy-converter` and `paperboy-cli`
  both define `typecheck: tsc --noEmit -p tsconfig.json`; nothing runs them in CI.
- Spec mismatch / risk: type regressions (e.g. the BrandConfig issue caught manually in 1.6)
  can merge undetected.
- Required fix: add a workspace typecheck step.
- Code sample / exact change — insert after the "Install" step in `.github/workflows/ci.yml`:
```yaml
      - name: Typecheck workspaces
        run: npm run typecheck --workspaces --if-present
```
  (`--if-present` runs converter + cli; widget/app/ext have no typecheck and are skipped.)
- Validation:
```
grep -n "typecheck" .github/workflows/ci.yml
npm run typecheck --workspaces --if-present   # converter + cli, both tsc --noEmit, exit 0
```

### Finding 2: the site has no typecheck script and no CI at all
- Severity: required
- Location: `paperboy-site/package.json` (no `typecheck` script), `paperboy-site/.github/` (absent)
- Problem: `paperboy-site` is a **separate git repo** (its own `package-lock.json`, toplevel at
  `paperboy-site/`) and is NOT a workspace member, so the monorepo ci.yml cannot typecheck it.
  The plan's parenthetical ("each has a typecheck script or tsc --noEmit") is inaccurate: the
  site has neither a `typecheck` script nor any GitHub workflow. It does have a valid
  `tsconfig.json` (verified `npx tsc --noEmit` passes).
- Spec mismatch / risk: the site ships type errors only caught (if at all) by Vercel's
  `next build`. The plan explicitly wants the site typechecked in CI, and task 2.4 also references
  "the site repo's CI" — so the site needs its own workflow, created here.
- Required fix: add a `typecheck` script to the site and a site CI workflow that runs it. This
  workflow becomes the home that 2.4 extends with the mobile-renderer job.
- Code sample / exact change:
```jsonc
// paperboy-site/package.json — add to "scripts":
"typecheck": "tsc --noEmit",
```
```yaml
# paperboy-site/.github/workflows/ci.yml  (NEW — site repo has no CI yet)
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Use Node.js 24
        uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Install dependencies
        run: npm ci
      - name: Typecheck
        run: npm run typecheck
```
- Validation:
```
cd paperboy-site && npm run typecheck     # exit 0 (after adding the script)
test -f paperboy-site/.github/workflows/ci.yml && echo present
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: typecheck converter + cli in the monorepo CI, and give the site repo a CI workflow
that typechecks it.

Files to edit:
- `.github/workflows/ci.yml` (monorepo) — add the "Typecheck workspaces" step
- `paperboy-site/package.json` — add `"typecheck": "tsc --noEmit"`
- `paperboy-site/.github/workflows/ci.yml` — create (content above)

Files not to edit:
- member package.json typecheck scripts (converter/cli already correct)
- the publish workflows (2.2, done)

Exact changes: as in the two findings above.

Data shapes / CLI examples:
- Monorepo: `npm run typecheck --workspaces --if-present` covers converter + cli.
- Site is a separate repo with its own `package-lock.json`; its workflow runs `npm ci` at the
  site root then `npm run typecheck`.

Tests to add or update: none (CI config; the typecheck IS the check).

Commands to run:
- `npm run typecheck --workspaces --if-present` (from monorepo root)
- `cd paperboy-site && npm run typecheck`

Definition of done:
- Monorepo ci.yml has a typecheck step that runs converter + cli typecheck.
- `paperboy-site` has a `typecheck` script and a `.github/workflows/ci.yml` running it.
- Both typecheck commands exit 0 locally.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A blockers; both required findings have fixes
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- The site is already typechecked implicitly by Vercel's `next build` on every deploy. If you'd
  rather rely on that and NOT add a site GitHub workflow, say so in your reply and I'll accept
  converter+cli-only for 2.3 — but note 2.4 then has no site CI to attach the mobile-renderer to.

## Decision
send_to_builder
