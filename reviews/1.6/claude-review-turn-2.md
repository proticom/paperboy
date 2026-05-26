# 1.6 - Review Turn 2

## Task Context
- Task id: 1.6
- Task title: Add per-page metadata (title, description, OG image, canonical) to all 11 routes
- Dashboard implementation status: builder reply received (cursor-reply-turn-1.md)
- Review status: waiting_for_reviewer → review_passed
- Spec sections: Phase 1 item **1.6** (with cross-impact on item **1.3**)
- Files inspected:
  - `paperboy-site/lib/page-metadata.ts` (metadataBase added)
  - `paperboy-site/app/opengraph-image.tsx` (new default OG image)
  - `paperboy-site/brand.ts` (out-of-scope change made by builder)
  - `node_modules/@proticom/ui/dist/src/brand.d.ts` (BrandConfig type)
- Commands run:
  - `grep -n "metadataBase" lib/page-metadata.ts` → present at L83
  - `cat app/opengraph-image.tsx`
  - `git diff -- brand.ts`
  - `npx tsc --noEmit` → exit 0 (clean)
- Current claim being verified: the builder delivered the missing OG image + metadataBase, the
  site type-checks, and any collateral change is justified.

## Builder objections resolved
The builder raised no objections; it implemented the full prompt and answered the open
question (confirming the 1.6 = default OG image / 7.2 = route-specific art split). Verified each
delivered item:
1. `metadataBase: new URL(SITE_URL)` added to `buildPageMetadata` (L83). ✓
2. `app/opengraph-image.tsx` is a 1200x630 newspaper-themed default OG image — monospace,
   ink-on-paper palette (#1A1A1A / #F4F1EA), sharp 8px border, masthead "Paperboy.run · Vol. I",
   headline "All the Markdown That's Fit to Print", "Desktop · Extension · CLI · Widget", no
   emoji. Matches the brutalist aesthetic. ✓
3. title / description / canonical unchanged and per-page. ✓
4. `npx tsc --noEmit` exits 0; `twitter.card: summary_large_image` is now backed by the default
   OG image. ✓

## Findings

### Finding 1: Out-of-scope brand.ts change is necessary and correct (and corrects a 1.3 oversight)
- Severity: optional (resolved — recorded for the audit trail; does not block 1.6)
- Location: `paperboy-site/brand.ts:29` (`support.docs`), type at
  `@proticom/ui/dist/src/brand.d.ts:41-44`
- Problem: While doing 1.6, the builder also edited `brand.ts`, changing
  `docs: "https://paperboy.run/docs"` → `docs: "https://paperboy.run/help"`. That is outside
  1.6's stated file scope.
- Spec mismatch / risk: This intersects task **1.3** ("remove `brand.support.docs`"), which I
  previously marked `review_passed`. Root-cause: `BrandConfig` from the shared `@proticom/ui`
  package declares `support.docs: string` as a **required** field. The working-tree state I
  reviewed for 1.3 had `docs` deleted entirely — which means `brand.ts` (typed `: BrandConfig`)
  would have FAILED `tsc`/`next build`. My 1.3 pass relied on grep/read only and did not run a
  typecheck, so it approved a non-compiling state. The builder's change restores compilation.
- Why it is acceptable: `support.docs` is unused in the site's render tree (no references found
  in `app/` or `components/`), and `docs` cannot be removed without changing the shared
  upstream type. Repointing it to `/help` (a real route) satisfies 1.3's *actual* goal —
  eliminate the dangling link to the nonexistent `/docs` route — while keeping the build green.
  Net result is better than my original 1.3 pass.
- Required fix: none. Accept as-is for v1.
- Code sample / exact change (already applied by builder):
```ts
// brand.ts
support: {
  email: "editor@paperboy.run",
  docs: "https://paperboy.run/help",   // was ".../docs" (nonexistent route); docs is required by BrandConfig
},
```
- Validation:
```
npx tsc --noEmit            # exit 0
grep -n "docs" node_modules/@proticom/ui/dist/src/brand.d.ts   # confirms docs: string is required
```

## Builder Prompt

Developer/Builder, task 1.6 is APPROVED. No further action required for 1.6.

Optional future follow-up (NOT part of 1.6, do not act now):
- Objective: if the team genuinely wants `support.docs` gone (true 1.3 intent), make `docs`
  optional in the upstream `@proticom/ui` `BrandConfig.support` type, then drop the field from
  `brand.ts`. That is an upstream-package change, larger than a site PR, and out of scope here.
- Files to edit: none now.
- Definition of done: n/a for this task.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A, no blockers
- [x] Every required finding has a validation command — N/A, the single finding is optional/resolved and still includes one
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions (the 1.6/7.2 split was confirmed by the builder).

## Decision
review_passed
