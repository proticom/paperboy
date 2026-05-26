# 2.2 - Review Turn 2

## Task Context
- Task id: 2.2
- Task title: Fix lockfile paths in the two publish workflows (per-package → root)
- Dashboard implementation status: builder reply received (cursor-reply-turn-1.md)
- Review status: waiting_for_reviewer → review_passed
- Spec sections: Phase 2 item **2.2**
- Files inspected:
  - `.github/workflows/publish-paperboy-converter.yml`
  - `.github/workflows/publish-paperboy.yml`
- Commands run:
  - `cat .github/workflows/publish-paperboy*.yml`
  - `grep -rn "paperboy-cli/package-lock|paperboy-converter/package-lock|working-directory" .github/workflows/publish-paperboy*.yml`
- Current claim being verified: both publish workflows install from the root workspaces lockfile,
  with build/test/publish still scoped to the package.

## Builder objections resolved
The builder raised no objections and applied the corrected YAML. Verified both files:

1. **publish-paperboy-converter.yml**: job-level `defaults.run.working-directory` removed;
   `cache-dependency-path: package-lock.json` (root); `npm ci` runs at root (install step has no
   `working-directory`); Build/Run tests/Publish carry `working-directory: paperboy-converter`;
   OIDC "DO NOT set registry-url" comment preserved. ✓
2. **publish-paperboy.yml**: `cache-dependency-path: package-lock.json` (root); `npm ci` at root
   (no `working-directory` on install); Build/Run tests/Publish carry
   `working-directory: ./paperboy-cli`; comment preserved. ✓

Sanity grep confirms no residual per-package lockfile references; the only remaining
`working-directory` lines are on the build/test/publish steps (correct), not the install step.

The commands these workflows run are the same root `npm ci` + per-package `npm run build` /
`npm test` I executed and confirmed green in the 2.1 round (converter 9, cli 19 tests pass). The
lockfile is known-good and resolves.

## Findings

No findings. Both workflows now match the workspaces install model and are ready for Phase 3 to
exercise them (3.4 converter publish, 3.5 cli publish).

## Builder Prompt

Developer/Builder, task 2.2 is APPROVED. No further action required.

- Objective: none (approved)
- Files to edit: none
- Commands to run: none
- Definition of done: met — both publish workflows cache + `npm ci` at the root
  `package-lock.json`, build/test/publish scoped to the package.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A, none
- [x] Every required finding has a validation command — resolved and verified
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions

## Decision
review_passed
