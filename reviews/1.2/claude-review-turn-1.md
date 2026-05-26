# 1.2 - Review Turn 1

## Task Context
- Task id: 1.2
- Task title: Resolve "ships soon / forthcoming / not yet available" contradictions
- Dashboard implementation status: todo (in spec) — verified substantively satisfied in code
- Review status: in_review → review_passed (with one optional finding on record)
- Spec sections: Phase 1 — Truth & content fixes; plan item **1.2**
  (`.cursor/plans/paperboy_production_readiness_02f05849.plan.md`)
- Files inspected:
  - `paperboy-site/lib/distribution.ts` (single source of truth for product distribution status)
  - `paperboy-site/app/page.tsx`
  - `paperboy-site/app/a2/page.tsx` (desktop)
  - `paperboy-site/app/a3/page.tsx` (extension)
  - `paperboy-site/app/help/page.tsx`
- Commands run:
  - `grep -rniE "ships soon|forthcoming|not yet available|coming soon|available soon|in preparation|final review|final polish|pending|nears launch|goes live" app components lib`
  - `grep -nE "distribution\.(desktop|extension|cli|widget)\.[a-zA-Z]+" app/page.tsx app/a2/page.tsx app/a3/page.tsx app/help/page.tsx`
- Current claim being verified: the four named pages no longer contradict each other on
  product ship status; each product has one consistent phrasing sourced centrally.

## Findings

### Finding 1: help/page.tsx hardcodes two status sentences instead of sourcing them centrally
- Severity: optional
- Location: `paperboy-site/app/help/page.tsx:98` (desktop answer) and `:105` (CLI answer)
- Problem: The plan asked to "pick one phrasing for each product and use it everywhere via
  [the central source]." The site already does this through `lib/distribution.ts`, and
  `app/page.tsx`, `app/a2/page.tsx`, and `app/a3/page.tsx` all consume it. The help page's
  two answer strings instead inline their own status prose:
  - L98: "The desktop editor is in final polish. Signed installers ... will ship from GitHub
    Releases. Until the first release is published, build from source ..."
  - L105: "... The npm package is in final review before publishing; until then, install from
    source via GitHub. ..."
- Spec mismatch / risk: These sentences are **consistent today** with `distribution.desktop`
  and `distribution.cli`, so there is no live contradiction. The only risk is future drift —
  if the central copy changes, help will silently fall out of sync. This is a maintainability
  nit, not the contradiction the task targeted.
- Required fix (optional): add status sentences to `lib/distribution.ts` (e.g.
  `distribution.desktop.helpAnswer`, `distribution.cli.helpAnswer`) and reference them from
  help/page.tsx, so all ship-status copy has exactly one home.
- Code sample / exact change:
```ts
// lib/distribution.ts — add to the desktop and cli objects:
desktop: {
  // ...existing fields...
  helpAnswer:
    "The desktop editor is in final polish. Signed installers for macOS, Windows, and Linux will ship from GitHub Releases. Until the first release is published, build from source via the repository or use the file converter on the front page, which runs the same engine in your browser.",
},
cli: {
  // ...existing fields...
  helpAnswer:
    "Yes — the command-line edition installs from npm as @proticom/paperboy-cli. paperboy-cli convert turns any single file into markdown, and paperboy-cli crawl walks a whole site into one combined markdown document. The npm package is in final review before publishing; until then, install from source via GitHub.",
},
// app/help/page.tsx — replace inline answer strings with {distribution.desktop.helpAnswer} / {distribution.cli.helpAnswer}
```
- Validation:
```
grep -rniE "ships soon|forthcoming|not yet available|coming soon" app components | sort
# Expect: zero conflicting statements; each product surfaces one phrasing.
```

## Builder Prompt

Developer/Builder, this task PASSES review. The substantive requirement (no cross-page
contradictions; one consistent phrasing per product) is already met via `lib/distribution.ts`,
which `app/page.tsx`, `app/a2/page.tsx`, and `app/a3/page.tsx` all consume.

Optional follow-up only (do not block on it, and only if you are doing a centralization sweep):
- Objective: remove the last two hardcoded status sentences in `app/help/page.tsx` (L98, L105).
- Files to edit: `paperboy-site/lib/distribution.ts`, `paperboy-site/app/help/page.tsx`.
- Files not to edit: `app/page.tsx`, `app/a2/page.tsx`, `app/a3/page.tsx` (already correct).
- Exact changes: add `helpAnswer` fields to `distribution.desktop` and `distribution.cli`
  (copy verbatim from the current help strings to avoid any wording change), then reference
  them from the two `<Letter answer=...>` props.
- Tests to add or update: none (content/config task; no test specified for 1.2).
- Commands to run: `npm run build`, then the grep in the Validation block above.
- Definition of done: no ship-status prose is hardcoded outside `lib/distribution.ts`;
  rendered help copy is byte-identical to today.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A, no blockers
- [x] Every required finding has a validation command — N/A, the one finding is optional and still has one
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions

## Decision
review_passed
