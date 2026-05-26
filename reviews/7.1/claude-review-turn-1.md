# 7.1 — Review Turn 1

## Task Context
- Task id: 7.1
- Task title: Wire Ask The Editor + Footer "Contact Editor"
- Dashboard implementation status: in_progress (queue auto-activated 7.1 when 6.5 closed)
- Review status: in_review → waiting_for_builder
- Phase: Phase 7 — Site backend & polish
- Spec section (verbatim from `/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md` line 151):
  > "**7.1** Wire Ask The Editor + Footer 'Contact Editor' ([components/AskTheEditor.tsx:50-54](paperboy-site/components/AskTheEditor.tsx), [components/Footer.tsx:82-88](paperboy-site/components/Footer.tsx)). Recommended: thin `app/api/contact/route.ts` that forwards to Resend.com (Vercel Marketplace install — no token needed). Add a simple `react-hook-form` + Zod form; honeypot + rate limit via Vercel Edge KV. If you'd rather not host a backend at all, change the CTAs to a real `mailto:support@paperboy.run`."
- Phase context (plan lines 149-153, Phase 7):
  > "Phase 7 — Site: backend & polish (2–3 days)"
- Related context (verified):
  - **Site repo:** `/Users/edward/MSDev/projects/paperboy/paperboy-site` (branch `master`, separate Git repo). All edits for 7.1 land in the site repo, not the monorepo.
  - **No existing API routes:** `paperboy-site/app/api/` does not exist (`find app -name "route.ts" -o -name "route.tsx"` returns empty). 7.1 would be the first server-side route in the site.
  - **No backend env vars:** No `.env*` files exist in the site repo. Resend/KV would require provisioning via Vercel Marketplace and configuring `RESEND_API_KEY` + KV env vars before the route is functional.
  - **Packages already installed:** `react-hook-form ^7.72.0`, `zod ^4.3.6`, `@hookform/resolvers ^5.2.2` — the form half of the Resend path is dep-ready. `resend` and `@vercel/kv` are **not** installed.
  - **Canonical Paperboy email:** `support@paperboy.run` is already established on the site (`components/BackPages.tsx:54` uses it in the privacy/cookie back-pages: "Questions about this policy? Reach us at [mailto:support@paperboy.run]"). The mailto path therefore lands on existing brand precedent.
  - **Current AskTheEditor panel body (`components/AskTheEditor.tsx:42-55`):**
    ```tsx
    <div className="ask-editor-panel">
      <div className="ask-editor-head">
        <h2 className="ask-editor-title">Ask The Editor</h2>
        <button ... className="ask-editor-close">Close</button>
      </div>
      <div className="ask-editor-body">
        The Editor's wire service will dispatch from this column once the private backend connection is established.
      </div>
      <div className="ask-editor-status">
        Awaiting wire connection&hellip;
      </div>
    </div>
    ```
    — placeholder copy; never actually sent anything.
  - **Current Footer "Contact Editor" CTA (`components/Footer.tsx:82-88`):** a `<button onClick={() => setAskEditorOpen(true)}>` that just toggles the AskTheEditor panel open. So the Footer CTA already routes into the AskTheEditor flow — fixing the panel fixes both touchpoints at once.
  - **SiteUiContext:** `isAskEditorOpen`/`setAskEditorOpen` already exposed via `useSiteUi()`. No state changes needed there.
  - **CSS classes already defined** (`app/globals.css:343-443`): `.ask-editor-inline`, `.ask-editor-trigger`, `.ask-editor-panel`, `.ask-editor-head`, `.ask-editor-title`, `.ask-editor-close`, `.ask-editor-body`, `.ask-editor-status`. The panel is min-height 180px / max-height min(52vh, 420px) — there's room for a small form inside `.ask-editor-body`, but a simple mailto button also fits.
  - **Next 16 conventions** (`AGENTS.md` warns "This is NOT the Next.js you know"; `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` confirms Route Handlers in `app/api/<segment>/route.ts` are the standard pattern. **Route Handlers are not cached by default for non-GET methods**, which is what we want for a POST `/api/contact`).
