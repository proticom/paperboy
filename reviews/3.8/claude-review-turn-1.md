# 3.8 - Review Turn 1

## Task Context
- Task id: 3.8
- Task title: Flip site install copy to live npm/jsDelivr snippets
- Dashboard implementation status: in_progress (review just started; on-disk state is "not started")
- Review status: in_review → waiting_for_builder
- Spec section: plan item **3.8** — "Flip the 'in final review' copy in `lib/distribution.ts`
  (cascades to a4 widget jsDelivr + a5 CLI install) so the install snippets read as live."
- Unblocked because all three npm packages are now live:
  - `@proticom/paperboy-cli@0.2.6` on npm (verified: `npm view @proticom/paperboy-cli version`).
  - `@proticom/paperboy-widget@0.2.2` on npm (verified: `npm view @proticom/paperboy-widget version`).
    The jsDelivr URL `https://cdn.jsdelivr.net/npm/@proticom/paperboy-widget@latest/dist/paperboy-widget.min.js`
    now resolves to the published file.
  - `@proticom/paperboy-converter@0.2.2` on npm (closed in 3.4; just consumed by site in 3.7).
- Out of scope for this task (still legitimately pre-release):
  - **Desktop app** (`distribution.desktop`) — installers are not yet on GitHub Releases. Keep the
    "First release in preparation" / "Signed installers in preparation" copy.
  - **Extension** (`distribution.extension`) — Chrome Web Store listing is deferred for v1
    (per current `ctaNote`). Keep the "Chrome Web Store listing forthcoming" copy.
- Files inspected:
  - `paperboy-site/lib/distribution.ts` — single source of truth; has three stale pre-release strings
    to flip:
    - L43 `cli.summary` — "in final review before publishing to npm. Until then, install from source…"
    - L47 `cli.dispatchLine` — "paperboy-cli: Convert files; crawl entire sites. npm publish pending."
    - L57 `widget.summary` — "Self-host paperboy-widget.min.js from your static assets today. The
      jsDelivr CDN URL will work once the package is published to npm."
  - `paperboy-site/app/a5/page.tsx` — consumes `distribution.cli.summary` at L119 (cascades cleanly
    when `lib/distribution.ts` flips). Also embeds the install snippet at L117 via
    `distribution.cli.installSnippet`, which is already correct (`npm install -g …`).
  - `paperboy-site/app/a4/page.tsx` L234 — **hard-codes** a stale pre-release sentence:
    "The CDN URL above will work once the package is published; until then, you can serve
    `paperboy-widget.min.js` from your own static assets…" This does NOT consume
    `distribution.widget.summary`, so flipping `distribution.ts` alone won't cascade here. Builder
    must also flip the a4 paragraph (either inline-rewrite the prose, or refactor to consume
    `distribution.widget.summary` — see Finding 2 for the preferred fix).
  - `paperboy-site/app/help/page.tsx` L105 — hard-codes a similar pre-release sentence in the FAQ
    answer: "The npm package is in final review before publishing; until then, install from source
    via GitHub." Same issue: not consuming `distribution.cli.summary`, so the cascade won't reach
    it. Must be flipped in the same task (otherwise the help page contradicts the install pages).
  - `paperboy-site/app/page.tsx` — homepage dispatch list (L51-54) uses `*.dispatchLine`. Flipping
    `cli.dispatchLine` cascades cleanly to this list. Desktop + extension dispatch lines stay
    pre-release.
- Commands run:
  - `npm view @proticom/paperboy-cli version` → `0.2.6` (live).
  - `npm view @proticom/paperboy-widget version` → `0.2.2` (live).
  - `npm view @proticom/paperboy-converter version` → `0.2.2` (live).
  - `grep -rin "final review|publish pending|will work once|once.*published" paperboy-site/{app,lib}/`
    → enumerated above.
  - `cd paperboy-site && npx tsc --noEmit` → exit 0 (baseline green).
