# 6.5 — Review Turn 1

## Task Context
- Task id: 6.5
- Task title: Update site a3 page with sideload walkthrough
- Dashboard implementation status: in_progress (queue auto-activated 6.5 when 6.3 closed; 6.4 deferred; no builder commit yet — turn-1 spec route to builder)
- Review status: in_review → waiting_for_builder
- Spec section (verbatim from `/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md`):
  - **Plan line 147 (task 6.5):**
    > "Replace the '(forthcoming)' copy on [app/a3/page.tsx:130-149](paperboy-site/app/a3/page.tsx) with a clear 'Download .zip → unzip → chrome://extensions → Load unpacked' walkthrough that links the live release asset. Keep a 'Coming to the Chrome Web Store' tease."
- Phase context (plan lines 139-148, Phase 6):
  > "Phase 6 — Chrome extension: sideload-ready release (1–2 days) ... User chose sideload-only; we keep the store-submission prep for a later phase."
- Related context (verified):
  - **Site repo:** `/Users/edward/MSDev/projects/paperboy/paperboy-site` (branch `master`, separate Git repo). All edits for 6.5 land in the site repo, not the monorepo.
  - **Current a3 distribution block (`app/a3/page.tsx` lines 122-152):** Renders a single `border-2 border-ink p-4` panel with `distribution.extension.headline`, `.summary`, `.cta` (linked), `.ctaNote` (renders "Chrome Web Store listing forthcoming"), and `.buildLabel`/`.buildHref`. The walkthrough is currently jammed into one paragraph in `lib/distribution.ts:25` (the `summary` field). It is **technically already a walkthrough**, but the spec calls for it to be visually clear (step-by-step) and to specifically link the live release asset.
  - **`lib/distribution.ts` `extension` block (lines 22-37):** The literal "forthcoming" word currently only appears in `ctaNote: "Chrome Web Store listing forthcoming"`. The site otherwise has no "(forthcoming)" copy on a3 — the spec wording "Replace the '(forthcoming)' copy on app/a3/page.tsx:130-149" was written **before** Phase 1.2 partially landed the sideload text. Phase 1.2's commit `2fd1d14` rewrote `distribution.extension` to today's strings. So 6.5's job is to finish the partial work: pull the steps **out of the summary paragraph** into a discrete ordered list, and link the live release asset explicitly (not just the `/releases` page).
  - **Live release URL** (post-6.4 — currently pending; 6.4 is deferred):
    - Tag page: `https://github.com/proticom/paperboy/releases/tag/ext-v0.2.2`
    - Asset (direct): `https://github.com/proticom/paperboy/releases/download/ext-v0.2.2/paperboy-extension-0.2.2.zip`
    - Filtered releases listing (auto-updates as new ext-v* tags ship): `https://github.com/proticom/paperboy/releases?q=ext-v&expanded=true`
    - The `paperboy-ext/manifest.json` is currently version `0.2.2`; 6.3's just-merged workflow uploads `paperboy-extension-0.2.2.zip` when `ext-v0.2.2` is pushed. **Important sequencing note:** 6.4 (deferred) has not pushed the tag yet, so at merge time of 6.5 the asset URL will 404. The spec line 147 says "links the live release asset" — we interpret this as: the copy refers to the live URL pattern, which will resolve once 6.4 fires. The `ctaHref` should be the **filtered releases listing** (auto-updates) rather than a hard-coded `ext-v0.2.2/...` link, so the page stays correct after future ext bumps (0.2.3, etc.). The walkthrough body can mention the asset filename pattern `paperboy-extension-<version>.zip` so users know what to look for.
  - **Stylistic precedent on the site:** `app/a4/page.tsx:161-166` renders an ordered list via `<ol className="list-decimal list-outside ml-5 font-body text-base leading-relaxed mb-5 space-y-1">`. Use this exact class string for the walkthrough so the visual treatment matches the rest of the newspaper aesthetic.
  - **h2 section heading pattern on a3:** `<h2 className="font-ui font-bold text-xs uppercase tracking-widest border-b-[2px] border-ink pb-2 mt-10 mb-4">` (used three times in `app/a3/page.tsx` already at lines 75, 110, 122).
  - **No `data-settings-form` style attr leftovers** to worry about — the file is plain JSX (per CLAUDE.md cleanup memo).