- Files inspected:
  - `paperboy-site/components/AskTheEditor.tsx` (full file, 59 lines)
  - `paperboy-site/components/Footer.tsx` (full file, 94 lines)
  - `paperboy-site/components/SiteUiContext.tsx` (state shape — `isAskEditorOpen`/`setAskEditorOpen`)
  - `paperboy-site/components/BackPages.tsx:54` (existing `support@paperboy.run` reference)
  - `paperboy-site/app/globals.css` lines 343-443 (ask-editor CSS)
  - `paperboy-site/package.json` (deps survey)
  - `paperboy-site/AGENTS.md` (Next 16 warning)
  - `paperboy-site/node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
  - Plan line 151
- Commands run (turn 1, read-only):
  ```bash
  $ ls paperboy-site/app/api 2>/dev/null
  # → no such directory

  $ find paperboy-site/app -name "route.ts" -o -name "route.tsx"
  # → empty (no existing API routes)

  $ grep -E "resend|react-hook-form|zod|@vercel/kv|@upstash" paperboy-site/package.json
  # → react-hook-form ^7.72.0, zod ^4.3.6, @hookform/resolvers ^5.2.2 present
  # → resend and @vercel/kv NOT installed

  $ ls paperboy-site/.env* 2>/dev/null
  # → no .env files (no backend secrets configured)

  $ grep -rn "support@paperboy\|hello@paperboy\|contact@paperboy" paperboy-site/app paperboy-site/components paperboy-site/lib 2>/dev/null | grep -v .next
  # → components/BackPages.tsx:54 already uses support@paperboy.run
  ```
- Current claim being verified: 7.1 turn 1, queue token `7.1-0001`. Fresh spec route, no builder commit yet.

## Findings

### Finding 1: Route 7.1 to the mailto fallback path (Option B in spec), with both CTAs pointing at `mailto:support@paperboy.run`.

- Severity: required (routing decision)
- Location:
  - `paperboy-site/components/AskTheEditor.tsx` — replace the placeholder "Awaiting wire connection" body with a small, clear panel that explains the dispatch model and provides a primary CTA `mailto:` link plus a fallback "copy email" affordance.
  - `paperboy-site/components/Footer.tsx` — replace the `<button onClick={() => setAskEditorOpen(true)}>` with a `<Link href="mailto:support@paperboy.run">` so the Footer CTA also resolves directly (no need to route through the panel).
- Problem (current state):
  1. The AskTheEditor panel body is literal placeholder text ("The Editor's wire service will dispatch from this column once the private backend connection is established. … Awaiting wire connection…"). Visitors who click "Ask The Editor" today receive **no actionable response** — there's no way to reach anyone. This is a credibility hit in front-of-house copy.
  2. The Footer "Contact Editor" button funnels into the same dead panel, so the second touchpoint is also non-functional.
- Why the mailto path (Option B) and not the Resend route (Option A):
  - The spec offers **both** as valid: "Recommended: thin `app/api/contact/route.ts` … If you'd rather not host a backend at all, change the CTAs to a real `mailto:support@paperboy.run`."
  - The site currently has **zero backend infrastructure**: no `app/api/` dir, no `.env*` file, no `resend` or `@vercel/kv` package installed, no Resend Marketplace install on the Vercel project, no KV namespace provisioned. Choosing Option A would require:
    - Adding two new npm deps (`resend`, `@vercel/kv` or `@upstash/redis`).
    - Provisioning Resend via Vercel Marketplace (manual, user step).
    - Provisioning KV via Vercel (manual, user step).
    - Adding env vars (`RESEND_API_KEY` plus KV connection strings), at minimum to `.env.local` and Vercel project settings.
    - Building the form UI (react-hook-form + Zod resolver) inside `.ask-editor-body`, plus client-side fetch + error handling + success-state + honeypot + IP-rate-limit logic.
    - Likely 250-400 LOC across 4-6 files, requires user-side cloud provisioning, and ships a server-side surface with security implications (honeypot quality, rate-limit tuning, email spoofing risk).
  - The mailto path is **3 small edits** (AskTheEditor body, Footer CTA, optionally the brand text), ships today, requires no cloud config, costs no monthly fee, and resolves to the **same canonical email** (`support@paperboy.run`) the back-pages already use. It also matches the "operator not advisor — live system UI" aesthetic better: a working mailto link is honest, a stub form behind a placeholder is theater.
  - When/if the user wants a real backend, Option A becomes a clean follow-up task ("Phase 7.1.b — promote mailto to in-page form with Resend backend"). Until then, mailto is the correct ship-it choice.
- Spec mismatch / risk:
  - **In scope (7.1):**
    1. Replace the placeholder body of `AskTheEditor` with a short, on-brand explanation of how to reach the editor, plus a primary `mailto:support@paperboy.run` link.
    2. Convert the Footer "Contact Editor" button to a direct `<Link href="mailto:support@paperboy.run">` (no longer toggles the AskTheEditor panel).
    3. Keep the panel itself (the trigger + open/close behavior + ESC handling + CSS) intact — only the inner body content changes.
  - **Out of scope (7.1, deferrable to a future task):**
    - Adding `app/api/contact/route.ts` or any server-side route.
    - Installing `resend`, `@vercel/kv`, or any other backend dep.
    - Provisioning Vercel Marketplace integrations.
    - Adding form schemas, react-hook-form forms, or Zod resolvers (deps are already installed but won't be wired).
    - Changing `app/globals.css` (the existing classes are reused).
    - Changing `SiteUiContext` (the `isAskEditorOpen` state remains used by the panel trigger; we just don't need it on the Footer button anymore — but removing the Footer's import would be a cleanup, not a requirement, since other components may still rely on context).
    - Changing any other route, component, or library file.

- Required fix:

  **1. `paperboy-site/components/AskTheEditor.tsx` — replace the panel body (lines 42-55).** Keep the `useState`, `useEffect`, ESC handler, animateReflowTargets call, trigger button, and outer `.ask-editor-inline` wrapper. Only the inner body content (between `<div className="ask-editor-head">` and the closing `</div>` of the panel) changes:

  ```tsx
  <div className="ask-editor-panel">
    <div className="ask-editor-head">
      <h2 className="ask-editor-title">Ask The Editor</h2>
      <button type="button" onClick={toggle} className="ask-editor-close" aria-label="Close">
        Close
      </button>
    </div>
    <div className="ask-editor-body">
      <p className="mb-3">
        The Editor reads dispatches by email. Tips, bug reports, story leads,
        partnership inquiries — all welcome.
      </p>
      <p>
        <a
          href="mailto:support@paperboy.run?subject=Ask%20The%20Editor"
          className="underline decoration-1 underline-offset-4 hover:bg-ink hover:text-paper transition-colors"
        >
          &raquo; support@paperboy.run
        </a>
      </p>
    </div>
    <div className="ask-editor-status">
      Direct line to the desk.
    </div>
  </div>
  ```

  Notes:
  - Subject prefix `Ask%20The%20Editor` so inbound mail is filterable.
  - The `<a>` uses the same hover treatment as a3 distribution links (`hover:bg-ink hover:text-paper`).
  - The status line ("Direct line to the desk.") replaces "Awaiting wire connection…" so the panel no longer reads as broken.
  - `&raquo;` (»") prefix matches the dispatch-card link aesthetic on a3/a4.

  **2. `paperboy-site/components/Footer.tsx` — replace lines 82-88** (the `<button onClick={() => setAskEditorOpen(true)}>Contact Editor</button>`) with a direct mailto Link:

  ```tsx
  <Link
    href="mailto:support@paperboy.run?subject=Contact%20Editor"
    className="hover:bg-ink hover:text-paper px-1 -mx-1 transition-colors underline decoration-1 underline-offset-4"
  >
    Contact Editor
  </Link>
  ```

  And remove the now-unused `useSiteUi` import + the `const { setAskEditorOpen } = useSiteUi();` line at the top of `Footer.tsx` if nothing else in the component uses it. (Inspect the file — if `setAskEditorOpen` was the only context value the Footer used, drop the import and the destructure. If the Footer also uses other context, leave the import alone and just drop the destructured field.)

  **Builder rules:**
  - **Site repo only.** Working tree: `paperboy-site/`. Branch: `master`. Do not touch the monorepo.
  - **Files to edit (at most three):**
    1. `paperboy-site/components/AskTheEditor.tsx`
    2. `paperboy-site/components/Footer.tsx`
    3. (Optional) `paperboy-site/components/SiteUiContext.tsx` — only if removing the Footer's context usage leaves `setAskEditorOpen`/`isAskEditorOpen` with **zero** remaining consumers. Verify first; do not delete state that the AskTheEditor panel still uses.
  - Do **not** edit any other file (no new API route, no globals.css, no package.json, no other component or page).
  - Do **not** install or remove npm packages.
  - The `mailto:` href must be exactly `mailto:support@paperboy.run?subject=...` — the email domain is `paperboy.run` (matches `components/BackPages.tsx:54`).
  - The AskTheEditor panel trigger + open/close + ESC handler + outer wrapper must remain functional (only the inner body content is rewritten).
  - The Footer's "Contact Editor" entry must remain visible and visually consistent with the surrounding nav links (same `className` pattern as the other `<Link>`s in that nav grid).
  - `npm run build` must succeed in `paperboy-site/`. `npx tsc --noEmit` must be clean.
  - Do **not** push the site repo. Commit locally only.
  - Do **not** regenerate `package-lock.json`.

- Validation:

  ```bash
  cd /Users/edward/MSDev/projects/paperboy/paperboy-site

  # 1. Only the expected files are touched (Footer.tsx + AskTheEditor.tsx, optionally SiteUiContext.tsx)
  git status --short
  # expected: " M components/AskTheEditor.tsx" and " M components/Footer.tsx" (and optionally " M components/SiteUiContext.tsx"); no other files

  # 2. AskTheEditor body now contains the mailto link
  grep -n "mailto:support@paperboy.run" components/AskTheEditor.tsx
  # expected: 1 match

  # 3. AskTheEditor no longer claims "Awaiting wire connection"
  grep -n "Awaiting wire connection\|private backend connection" components/AskTheEditor.tsx
  # expected: empty (the placeholder copy is gone)

  # 4. Footer "Contact Editor" is now a Link, not a button-with-setAskEditorOpen
  grep -nE "Contact Editor" components/Footer.tsx
  grep -nE "mailto:support@paperboy.run" components/Footer.tsx
  # expected: 1 match each, on consecutive lines (Link + Contact Editor label)

  # 5. Footer no longer calls setAskEditorOpen (since the button is gone)
  grep -n "setAskEditorOpen\|useSiteUi" components/Footer.tsx
  # expected: empty (or, if context is still needed for another reason, no setAskEditorOpen call)

  # 6. No accidental new API route, no new deps
  ls app/api 2>/dev/null || echo "(no app/api — good)"
  git diff package.json package-lock.json
  # expected: package.json + package-lock.json untouched

  # 7. SiteUiContext still functional: if you removed isAskEditorOpen/setAskEditorOpen state, AskTheEditor.tsx must not import them broken
  grep -nE "isAskEditorOpen|setAskEditorOpen" components/SiteUiContext.tsx components/AskTheEditor.tsx
  # expected: still present in both files (the AskTheEditor panel still uses them to manage its own open/close state)

  # 8. TypeScript clean
  npx tsc --noEmit
  # expected: no output (no errors)

  # 9. Full build succeeds
  npm run build 2>&1 | tail -25
  # expected: "Compiled successfully" + 18 static pages + no errors mentioning AskTheEditor / Footer / Contact

  # 10. Optional manual sanity (reviewer will do this): the Footer "Contact Editor" link, when clicked in a browser, opens the user's mail client with To: support@paperboy.run, Subject: "Contact Editor". The AskTheEditor panel, when opened, shows the same prefilled subject "Ask The Editor".
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 7.1.