- Current claim being verified: none — this is the initial review (turn 1 fresh).
- Result: NOT started. All three stale strings are still in place; both hard-coded paragraphs
  (a4 + help) are still pre-release.

## Findings

### Finding 1: `lib/distribution.ts` still describes cli + widget as pre-release
- Severity: blocker (this is the core 3.8 deliverable)
- Location: `paperboy-site/lib/distribution.ts` L43, L47, L57.
- Problem: three strings still say the cli and widget packages are "in final review" / "publish
  pending" / "will work once… published". All three packages are live on npm now.
- Spec mismatch / risk: the site currently tells visitors the install snippets don't yet work,
  contradicting the actual published state. This is the live-state mismatch 3.8 was filed to fix.
- Required fix: flip the three strings to live-ready copy. Keep the GitHub repo link as a
  secondary "view source" option, not as the primary install path. Do NOT change desktop or
  extension entries — those are still legitimately pre-release.
- Code sample / exact change:
```ts
// paperboy-site/lib/distribution.ts

// L43 — cli.summary
summary:
  "Requires Node 20 or later. Install globally from npm and you're ready to convert.",

// L47 — cli.dispatchLine
dispatchLine:
  "paperboy-cli: Convert files; crawl entire sites. Live on npm.",

// L57 — widget.summary
summary:
  "Drop the script tag in and the widget is live. The jsDelivr CDN serves the latest published build; self-host the bundle from your own static assets if you prefer not to depend on a CDN.",
```
- Validation:
```bash
cd paperboy-site
grep -n "final review\|publish pending\|will work once\|in preparation\|forthcoming" lib/distribution.ts
# expect: only desktop ("in preparation") and extension ("forthcoming") matches remain.
#         No cli or widget hits.
npx tsc --noEmit
# expect: exit 0
```

### Finding 2: `app/a4/page.tsx` hard-codes the stale widget pre-release sentence (no cascade)
- Severity: blocker
- Location: `paperboy-site/app/a4/page.tsx` L228-247 (the "Add the script (jsdelivr CDN)" block).
- Problem: the paragraph at L233-247 says "The CDN URL above will work once the package is
  published; until then, you can serve `paperboy-widget.min.js` from your own static assets…"
  This is inlined prose, NOT a `distribution.widget.summary` reference, so the cascade from
  Finding 1 does not reach it. After 3.8 closes, a4 would still tell visitors the CDN isn't live.
- Spec mismatch / risk: a4 is the widget product page — the page-of-record for the install snippet.
  Leaving the stale prose makes 3.8 a no-op for the user-visible path.
- Required fix: rewrite the paragraph to a live-state version. Preferred: refactor to consume
  `distribution.widget.summary` so future copy changes only need to touch `lib/distribution.ts`
  (this is the cascade the spec note assumes). Acceptable alternative: inline-rewrite the prose.
- Code sample / exact change (preferred — refactor to cascade):
```tsx
// app/a4/page.tsx — replace the L233-247 paragraph
<p className="font-ui text-[11px] uppercase tracking-wider mt-3 text-faded">
  {distribution.widget.summary}{" "}
  Place the tag near the end of <code>&lt;body&gt;</code>, after the content the widget
  should convert. Build from the{" "}
  <a
    href={distribution.widget.repoHref}
    className="underline decoration-1 underline-offset-4 hover:bg-ink hover:text-paper transition-colors"
  >
    GitHub repository
  </a>{" "}
  if you need to fork or customize.
</p>
```
- If the builder prefers inline-rewrite (acceptable but less DRY): replace the stale "will work
  once… published" sentence with "The CDN URL above serves the latest published build via
  jsDelivr. Self-host `paperboy-widget.min.js` if you prefer not to depend on a CDN."
- Validation:
```bash
cd paperboy-site
grep -n "will work once\|once.*published\|in final review" app/a4/page.tsx
# expect: zero hits
grep -n "distribution.widget" app/a4/page.tsx
# expect: at least one hit (the new cascade reference), if Option A is used
npx tsc --noEmit
# expect: exit 0
npm run build
# expect: exit 0; a4 still renders
```

