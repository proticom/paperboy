# 2.2 - Review Turn 1

## Task Context
- Task id: 2.2
- Task title: Fix lockfile paths in the two publish workflows (per-package → root)
- Dashboard implementation status: todo (in spec) — verified NOT done; both workflows still use per-package lockfiles
- Review status: in_review → waiting_for_builder
- Spec sections: Phase 2 item **2.2**
- Files inspected:
  - `.github/workflows/publish-paperboy-converter.yml`
  - `.github/workflows/publish-paperboy.yml`
  - `.github/workflows/supply-chain-guard.yml` (checked; out of scope — see note)
- Commands run:
  - `grep -rn "package-lock.json|npm ci|working-directory|cache-dependency-path" .github/workflows/`
  - `ls paperboy-converter/package-lock.json paperboy-cli/package-lock.json` → neither exists
- Current claim being verified: both publish workflows install from the root workspaces lockfile.

## Findings

### Finding 1: publish workflows reference non-existent per-package lockfiles AND run `npm ci` in the package dir
- Severity: required (these workflows will fail the first time Phase 3 runs them)
- Location:
  - `publish-paperboy-converter.yml`: job default `working-directory: paperboy-converter` (L18-20),
    `cache-dependency-path: paperboy-converter/package-lock.json` (L34), `npm ci` (L39, runs in
    paperboy-converter via the job default)
  - `publish-paperboy.yml`: `cache-dependency-path: paperboy-cli/package-lock.json` (L24),
    `npm ci` with `working-directory: ./paperboy-cli` (L29-30)
- Problem: the repo converted to npm workspaces; there is exactly one lockfile, the root
  `package-lock.json`. The per-package lockfiles (`paperboy-converter/package-lock.json`,
  `paperboy-cli/package-lock.json`) **do not exist**. So:
  1. `setup-node`'s `cache: npm` keyed to a missing `cache-dependency-path` cannot compute a cache key.
  2. `npm ci` run inside the package directory fails — "npm ci can only install with an existing
     package-lock.json", because there is no lockfile there.
- Spec mismatch / risk: the plan flags exactly this ("converted to npm workspaces but the
  workflows still expect per-package lockfiles"). Note the fix is bigger than the single line the
  plan cites: changing only `cache-dependency-path` leaves `npm ci` broken. `npm ci` must run at
  the **root** (only the root lockfile exists); build/test/publish can stay scoped to the package.
- Required fix: in both workflows, point the cache at the root lockfile and run `npm ci` at the
  repo root; keep build/test/publish in the package directory.
- Code sample / exact change — replace each file with:

`.github/workflows/publish-paperboy-converter.yml`:
```yaml
# Publishes @proticom/paperboy-converter — OIDC trusted publishing (no NPM_TOKEN, no registry-url).
# https://docs.npmjs.com/trusted-publishers
name: Publish to npm

on:
  push:
    tags:
      - "v*"

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v5

      - name: Use Node.js 24
        uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: package-lock.json
          # DO NOT set registry-url — it writes .npmrc with empty token (404s OIDC)

      - name: Install dependencies (root, all workspaces)
        run: npm ci

      - name: Build
        working-directory: paperboy-converter
        run: npm run build

      - name: Run tests
        working-directory: paperboy-converter
        run: npm test

      - name: Publish to npm (OIDC trusted publishing, no token needed)
        working-directory: paperboy-converter
        run: npm publish --access public
```

`.github/workflows/publish-paperboy.yml`:
```yaml
name: Publish @proticom/paperboy

on:
  push:
    tags:
      - 'cli-v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v5

      - name: Use Node.js 24
        uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: package-lock.json
          # DO NOT set registry-url — it writes .npmrc with empty token (404s OIDC)

      - name: Install dependencies (root, all workspaces)
        run: npm ci

      - name: Build
        working-directory: ./paperboy-cli
        run: npm run build

      - name: Run tests
        working-directory: ./paperboy-cli
        run: npm test

      - name: Publish to npm (OIDC trusted publishing, no token needed)
        working-directory: ./paperboy-cli
        run: npm publish --access public
```
- Validation:
```
grep -n "cache-dependency-path" .github/workflows/publish-paperboy*.yml   # both: package-lock.json (root)
grep -nA1 "Install dependencies" .github/workflows/publish-paperboy*.yml  # npm ci has NO working-directory
# Local sanity that the install the workflows run resolves from the root lockfile:
npm ci   # then: (cd paperboy-converter && npm run build && npm test); (cd paperboy-cli && npm run build && npm test)
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: make both publish workflows install from the root workspaces lockfile so they will
succeed when Phase 3 runs them.

Files to edit:
- `.github/workflows/publish-paperboy-converter.yml`
- `.github/workflows/publish-paperboy.yml`

Files not to edit:
- `.github/workflows/ci.yml` (task 2.1, already correct)
- `.github/workflows/supply-chain-guard.yml` — out of scope; it discovers lockfiles via
  `find . -name 'package-lock.json'`, which already matches the root lockfile (not a hardcoded
  per-package path).
- member `package.json` files.

Exact changes: replace the two workflow files with the YAML above. Specifically:
- `cache-dependency-path: package-lock.json` (root) in both.
- `npm ci` runs at the repo root (remove the job-level `defaults.run.working-directory` in the
  converter workflow; remove `working-directory: ./paperboy-cli` from the cli workflow's install
  step). Keep `working-directory` on the build/test/publish steps so they operate on the package.
- Preserve the OIDC "DO NOT set registry-url" comment.

Data shapes / CLI examples: only the root `package-lock.json` exists; `npm ci` must run there.
Publish-time converter dependency resolution for the CLI is a separate concern handled in Phase 3
(item 3.5) — do not change dependency versions here.

Tests to add or update: none (CI config; no unit test).

Commands to run:
- `grep -n "cache-dependency-path" .github/workflows/publish-paperboy*.yml`
- `npm ci` then per-package `npm run build` + `npm test` for converter and cli (mirrors the workflow)

Definition of done:
- Both workflows cache + install from the root `package-lock.json`, with `npm ci` at the root.
- build/test/publish remain scoped to their package directory.
- A local `npm ci` + per-package build/test succeeds.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A blockers; the required finding has a fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions

## Decision
send_to_builder