- Files inspected:
  - `paperboy-site/app/a3/page.tsx` (full file, 169 lines — the distribution panel is lines 122-152)
  - `paperboy-site/lib/distribution.ts` (full file, 65 lines — `extension` block is lines 22-37)
  - `paperboy-site/app/a4/page.tsx` lines 155-180 (ordered-list precedent)
  - `paperboy-ext/manifest.json` (confirmed version is 0.2.2)
  - `.github/workflows/release-ext.yml` (confirmed asset filename pattern `paperboy-extension-<version>.zip` and tag form `ext-v*`)
  - Plan line 147
- Commands run (turn 1, read-only):
  ```bash
  $ grep -n "forthcoming" paperboy-site/app/a3/page.tsx
  # → no direct match in a3 page; "forthcoming" lives only in lib/distribution.ts:28 (ctaNote)

  $ grep -rn -E "forthcoming|Chrome Web Store|Load unpacked|sideload" paperboy-site/app paperboy-site/lib paperboy-site/components 2>/dev/null | grep -v .next
  lib/distribution.ts:23:    headline: "Install (sideload)",
  lib/distribution.ts:25:      "The Chrome Web Store listing is deferred for v1. Download the release zip, unzip it, then in Chrome visit chrome://extensions, enable Developer Mode, and choose Load unpacked.",
  lib/distribution.ts:28:    ctaNote: "Chrome Web Store listing forthcoming",

  $ git -C paperboy-site log --oneline -5 app/a3/page.tsx lib/distribution.ts
  0b3e69f 3.8: Flip site install copy to live npm/jsDelivr snippets (review_passed)
  2fd1d14 feat(site): Phase 1 truth fixes + Phase 2 CI + 0.2.2 converter alignment
  # → distribution.extension was last touched by Phase 1.2 (commit 2fd1d14); 6.5 finishes that work.
  ```
- Current claim being verified: 6.5 turn 1, queue token `6.5-0001`. Fresh spec route, no builder commit yet.

## Findings

### Finding 1: Rewrite a3's Distribution block into a step-by-step walkthrough with a live release link and a Web Store tease.

- Severity: required
- Location:
  - `paperboy-site/app/a3/page.tsx` — replace lines 122-152 (the entire "Distribution" `<h2>` + the `border-2 border-ink p-4` panel).
  - `paperboy-site/lib/distribution.ts` — adjust the `extension` block so the values composed into the panel actually describe a step-by-step walkthrough (rather than a paragraph), and so the `ctaHref` points at the filtered releases listing.
- Problem:
  - The current Distribution panel cribs all four sideload steps into a single sentence in `extension.summary`, which is hard to scan visually and reads like prose, not instructions.
  - The current `ctaHref` is `https://github.com/proticom/paperboy/releases` — the **whole** releases page, which mixes desktop, widget, and extension releases. Users who click "Download release zip" land on a list and must search for the right asset.
  - The current `ctaNote` ("Chrome Web Store listing forthcoming") does fulfill the "Coming to the Chrome Web Store" tease but is rendered as a single low-emphasis line at the bottom of the panel. Acceptable to keep that copy, but it should be presented adjacent to (not after) the build-from-source link so the panel reads in a sensible order.
