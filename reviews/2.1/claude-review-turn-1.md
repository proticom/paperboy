# 2.1 - Review Turn 1

## Task Context
- Task id: 2.1
- Task title: Add .github/workflows/ci.yml (build/test workspaces on PR + push to main)
- Dashboard implementation status: todo (in spec) — verified NOT done; ci.yml is missing
- Review status: in_review → waiting_for_builder
- Spec sections: Phase 2 item **2.1**
- Files inspected:
  - `.github/workflows/` (existing workflows; no ci.yml)
  - root `package.json` (workspaces + scripts), root `package-lock.json` (present, 174 KB)
  - member `package.json` build/test scripts (converter, cli, app, ext, widget)
  - `.github/workflows/publish-paperboy-converter.yml` (house style)
- Commands run:
  - `ls .github/workflows/` → publish-paperboy-converter.yml, publish-paperboy.yml, supply-chain-guard.yml (no ci.yml)
  - `jq '{workspaces, scripts}' package.json`
  - `for d in ...; do jq '.scripts|{build,test,typecheck}' $d/package.json; done`
- Current claim being verified: a CI workflow builds and tests all workspaces on PR and push to main.

## Findings

### Finding 1: ci.yml does not exist
- Severity: required
- Location: `.github/workflows/ci.yml` (absent)
- Problem: There is no CI workflow. The repo has only the two publish workflows and a
  supply-chain guard. Nothing builds/tests workspaces on PRs.
- Spec mismatch / risk: Phase 2's whole purpose is a regression safety net before Phases 3-8.
  Without it, every later phase merges blind.
- Required fix: add `.github/workflows/ci.yml` per the Builder Prompt below.
- Code sample / exact change: see the full file in the Builder Prompt.
- Validation:
```
test -f .github/workflows/ci.yml && echo present
# Lint the YAML and (optionally) dry-run locally with act, or push a PR and confirm the run is green.
```

### Finding 2: plan's literal `npm run build --workspaces` will fail on paperboy-app
- Severity: required
- Location: build step of the new ci.yml
- Problem: `paperboy-app` (the Tauri desktop app) has **no `build` script** (it builds via the
  root `tauri:build`). `npm run build --workspaces` (without `--if-present`) errors with
  "Missing script: build" the moment it reaches paperboy-app. The plan text omits `--if-present`
  on the build step.
- Spec mismatch / risk: CI would fail on its first run for a reason unrelated to code quality.
- Required fix: use `npm run build --workspaces --if-present` (skips workspaces lacking a build
  script — i.e. paperboy-app). This keeps Rust/Tauri toolchain out of this lightweight CI, which
  is correct for Phase 2 (desktop bundling is Phase 5). Build order note: the `workspaces` array
  is `[converter, cli, app, ext, widget]`, and `--workspaces` runs in array order, so
  `paperboy-converter` builds before `paperboy-cli` (which depends on it) — no extra ordering work
  needed.
- Code sample / exact change: reflected in the Builder Prompt file below.
- Validation:
```
npm run build --workspaces --if-present   # locally: converter+cli (tsc), ext+widget (node build.js); app skipped
npm test  --workspaces --if-present       # converter, cli, widget run vitest; app, ext skipped
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: add a CI workflow that installs, builds, and tests all npm workspaces on every PR and
on push to main, on Ubuntu + Node 24, using the npm cache keyed to the root lockfile.

Files to edit:
- create `.github/workflows/ci.yml`

Files not to edit:
- the two publish workflows and supply-chain-guard.yml (lockfile-path fixes are task 2.2)
- any member `package.json` (do NOT add a no-op build script to paperboy-app; `--if-present`
  handles it without source changes)

Exact changes — create `.github/workflows/ci.yml` with exactly this content:
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - name: Use Node.js 24
        uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: package-lock.json

      - name: Install (root, all workspaces)
        run: npm ci

      - name: Build workspaces
        run: npm run build --workspaces --if-present

      - name: Test workspaces
        run: npm test --workspaces --if-present
```

Data shapes / CLI examples:
- Workspaces: converter, cli, app, ext, widget. `paperboy-site` is a separate repo and is
  correctly NOT a workspace, so it is out of scope here.
- `--if-present` skips paperboy-app (no build/test) and paperboy-ext (no test).

Tests to add or update: none (this IS the test harness). No unit test for the workflow itself.

Commands to run (locally, to mirror CI before pushing):
- `npm ci`
- `npm run build --workspaces --if-present`
- `npm test --workspaces --if-present`

Definition of done:
- `.github/workflows/ci.yml` exists with the content above.
- The three local commands succeed from a clean checkout.
- On the PR that adds this file, the CI check appears and passes.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A blockers; both required findings have fixes
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions

## Decision
send_to_builder