**Objective:** Replace the dead "Ask The Editor" placeholder UI with a working `mailto:support@paperboy.run` flow. Two touchpoints: (a) the AskTheEditor panel body, and (b) the Footer "Contact Editor" CTA. No backend route, no Resend, no KV — direct mailto link only. This is the spec's explicit fallback option ("If you'd rather not host a backend at all, change the CTAs to a real `mailto:support@paperboy.run`").

**Files to edit (in `paperboy-site/`):**

1. **`paperboy-site/components/AskTheEditor.tsx`** — Replace the `<div className="ask-editor-body">…</div>` and the `<div className="ask-editor-status">Awaiting wire connection…</div>` blocks with the literal block in the Required Fix section. The trigger button, open/close behavior, ESC handler, and outer `.ask-editor-inline` wrapper all remain unchanged. The `mailto:` href must include `?subject=Ask%20The%20Editor`.

2. **`paperboy-site/components/Footer.tsx`** — Replace the `<button type="button" onClick={() => setAskEditorOpen(true)} … >Contact Editor</button>` (currently lines 82-88) with a `<Link href="mailto:support@paperboy.run?subject=Contact%20Editor" className="…">Contact Editor</Link>`. Use the same `className` pattern the other footer `<Link>`s use. Remove the `useSiteUi` import + the destructured `setAskEditorOpen` if nothing else in the file uses them.