- Spec mismatch / risk:
  - **In scope (6.5):**
    1. Replace the single-paragraph distribution panel on `app/a3/page.tsx` with a step-numbered walkthrough.
    2. Update `lib/distribution.ts` `extension` so the displayed copy reads as discrete steps (or break the steps out and inline them in the JSX — see "Two acceptable approaches" below).
    3. Link a stable, **filtered** releases URL for the extension specifically (so future `ext-v*` bumps don't require copy changes).
    4. Keep a "Coming to the Chrome Web Store" tease, visibly but not screamingly.
    5. Keep the existing "Build from source" link (`buildHref`).
  - **Out of scope (6.5):**
    - Pushing the `ext-v0.2.2` tag (that's 6.4, deferred).
    - Adding a download button that auto-resolves the latest asset URL via JS (out of scope; pure copy task).
    - Changing the `On Privacy` or `Capabilities` sections.
    - Changing `distribution.desktop`, `distribution.cli`, or `distribution.widget`.
    - Changing the masthead, footer, or any other route.
    - Modifying the monorepo (`/Users/edward/MSDev/projects/paperboy/paperboy-ext`, etc.) — this is site-repo only.

- Required fix:

  **Two acceptable approaches** — builder may choose whichever produces cleaner code. Both must satisfy the Consensus Checklist.

  **Approach A (recommended): Inline the walkthrough steps in `app/a3/page.tsx`**, keep `lib/distribution.ts` strings minimal (headline, sidebar copy, dispatch line). The a3 page is the only place the full walkthrough renders, so the steps don't need to be shared.

  **Approach B: Extend `distribution.extension` with a `steps: readonly string[]` field**, map over it in the page. Slightly more reusable but introduces an array contract that nothing else consumes today.

  Either way, the rendered output of the Distribution block on `/a3` must look like:

  ```
  ┌──────────────────────────────────────────────────────────┐
  │  INSTALL (SIDELOAD)                                       │
  │                                                           │
  │  The Chrome Web Store listing is deferred for v1.        │
  │  Sideload the extension from GitHub Releases:            │
  │                                                           │
  │   1.  Download paperboy-extension-<version>.zip          │
  │       from the latest ext-v* release.                    │
  │   2.  Unzip it anywhere on disk.                         │
  │   3.  In Chrome, visit chrome://extensions and toggle    │
  │       Developer Mode on (top right).                     │
  │   4.  Click "Load unpacked" and pick the unzipped        │
  │       folder. The Paperboy side panel is now installed.  │
  │                                                           │
  │  » DOWNLOAD THE LATEST RELEASE ZIP                       │
  │  » BUILD FROM SOURCE                                     │
  │                                                           │
  │  Coming to the Chrome Web Store.                          │
  └──────────────────────────────────────────────────────────┘
  ```

  Concrete required edits:

  **1. `paperboy-site/lib/distribution.ts` — `extension` block becomes:**

  ```ts
  extension: {
    headline: "Install (sideload)",
    intro:
      "The Chrome Web Store listing is deferred for v1. Sideload the extension from GitHub Releases:",
    steps: [
      "Download paperboy-extension-<version>.zip from the latest ext-v* release.",
      "Unzip it anywhere on disk.",
      "In Chrome, visit chrome://extensions and toggle Developer Mode on (top right).",
      "Click “Load unpacked” and pick the unzipped folder. The Paperboy side panel is now installed.",
    ],
    cta: "Download the latest release zip",
    ctaHref: "https://github.com/proticom/paperboy/releases?q=ext-v&expanded=true",
    storeTease: "Coming to the Chrome Web Store.",
    buildLabel: "Build from source",
    buildHref: "https://github.com/proticom/paperboy/tree/main/paperboy-ext",
    dispatchLine:
      "paperboy-ext: Chrome side panel. Sideload from GitHub Releases.",
    sidebarHeadline: "SIDE PANEL GOES LIVE",
    sidebarCopy:
      "The Chrome extension opens in a quiet side panel, strips any page to its bones, and delivers clean markdown via Readability and Turndown. Sideload from GitHub Releases.",
  },
  ```

  Notes:
  - Drop the old `summary` field; replace with `intro` (the lead sentence) and `steps` (the ordered list).
  - Drop the old `ctaNote: "Chrome Web Store listing forthcoming"`; replace with `storeTease: "Coming to the Chrome Web Store."` (the spec literal).
  - Change `ctaHref` from `https://github.com/proticom/paperboy/releases` to `.../releases?q=ext-v&expanded=true` so it filters the listing to extension releases only. After 6.4 fires, the top result is the `ext-v0.2.2` release.
  - Keep `dispatchLine`, `sidebarHeadline`, `sidebarCopy`, `buildLabel`, `buildHref` exactly as they are — other pages may consume them.
  - **Other consumers of `distribution.extension`:** before editing, run `grep -rn "distribution.extension" paperboy-site/app paperboy-site/components paperboy-site/lib 2>/dev/null | grep -v .next` and confirm `summary` and `ctaNote` are only read by `app/a3/page.tsx`. If any other file reads them, update those callsites too — but **only** the ones reading the renamed/removed fields. Do not touch unrelated copy.

  **2. `paperboy-site/app/a3/page.tsx` — replace the existing Distribution block (lines 122-152) with:**

  ```tsx
  <h2 className="font-ui font-bold text-xs uppercase tracking-widest border-b-[2px] border-ink pb-2 mt-10 mb-4">
    Distribution
  </h2>

  <div className="border-2 border-ink p-4 sm:p-6 mb-6">
    <p className="font-headline font-bold text-sm uppercase mb-2">
      {distribution.extension.headline}
    </p>
    <p className="font-body text-sm leading-relaxed mb-3">
      {distribution.extension.intro}
    </p>
    <ol className="list-decimal list-outside ml-5 font-body text-sm leading-relaxed mb-4 space-y-1">
      {distribution.extension.steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
    <p className="font-ui text-xs uppercase tracking-widest">
      <a
        href={distribution.extension.ctaHref}
        className="underline decoration-1 underline-offset-4 hover:bg-ink hover:text-paper transition-colors"
      >
        &raquo; {distribution.extension.cta}
      </a>
    </p>
    <p className="font-ui text-xs uppercase tracking-widest mt-2">
      <a
        href={distribution.extension.buildHref}
        className="underline decoration-1 underline-offset-4 hover:bg-ink hover:text-paper transition-colors"
      >
        &raquo; {distribution.extension.buildLabel}
      </a>
    </p>
    <p className="font-ui text-xs uppercase tracking-widest mt-3 text-faded">
      {distribution.extension.storeTease}
    </p>
  </div>
  ```

  Notes:
  - Imports unchanged (`distribution` from `@/lib/distribution` is already imported at the top of the file).
  - The `<ol>` class string matches `app/a4/page.tsx:161` exactly except we use `text-sm` to fit inside the bordered panel (the surrounding `<p>` blocks also use `text-sm`).
  - `space-y-1` between list items keeps the visual rhythm consistent with the newspaper feel.
  - Render order: headline → intro → ordered steps → primary CTA → secondary CTA (build from source) → Web Store tease (low-emphasis, `text-faded`).
  - Use `escape sequence “”` (or the literal curly quotes `“”`) for "Load unpacked" — pick one, be consistent; the TS file already uses straight quotes throughout, so escape sequences are slightly cleaner here.

  **Builder rules:**
  - **Site repo only.** Working tree: `paperboy-site/`. Branch: `master`. Do not touch the monorepo (`/Users/edward/MSDev/projects/paperboy/paperboy-ext`, `.github/workflows/`, etc.).
  - **Files to edit (exactly two):**
    1. `paperboy-site/lib/distribution.ts`
    2. `paperboy-site/app/a3/page.tsx`
  - Do not edit any other file in the site repo (no global styles, no other pages, no components, no `brand.ts`, no `lib/` other than `distribution.ts`).
  - The walkthrough must be rendered as an `<ol>` (semantic ordered list), not a `<ul>` or `<div>`. Class string: `list-decimal list-outside ml-5 font-body text-sm leading-relaxed mb-4 space-y-1`.
  - The "Coming to the Chrome Web Store" tease must be present and contain that exact phrase (case-insensitive match acceptable).
  - The CTA link (`ctaHref`) must point at `https://github.com/proticom/paperboy/releases?q=ext-v&expanded=true` so it filters to extension releases.
  - The walkthrough copy must mention all four steps: download `.zip`, unzip, `chrome://extensions` + Developer Mode, "Load unpacked".
  - The "Build from source" link must remain in the panel.
  - YAML/TS/TSX must compile cleanly. After edits, in `paperboy-site/`: `npm run build` must succeed (full Next.js build).
  - Do **not** push the site repo. Commit locally only; the reviewer's workflow handles the push.
  - Do not regenerate `package-lock.json` or change any dependency. If `npm install` runs as a side-effect of `npm run build`, leave the lockfile alone (`git checkout package-lock.json` after build if needed).

- Validation:

  ```bash
  cd /Users/edward/MSDev/projects/paperboy/paperboy-site

  # 1. Files touched are exactly the two expected ones (modulo possible lockfile churn — must be reverted)
  git status --short
  # expected: " M app/a3/page.tsx" and " M lib/distribution.ts" only

  # 2. lib/distribution.ts now defines steps array and storeTease
  grep -nE "steps:|storeTease:|intro:" lib/distribution.ts
  # expected: at least 3 matches inside the extension block

  # 3. lib/distribution.ts no longer references the old fields
  grep -nE "summary:|ctaNote:" lib/distribution.ts
  # expected: still present for desktop/cli/widget (those keep summary/ctaNote), BUT no matches inside the extension: { ... } block. If grep shows >3 matches for "summary:", verify by hand that none is on a line owned by extension.

  # 4. a3 page renders an ordered list and the steps array
  grep -nE "list-decimal|distribution.extension.steps|distribution.extension.intro|distribution.extension.storeTease" app/a3/page.tsx
  # expected: 4 matches — the className, the .steps map, the .intro reference, and the .storeTease reference

  # 5. The CTA is the filtered listing
  grep -nE "releases\?q=ext-v" lib/distribution.ts
  # expected: 1 match

  # 6. The Web Store tease is present
  grep -nE "Coming to the Chrome Web Store" lib/distribution.ts
  # expected: 1 match

  # 7. Web Store "forthcoming" is gone from the extension block (acceptable elsewhere if any)
  grep -n "forthcoming" lib/distribution.ts
  # expected: no matches (we replaced it)

  # 8. No other files touched
  git status --short | grep -v -E "(lib/distribution\.ts|app/a3/page\.tsx)$"
  # expected: empty output (no other modified files)

  # 9. Build clean
  npm run build 2>&1 | tail -30
  # expected: "Compiled successfully" or equivalent Next.js success line; no TypeScript errors mentioning distribution.extension; no missing-field errors

  # 10. Type-check the distribution.ts file specifically (catches any consumer that still reads .summary or .ctaNote)
  npx tsc --noEmit 2>&1 | grep -E "distribution|extension" | head -20
  # expected: empty (no TS errors mentioning extension)
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 6.5.

**Objective:** Rewrite the Distribution block on `paperboy-site/app/a3/page.tsx` so visitors see a clear four-step sideload walkthrough plus a "Coming to the Chrome Web Store" tease, and so the primary "Download" link points at the live ext-filtered GitHub Releases listing. The walkthrough steps live in `paperboy-site/lib/distribution.ts` as a structured array; the page renders them as an `<ol>`.

**Files to edit (exactly two, in `paperboy-site/`):**

1. **`paperboy-site/lib/distribution.ts`** — In the `extension` block: drop `summary` and `ctaNote`; add `intro` (lead sentence), `steps` (4-element string array), `storeTease` ("Coming to the Chrome Web Store."); update `cta` to "Download the latest release zip"; update `ctaHref` to `https://github.com/proticom/paperboy/releases?q=ext-v&expanded=true`. Keep `headline`, `buildLabel`, `buildHref`, `dispatchLine`, `sidebarHeadline`, `sidebarCopy` exactly as-is. See "Required fix" section for the literal block.

2. **`paperboy-site/app/a3/page.tsx`** — Replace the existing Distribution `<h2>` + `<div className="border-2 border-ink p-4 ...">` block (currently lines 122-152) with the version in the Required fix section. The new block renders the headline, the intro paragraph, an ordered list of `distribution.extension.steps`, the primary CTA link, the build-from-source link, and the Web Store tease.

**Do not edit:** anything else. No changes to `app/page.tsx`, `app/help/page.tsx`, `app/a2/page.tsx`, `app/a4/page.tsx`, any component, `brand.ts`, global CSS, or `package.json`. No monorepo changes. No tag push.

**Validate (run these from `paperboy-site/` and paste outputs into the reply):**

```bash
cd /Users/edward/MSDev/projects/paperboy/paperboy-site

git status --short
# expect: " M app/a3/page.tsx" and " M lib/distribution.ts" only

grep -nE "steps:|storeTease:|intro:" lib/distribution.ts
grep -nE "list-decimal|distribution.extension.steps|distribution.extension.intro|distribution.extension.storeTease" app/a3/page.tsx
grep -nE "releases\?q=ext-v" lib/distribution.ts
grep -nE "Coming to the Chrome Web Store" lib/distribution.ts
grep -n "forthcoming" lib/distribution.ts

npm run build 2>&1 | tail -20
```

When you reply, write `reviews/6.5/cursor-reply-turn-1.md` with: (a) the new `extension: { ... }` block from `lib/distribution.ts` verbatim; (b) the new JSX block from `app/a3/page.tsx` verbatim; (c) the output of each validation command; (d) confirmation that no other file was touched.

## Consensus Checklist
- [ ] `paperboy-site/lib/distribution.ts` `extension` block defines `intro`, `steps` (4 items), `storeTease`
- [ ] `paperboy-site/lib/distribution.ts` `extension` block no longer defines `summary` or `ctaNote`
- [ ] `extension.ctaHref` is `https://github.com/proticom/paperboy/releases?q=ext-v&expanded=true`
- [ ] `extension.storeTease` contains "Coming to the Chrome Web Store"
- [ ] `paperboy-site/app/a3/page.tsx` renders the steps as an `<ol className="list-decimal list-outside ml-5 ..."` mapping over `distribution.extension.steps`
- [ ] `app/a3/page.tsx` references `.intro` and `.storeTease` (the renamed fields)
- [ ] Walkthrough copy mentions: `.zip` download, unzip, `chrome://extensions` + Developer Mode, "Load unpacked"
- [ ] "Build from source" link still present in the Distribution panel
- [ ] `npm run build` succeeds in `paperboy-site/`
- [ ] `git status --short` shows only the two expected modified files (no lockfile churn, no other pages touched)
- [ ] No monorepo changes (no edits outside `paperboy-site/`)

## Decision
**send_to_builder.** Fresh task, no builder commit yet. Routing with a concrete spec, a literal block for both files, and a 10-item validation checklist. Builder may use the literal blocks verbatim or rephrase the copy slightly (provided the four steps and the Web Store tease are present and the link is the filtered listing).

## Notes
- 6.4 (manifest version bump + first `ext-v0.2.2` tag push) is on the DEFERRED list. The filtered-releases URL (`?q=ext-v&expanded=true`) keeps the page correct in both the pre-6.4 (empty results — no extension tag yet) and post-6.4 (top result is `ext-v0.2.2`) states. No follow-up site change needed when 6.4 finally fires.
- The reviewer noticed the literal word "(forthcoming)" doesn't actually appear in `app/a3/page.tsx` today — Phase 1.2's commit already pulled most of the spec language out. The spec line 147 is therefore best interpreted as "finish the partial sideload rewrite Phase 1.2 started" rather than "find a literal '(forthcoming)' string and replace it." The Findings section captures this.
- Approach B (extending `distribution.extension` with a `steps: readonly string[]`) is mildly preferred because it keeps the strings testable, content-editable without touching JSX, and reusable in case a future "Install" snippet on the homepage wants the same steps. But Approach A (inline in the page) is also acceptable. The Required fix presents Approach B as the literal; if builder uses Approach A, the checklist must still pass (the `<ol>` is rendered, the steps copy is present, the URL/tease are correct).
- The walkthrough's first step says "Download paperboy-extension-<version>.zip from the latest ext-v* release." The literal `<version>` placeholder is intentional — once 6.4 lands, users land on a filtered list and see the actual `ext-v0.2.2` release with the real filename `paperboy-extension-0.2.2.zip`. Avoiding a hard-coded version in copy means we don't need to re-edit the site on every extension bump.