### Finding 3: `app/help/page.tsx` hard-codes the stale CLI pre-release sentence (no cascade)
- Severity: blocker
- Location: `paperboy-site/app/help/page.tsx` L105 (FAQ answer).
- Problem: the FAQ answer says "The npm package is in final review before publishing; until then,
  install from source via GitHub." Hard-coded prose, no `distribution.cli.summary` reference, so
  Finding 1's flip does not cascade here.
- Spec mismatch / risk: the help page would tell visitors the CLI isn't published while a5 says
  it is — a direct contradiction the site explicitly tries to avoid (per the `lib/distribution.ts`
  header comment: "Use these strings everywhere so the site never contradicts itself").
- Required fix: rewrite the FAQ sentence to a live-state version. Preferred: interpolate
  `distribution.cli.summary` (or a new dedicated field on `distribution.cli` for help-page prose).
  Acceptable alternative: inline-rewrite the sentence.
- Code sample / exact change (inline-rewrite — simplest):
```tsx
// app/help/page.tsx — L105 answer string
answer={`Yes — the command-line edition installs from npm as ${distribution.cli.packageName}. Two main commands carry the load: ${distribution.cli.command} convert turns any single file into markdown, and ${distribution.cli.command} crawl walks a whole site (via its sitemap) into one combined markdown document. Install globally with \`${distribution.cli.installSnippet}\` (Node 20 or later). Everything runs offline, deterministically, with --json output for scripting.`}
```
- Validation:
```bash
cd paperboy-site
grep -n "final review\|publishing\|publish pending" app/help/page.tsx
# expect: zero hits
npx tsc --noEmit
# expect: exit 0
```

### Finding 4: Confirm site build + typecheck stay green after the flip
- Severity: required
- Location: `paperboy-site/`.
- Problem: copy-only changes shouldn't break the build, but we need to prove it because Findings 2-3
  may also touch JSX (especially if Builder chooses the refactor route).
- Required fix: after Findings 1-3, run typecheck + production build.
- Validation:
```bash
cd paperboy-site
npx tsc --noEmit                                                # exit 0
npm run build                                                   # exit 0; all routes render
# Cross-check: no remaining stale copy anywhere
grep -rn "final review\|publish pending\|will work once" app/ lib/
# expect: zero hits
grep -rn "in preparation\|forthcoming" app/ lib/
# expect: only desktop + extension hits in lib/distribution.ts remain (legitimately pre-release)
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: flip the three stale pre-release strings in `paperboy-site/lib/distribution.ts` for the
**cli** and **widget** entries so they describe the live, published packages. Then fix the two
places where pre-release prose is hard-coded (and therefore doesn't cascade): `app/a4/page.tsx`
(widget install paragraph) and `app/help/page.tsx` (FAQ answer about the CLI). Do NOT touch the
`distribution.desktop` or `distribution.extension` entries — those packages are still legitimately
pre-release.

Files to edit:
- `paperboy-site/lib/distribution.ts`
  - `cli.summary` (L43): replace pre-release prose with live-on-npm prose.
  - `cli.dispatchLine` (L47): replace "npm publish pending" with a live-state version.
  - `widget.summary` (L57): replace "will work once the package is published" with live-on-npm prose.
  - See Finding 1 code sample for suggested strings; you may adjust wording while keeping the
    "operator not advisor" tone (no superlatives, no marketing fluff).
- `paperboy-site/app/a4/page.tsx`
  - Replace the L233-247 paragraph that says "The CDN URL above will work once the package is
    published". Preferred: refactor to consume `distribution.widget.summary` (cascade). Acceptable:
    inline-rewrite.
- `paperboy-site/app/help/page.tsx`
  - Replace the L105 FAQ answer's "in final review before publishing" sentence with a live-state
    version. Interpolate `distribution.cli.installSnippet` if you go the refactor route.

Files not to edit:
- `lib/distribution.ts` — `desktop` and `extension` keys: pre-release copy stays.
- `app/a2/page.tsx`, `app/a3/page.tsx`: those are the extension + desktop pages; their pre-release
  copy stays.
- `paperboy-site/package.json`, lockfile: no version changes; only copy + JSX edits.
- Widget bundle, CLI binary, converter: this is a copy-only task; no code changes outside the site.

Exact changes: see Findings 1-3 code samples.

Data shapes / CLI examples:
- The published packages and their install primitives the copy must reflect:
  - `@proticom/paperboy-cli@0.2.6` → `npm install -g @proticom/paperboy-cli` (already in
    `distribution.cli.installSnippet`, leave as-is).
  - `@proticom/paperboy-widget@0.2.2` → `<script src="https://cdn.jsdelivr.net/npm/@proticom/paperboy-widget@latest/dist/paperboy-widget.min.js"></script>`
    (already in `distribution.widget.cdnSnippet`, leave as-is).

Tests to add or update:
- No unit-test changes required (copy-only).
- Validation (capture exit codes):
```bash
cd paperboy-site

# 1. Verify the stale phrases are gone from lib + app:
grep -rn "final review\|publish pending\|will work once\|once.*published" lib/ app/
# expect: zero hits

# 2. Verify legitimately pre-release copy is preserved (desktop + extension only):
grep -rn "in preparation\|forthcoming" lib/distribution.ts
# expect: only matches inside the desktop and extension blocks

# 3. Build + typecheck:
npx tsc --noEmit                                                # exit 0
npm run build                                                   # exit 0

# 4. (Optional sanity) confirm a4 + a5 + help render with the new copy:
grep -n "distribution.cli.summary\|distribution.widget.summary" app/a5/page.tsx app/a4/page.tsx app/help/page.tsx
# expect: at least cli.summary in a5; ideally widget.summary in a4 (if refactored)
```

Commands to run:
- See Validation block above.

Definition of done:
- `lib/distribution.ts` cli + widget summary/dispatchLine strings describe live-on-npm state.
- `app/a4/page.tsx` widget install paragraph no longer says "will work once the package is
  published". Preferred: it consumes `distribution.widget.summary`.
- `app/help/page.tsx` FAQ answer no longer says "in final review before publishing".
- `desktop` and `extension` entries in `lib/distribution.ts` are unchanged (still pre-release).
- `paperboy-site` `npx tsc --noEmit` exit 0; `npm run build` exit 0.
- `grep -rn "final review\|publish pending\|will work once" paperboy-site/app paperboy-site/lib`
  returns zero hits.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- For a4 + help, do you prefer the refactor (consume `distribution.widget.summary` /
  `distribution.cli.summary`) or inline-rewrite? Reviewer recommends the refactor for a4 (it makes
  future copy changes one-touch) and is neutral for help (the FAQ answer interpolates several
  fields already, so a small inline rewrite there is fine). State your choice in the reply.
- Should `distribution.desktop.sidebarHeadline` ("DESKTOP EDITOR NEARS LAUNCH") and dispatch line
  ("Signed installers in preparation") also be flipped? Reviewer says **no** — installers are NOT
  on GitHub Releases yet, so the pre-release copy is still accurate. Out of scope for 3.8.

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
Flip 3 stale strings in `lib/distribution.ts` (cli.summary, cli.dispatchLine, widget.summary) to live-on-npm copy. Then fix the two hard-coded pre-release paragraphs that DON'T cascade through `distribution.ts`: `app/a4/page.tsx` L233-247 (widget jsDelivr blurb — "will work once published") and `app/help/page.tsx` L105 (FAQ answer — "in final review"). Leave `distribution.desktop` + `distribution.extension` alone (still pre-release). Validation: zero grep hits for "final review|publish pending|will work once" in lib/ + app/, site tsc + build green.