3. (Optional, only if `setAskEditorOpen` ends up with zero consumers other than `AskTheEditor.tsx` itself) — Do **not** change `SiteUiContext.tsx`. The AskTheEditor panel still needs its open/close state. Leave context alone.

**Do not edit:** any other file in the site repo. No new API routes. No package installs. No CSS changes. No changes to `app/page.tsx`, `app/a*/page.tsx`, `app/help/page.tsx`, `app/privacy/page.tsx`, `lib/`, `brand.ts`, or anywhere outside `components/AskTheEditor.tsx` and `components/Footer.tsx`. No monorepo changes.

**Validate (run these from `paperboy-site/` and paste outputs into the reply):**

```bash
cd /Users/edward/MSDev/projects/paperboy/paperboy-site

git status --short
# expect: " M components/AskTheEditor.tsx" and " M components/Footer.tsx" only

grep -n "mailto:support@paperboy.run" components/AskTheEditor.tsx
grep -n "mailto:support@paperboy.run" components/Footer.tsx
grep -n "Awaiting wire connection\|private backend connection" components/AskTheEditor.tsx
grep -n "setAskEditorOpen" components/Footer.tsx
ls app/api 2>/dev/null || echo "(no app/api — good)"
git diff package.json package-lock.json | head -5

npx tsc --noEmit
npm run build 2>&1 | tail -20
```

