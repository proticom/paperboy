# 1.1 - Review Turn 1

## Task Context
- Task id: 1.1
- Task title: Fix CLI package and command names on a5 and help pages
- Dashboard implementation status: todo (in spec) — verified already-satisfied in code
- Review status: in_review → review_passed
- Spec sections: Phase 1 — Truth & content fixes on the site; plan item **1.1**
  (`.cursor/plans/paperboy_production_readiness_02f05849.plan.md`)
- Files inspected:
  - `paperboy-site/lib/distribution.ts` (the single source of truth the pages read from)
  - `paperboy-site/app/a5/page.tsx`
  - `paperboy-site/app/help/page.tsx`
- Commands run:
  - `grep -rnE "@proticom/paperboy([^-a-z]|$)" --include=*.tsx --include=*.ts --include=*.md --include=*.json paperboy-site` → 0 hits
  - `grep -rnE "paperboy convert" paperboy-site` → 0 hits
  - `grep -rnE "paperboy crawl" paperboy-site` → 0 hits
- Current claim being verified: On the a5 and help pages, the CLI package name reads
  `@proticom/paperboy-cli` (not `@proticom/paperboy`), the CLI command reads `paperboy-cli`
  (not bare `paperboy`), and the install snippet is framed as "available soon / Phase 3 turns it live."

## Findings

No findings.

The fix described by plan item 1.1 is already fully present in the codebase. The plan's
line references (`a5/page.tsx:116`, `help/page.tsx:104`) are stale: the site was refactored
since the plan was written so that the CLI package name, command, and install snippet are no
longer hardcoded in the page components. They are centralized in `paperboy-site/lib/distribution.ts`
and both pages render them by reference. The centralized values are already correct:

- `distribution.cli.packageName` = `@proticom/paperboy-cli`
- `distribution.cli.command` = `paperboy-cli`
- `distribution.cli.installSnippet` = `npm install -g @proticom/paperboy-cli`
- `distribution.cli.summary` = "Requires Node 20 or later. The package is in final review
  before publishing to npm. Until then, install from source via the GitHub repository."

Observable results on each page:

- **a5** (`app/a5/page.tsx`): the "Install (npm)" card (L115–127) renders the correct snippet
  immediately followed by the "in final review before publishing… install from source" caveat
  and a link to the GitHub repository. The first-run block (L132–139) and the `--help` reference
  (L144) all use `${distribution.cli.command}` → `paperboy-cli` for `doctor`/`convert`/`crawl`.
- **help** (`app/help/page.tsx`): the "command-line version" Q&A (L105) renders
  "installs from npm as @proticom/paperboy-cli", "`paperboy-cli convert`", "`paperboy-cli crawl`",
  and "The npm package is in final review before publishing; until then, install from source via GitHub."

A repo-wide search found zero remaining instances of the incorrect package name
(`@proticom/paperboy` not followed by `-`) or the bare commands (`paperboy convert`,
`paperboy crawl`) anywhere under `paperboy-site/`.

All three sub-requirements of plan item 1.1 are therefore met:
1. `@proticom/paperboy` → `@proticom/paperboy-cli` ✓
2. `paperboy convert/crawl` → `paperboy-cli convert/crawl` ✓
3. Install snippet framed as "available soon" until Phase 3 makes it live ✓ (the snippet shows the
   real future command while the adjacent summary clearly states the package is not yet published
   and to install from source meanwhile — which is a stronger, non-contradictory form of the intent).

## Builder Prompt

Developer/Builder, no action is required for this task.

The requirement is already satisfied by the centralized `paperboy-site/lib/distribution.ts`
refactor. Do not re-edit `app/a5/page.tsx` or `app/help/page.tsx` to hardcode the package/command
names — that would regress the single-source-of-truth design. If any future change is needed,
make it in `lib/distribution.ts` only.

- Objective: none (verification-only pass; task already complete)
- Files to edit: none
- Files not to edit: `paperboy-site/app/a5/page.tsx`, `paperboy-site/app/help/page.tsx`,
  `paperboy-site/lib/distribution.ts`
- Exact changes: none
- Data shapes / CLI examples: n/a
- Tests to add or update: none (content/config task; no test was specified for 1.1)
- Commands to run (to reproduce verification):
  - `grep -rnE "@proticom/paperboy([^-a-z]|$)" paperboy-site --include=*.tsx --include=*.ts`
  - `grep -rnE "paperboy (convert|crawl)" paperboy-site`
- Definition of done: all three searches above return zero hits (already true).

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A, no findings
- [x] Every required finding has a validation command — N/A, no findings
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions

## Decision
review_passed
