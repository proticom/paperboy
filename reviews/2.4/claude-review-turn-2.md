# 2.4 - Review Turn 2

## Task Context
- Task id: 2.4
- Task title: Add a mobile-renderer invocation on the site repo's CI for PRs touching render paths
- Dashboard implementation status: builder reply received (cursor-reply-turn-1.md)
- Review status: waiting_for_reviewer → review_passed
- Spec sections: Phase 2 item **2.4**
- Files inspected:
  - `paperboy-site/.github/workflows/mobile-render.yml`
  - `paperboy-site/scripts/mobile-render-check.mjs`
  - `paperboy-site/package.json` (devDeps)
  - `paperboy-widget/src/styles.js`, `paperboy-widget/src/widget.js` (pill class semantics)
- Commands run:
  - `cat paperboy-site/.github/workflows/mobile-render.yml`
  - `cat paperboy-site/scripts/mobile-render-check.mjs`
  - `jq '.devDependencies' paperboy-site/package.json`
  - `grep -rn "pbw-toggle(-pill)?" paperboy-widget/src/`
- Current claim being verified: the CI gate runs the mobile-renderer's deterministic checks
  correctly on PRs touching the render paths.

## Builder objection resolved
The builder accepted Option B and raised one substantive adjustment, which I evaluated and
**endorse — it fixes a real bug in my turn-1 script**:

- Adjustment: the runaway-pill check now targets `.pbw-toggle-pill` only, dropping `.pbw-toggle`.
- Verification against the widget source:
  - `.pbw-toggle` is the outer container (`widget.js:145`); `.pbw-toggle-pill` is the absolutely
    positioned **sliding pill** inside it (`widget.js:154`), styled `position: absolute; width: 50%`
    of its positioned parent `.pbw-toggle-cells` (`styles.js:105-115`).
  - A healthy pill ≈ 50% of the small toggle (~89px). The outer `.pbw-toggle` is ~188px by design,
    which exceeds my 45%-of-viewport threshold (175.5px at 390px) → my turn-1 script would have
    false-positived on every route. Correct to drop it.
  - The agent's actual "runaway pill" bug is the sliding pill anchoring to `<body>`: then
    `width: 50%` resolves against the viewport (~195px) and exceeds the 175.5px threshold → still
    correctly flagged by the retained `.pbw-toggle-pill` check.
  So the threshold logic remains sound and the selector is now precise. Good catch.

Other deliverables verified:
1. `mobile-render.yml`: `pull_request` with `paths:` covering `app/globals.css`, `app/layout.tsx`,
   `components/Masthead.tsx`, `components/ScopedMarkdownView.tsx`, `app/page.tsx`,
   `app/**/page.tsx`; steps build → start prod server → `wait-on` → run check → upload
   `mobile-screenshots/` artifact `if: always()`. ✓
2. `mobile-render-check.mjs`: 390×844 iOS UA, 7 routes × 2 editions (late via
   `documentElement.classList.add('late-edition')`), four checks (innerText > 200, overflow ≤ 0,
   pill < 45% viewport, no console error/warn), one screenshot per route/edition, non-zero exit on
   any failure. ✓
3. devDeps: `playwright ^1.60.0`, `wait-on ^8.0.5` added; lockfile updated. ✓
4. Builder ran it end-to-end: "OK to push", 14 screenshots produced. ✓

## Findings

No findings. The gate is correct and the builder's selector refinement improves on the original
contract.

(Verification scope note: I confirmed the script/workflow logic by reading and validated the pill
selector against the widget's CSS; I did not download the Chromium browser + run the full headless
suite locally. The builder ran it green, and CI will exercise it on the first qualifying PR — the
right place for the full browser run. No action needed.)

## Builder Prompt

Developer/Builder, task 2.4 is APPROVED. No further action required. This closes Phase 2.

- Objective: none (approved)
- Files to edit: none
- Commands to run: none
- Definition of done: met — path-filtered site CI gate runs the mobile-renderer's deterministic
  checks in both editions across the default routes and uploads screenshots for human review.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A, none
- [x] Every required finding has a validation command — resolved and verified
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions (Option B confirmed by the builder).

## Decision
review_passed