When you reply, write `reviews/7.1/cursor-reply-turn-1.md` with: (a) the new panel body JSX from `AskTheEditor.tsx` verbatim; (b) the new `<Link>` from `Footer.tsx` verbatim; (c) the output of each validation command; (d) confirmation that no API route was added and no deps changed.

## Consensus Checklist
- [ ] `components/AskTheEditor.tsx` panel body contains `mailto:support@paperboy.run?subject=Ask%20The%20Editor` (or equivalent encoded subject)
- [ ] `components/AskTheEditor.tsx` no longer contains the literal "Awaiting wire connection" or "private backend connection" placeholder strings
- [ ] `components/AskTheEditor.tsx` retains the trigger, ESC handler, open/close toggle, and outer `.ask-editor-inline` wrapper (only the inner body content is rewritten)
- [ ] `components/Footer.tsx` "Contact Editor" entry is a `<Link href="mailto:support@paperboy.run?...">` (not a `<button onClick={() => setAskEditorOpen(true)}>`)
- [ ] `components/Footer.tsx` no longer calls `setAskEditorOpen` (the import + destructure are removed if nothing else uses them)
- [ ] No new file at `app/api/contact/route.ts` (or anywhere under `app/api/`)
- [ ] `package.json` and `package-lock.json` are untouched (no new deps like `resend` or `@vercel/kv`)
- [ ] `npx tsc --noEmit` succeeds in `paperboy-site/`
- [ ] `npm run build` succeeds in `paperboy-site/`
- [ ] `git status --short` shows only the two expected modified files
- [ ] No monorepo changes (no edits outside `paperboy-site/`)

## Decision
**send_to_builder.** Fresh task, no builder commit yet. Routing to the mailto fallback (Option B in spec) with a concrete two-file edit plan, literal replacement blocks, and an 11-item validation checklist. The Resend/KV backend (Option A) is deferred to a future task because it requires user-side Vercel Marketplace provisioning that isn't in place today; mailto ships now and resolves to the canonical `support@paperboy.run` that the site already advertises on the back-pages.

## Notes
- The mailto path was chosen because: (a) zero infrastructure dependencies (no Resend account, no Vercel KV, no env vars); (b) consistent with the existing `support@paperboy.run` reference in `BackPages.tsx`; (c) honest UX (a working email link beats a placeholder form); (d) explicitly sanctioned by the spec ("If you'd rather not host a backend at all, change the CTAs…"); (e) ~10-20 LOC of churn vs ~250-400 for the backend path.
- Future enhancement: a follow-up task can promote the mailto link to an in-page form backed by `app/api/contact/route.ts` → Resend. Deps (`react-hook-form`, `zod`, `@hookform/resolvers`) are already installed, so the form half is dep-ready when the user opts in. The CSS panel already has room (`min-height: 180px`, `max-height: min(52vh, 420px)`) for a small form.
- The `?subject=...` query parameter on the mailto URL pre-fills the email subject in the user's mail client, which helps with inbound triage.
- Footer's `useSiteUi` usage: the Footer currently only calls `setAskEditorOpen` (line 33); once that button is converted to a Link, the entire `useSiteUi` hook call becomes dead code in Footer.tsx and should be removed in the same diff for cleanliness. The hook itself remains exported from `SiteUiContext.tsx` because `AskTheEditor.tsx` still uses it.
