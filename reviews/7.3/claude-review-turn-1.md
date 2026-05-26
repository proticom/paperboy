# 7.3 — Review Turn 1

## Task Context
- Task id: 7.3
- Task title: End-to-end smoke pass on all routes
- Dashboard implementation status: in_progress (queue auto-activated 7.3 when 7.2 closed)
- Review status: in_review → waiting_for_builder
- Phase: Phase 7 — Site backend & polish
- Spec section (verbatim from `/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md` line 153):
  > "**7.3** End-to-end smoke pass: visit every route, click every download button, verify every demo works. Use the existing `cursor-ide-browser` MCP for a scripted pass on mobile + desktop viewports."
- Phase context (plan line 24, line 149):
  > "Phase 7 — Site backend (Ask The Editor wired), OG images, end-to-end smoke pass"
  > "## Phase 7 — Site: backend & polish (2–3 days)"
- Related context (verified):
  - **Site repo:** `/Users/edward/MSDev/projects/paperboy/paperboy-site` (branch `master`). All 7.3 work lands in the site repo, not the monorepo.
  - **Existing smoke infrastructure** (`paperboy-site/scripts/mobile-render-check.mjs`, 60 lines): Playwright-based iPhone-viewport pass over 7 routes (`/`, `/a2`, `/a3`, `/a4`, `/a5`, `/help`, `/viewer`) × 2 editions (morning, late). For each page it asserts:
    - `document.body.innerText.length >= 200` (not blank)
    - `document.body.scrollWidth - window.innerWidth <= 0` (no horizontal overflow)
    - widget toggle pill widths `<= 45%` of viewport (no runaway pills)
    - no console errors or warnings
    - takes a screenshot per `route × edition` to `mobile-screenshots/`.
    - Exits 1 with a `HOLD — mobile render regressions:` report if any assertion fails.
  - The script imports `playwright` directly (it is **not** currently in `package.json`; it gets pulled in implicitly through `next` / `puppeteer` deps? — see open question below).
  - There is **no** npm script wired for it today (`package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `refresh:proticom-ui`).
  - **Routes that exist** (verified via `ls app/`, 1:1 with `lib/page-metadata.ts` PAGES): `/`, `/a2`, `/a3`, `/a4`, `/a5`, `/viewer`, `/help`, `/directory`, `/privacy`, `/terms`, `/cookies` → 11 routes.
  - **Gap vs. existing script:** today's mobile-render-check covers **7 of 11 routes**; missing `/a4`, `/directory`, `/privacy`, `/terms`, `/cookies`. Also: mobile viewport only, no desktop pass.
  - **Download / CTA targets** (verified via `paperboy-site/lib/distribution.ts`, single source of truth):
    - `distribution.desktop.ctaHref` → `https://github.com/proticom/paperboy/releases`
    - `distribution.desktop.buildHref` → `https://github.com/proticom/paperboy/tree/main/paperboy-app`
    - `distribution.extension.ctaHref` → `https://github.com/proticom/paperboy/releases?q=ext-v&expanded=true`
    - `distribution.extension.buildHref` → `https://github.com/proticom/paperboy/tree/main/paperboy-ext`
    - `distribution.cli.ctaHref` → `https://github.com/proticom/paperboy/tree/main/paperboy-cli`
    - `distribution.widget.cdnSnippet` → `https://cdn.jsdelivr.net/npm/@proticom/paperboy-widget@latest/dist/paperboy-widget.min.js`
    - `distribution.widget.repoHref` → `https://github.com/proticom/paperboy/tree/main/paperboy-widget`
  - **Mailto targets** (from 7.1, just landed):
    - `components/AskTheEditor.tsx:56` → `mailto:support@paperboy.run?subject=Ask%20The%20Editor`
    - `components/Footer.tsx:80` → `mailto:support@paperboy.run?subject=Contact%20Editor`
  - **Demos / interactive components on the site** (live system UI, not advisor):
    - **Masthead toggle** (`components/Masthead.tsx`): Newspaper / Markdown view toggle in the site header. Provided by the paperboy-widget bundle (per project-memory `M064 — site masthead toggle uses the paperboy-widget bundle`). Adds the `late-edition` body class (or equivalent) when toggled. The existing mobile-render-check already covers the "late" branch.
    - **Viewer drag-and-drop** (`/viewer`, `app/viewer/page.tsx`): A drag-target zone for dropping a local `.md` file; renders inline. We will not actually drop a file in the smoke script (file injection in Playwright is fiddly cross-browser); we only assert the drop-zone element is mounted and visible.
    - **AskTheEditor mailto card** (`components/AskTheEditor.tsx`): Shown on `/help`. CTA is a literal `mailto:` link (post-7.1). Assert the `href` matches the canonical string.
    - **Footer Contact Editor mailto** (`components/Footer.tsx`): Present on every page. Assert the `href` matches the canonical string.
    - **`/a3` extension sideload steps** (per 6.5): a `<ol>` of 4 numbered steps + the filtered ext-v releases URL. Assert the OL has ≥4 `<li>` children and the releases link points to the filtered URL.
    - **`/a5` CLI install snippet** (per 3.8): live `npm install -g @proticom/paperboy-cli` snippet. Assert presence of the install command literal in page text.
    - **`/a4` widget script snippet** (per 3.8): live `<script src="https://cdn.jsdelivr.net/npm/@proticom/paperboy-widget@latest/dist/paperboy-widget.min.js">` snippet. Assert presence in page text.
  - **OG images** (just landed in 7.2): 11 routes with `opengraph-image.tsx` files; this is build-time / metadata-layer, **not** part of the 7.3 user-facing smoke pass. Don't re-test OG images here.
  - **Playwright availability**: `paperboy-site/scripts/mobile-render-check.mjs` already imports `from "playwright"`. Builder should run `npx playwright install chromium` if a runtime failure indicates the browser isn't downloaded yet. The smoke script must be **runnable locally** against a `npm run dev` or `npm run start` server.
  - **No e2e MCP available in CI**: The plan mentions `cursor-ide-browser` MCP, but that's a Cursor-IDE extension, not portable. We use the same Playwright pattern as `mobile-render-check.mjs` so the smoke pass is repeatable on any developer machine and (optionally) in CI later.
  - **No existing `reviews/7.3/` artifacts**: this is turn 1.

- Files inspected:
  - `paperboy-site/scripts/mobile-render-check.mjs` (existing iPhone-viewport pass, 60 lines)
  - `paperboy-site/lib/distribution.ts` (single source of truth for download/CTA URLs)
  - `paperboy-site/lib/page-metadata.ts` (11 PAGES keys = 11 routes)
  - `paperboy-site/components/AskTheEditor.tsx` (mailto from 7.1)
  - `paperboy-site/components/Footer.tsx` (mailto from 7.1)
  - `paperboy-site/components/Masthead.tsx` (toggle bundle host)
  - `paperboy-site/app/a4/page.tsx` (widget CDN snippet)
  - `paperboy-site/app/a3/page.tsx` (sideload OL — per 6.5)
  - `paperboy-site/app/a5/page.tsx` (CLI install snippet — per 3.8)
  - `paperboy-site/app/viewer/page.tsx` (drag-target)
  - `paperboy-site/app/directory/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/cookies/page.tsx` (4 routes missing from current mobile-render-check)
  - Plan lines 24, 149, 153
- Commands run (turn 1, read-only):
  ```bash
  $ ls paperboy-site/app | grep -v "\."
  # → a2 a3 a4 a5 cookies directory fonts help privacy terms viewer (10 dirs + fonts = 10 routes besides /)

  $ ls paperboy-site/scripts
  # → mobile-render-check.mjs, refresh-proticom-ui.mjs

  $ cat paperboy-site/package.json | jq .scripts
  # → no smoke / no e2e script

  $ grep -rn "playwright" paperboy-site/package.json
  # → no explicit dep (script uses `import { chromium } from "playwright"` — implicit transitive)

  $ grep -n "mailto" paperboy-site/components/*.tsx
  # → AskTheEditor.tsx:56 + Footer.tsx:80 (both support@paperboy.run)
  ```
- Current claim being verified: 7.3 turn 1, queue token `7.3-0001`. Fresh task, no builder commit yet.

## Findings

### Finding 1: Add `scripts/e2e-smoke.mjs` (covers all 11 routes × mobile + desktop viewports) and wire `npm run smoke` script, plus an `npm run smoke:mobile` wrapper for the existing iPhone-only pass.

- Severity: required (this is the entire body of work for 7.3)
- Location:
  - **New file** `paperboy-site/scripts/e2e-smoke.mjs` — comprehensive Playwright pass over all 11 routes × 2 viewports + CTA + demo assertions.
  - **Modify** `paperboy-site/package.json` — add 2 npm scripts: `"smoke"` (runs the new script) and `"smoke:mobile"` (runs the existing `mobile-render-check.mjs`). Add `playwright` as an explicit `devDependency` (don't rely on transitive resolution).
  - **No edits to any `app/`, `components/`, `lib/`, or `public/` file.** This is a pure additive test-infra change.

- Problem (current state):
  1. There is no end-to-end smoke pass. The existing `mobile-render-check.mjs` covers 7 of 11 routes on the iPhone viewport only — no desktop pass, no CTA href validation, no demo interaction, no mailto check, no validation that the 7.1/7.2/6.5/3.8 wiring (mailto, OG images, sideload steps, install snippets) is actually present on the live page.
  2. Before Phase 7 closes, we need a single repeatable command that confirms: every route loads, every download/CTA link points to the canonical URL, every demo element is mounted, no console errors, no horizontal overflow, no runaway widget pills — on both mobile and desktop.
  3. `package.json` has no `smoke` script today, so there's no documented way for a future dev (or CI) to run the smoke pass.

- Why one new file + minimal `package.json` edit, not "extend mobile-render-check":
  - The existing `mobile-render-check.mjs` is purpose-built for mobile-only render regression (overflow, pill widths, late-edition). Bolting CTA + demo assertions + a desktop viewport pass onto it would muddle the original intent and make the script harder to read.
  - A sibling `e2e-smoke.mjs` keeps each script single-purpose: `mobile-render-check` = "did the iPhone render break?", `e2e-smoke` = "did anything user-facing break across the site?". Both run via separate npm scripts; future CI can choose to run one, both, or fan-out in parallel.
  - The existing mobile-render-check stays unchanged (and stays the canonical source for the iPhone-viewport overflow/pill checks). 7.3 specifically adds the **comprehensive** smoke pass mandated by the spec.

- Spec mismatch / risk:
  - **In scope (7.3):**
    1. Create `paperboy-site/scripts/e2e-smoke.mjs` that:
       a. Boots Playwright (chromium).
       b. Iterates `ROUTES = ["/", "/a2", "/a3", "/a4", "/a5", "/viewer", "/help", "/directory", "/privacy", "/terms", "/cookies"]` (11 entries) × `VIEWPORTS = [{name: "mobile", width: 390, height: 844, isMobile: true}, {name: "desktop", width: 1280, height: 800, isMobile: false}]`.
       c. For each `route × viewport`: load the page (`waitUntil: "networkidle"`), collect console errors + warnings, screenshot to `smoke-screenshots/<viewport>-<route>.png`, and run a set of assertions.
       d. **Global assertions** (every route × viewport):
          - `document.body.innerText.length >= 200` (page not blank).
          - `document.body.scrollWidth - window.innerWidth <= 1` (no horizontal overflow; allow 1px for sub-pixel rounding).
          - No console `error` or `warning` messages (collected via `page.on("console")`).
          - Footer Contact Editor mailto present and matches `mailto:support@paperboy.run?subject=Contact%20Editor` (footer renders on every page).
       e. **Route-specific assertions** (run only on the listed route):
          - `/`: contains the literal headline "All the markdown" (case-insensitive substring).
          - `/a2` (Desktop): CTA link `[href="https://github.com/proticom/paperboy/releases"]` present. Build-from-source link `[href="https://github.com/proticom/paperboy/tree/main/paperboy-app"]` present.
          - `/a3` (Extension): CTA link `[href="https://github.com/proticom/paperboy/releases?q=ext-v&expanded=true"]` present. Sideload OL has at least 4 `<li>` children (validated by `page.locator("ol").first().locator("li").count() >= 4`).
          - `/a4` (Widget): Page text contains the literal CDN snippet substring `cdn.jsdelivr.net/npm/@proticom/paperboy-widget`.
          - `/a5` (CLI): Page text contains the literal install snippet `npm install -g @proticom/paperboy-cli`.
          - `/viewer`: A `<input type="file">` or drag-target element exists (e.g. `page.locator("input[type=file], [data-drop-target], [aria-label*='drop' i]").count() >= 1`). Builder picks the most precise selector based on the actual JSX.
          - `/help`: AskTheEditor CTA `[href="mailto:support@paperboy.run?subject=Ask%20The%20Editor"]` present.
          - `/directory`, `/privacy`, `/terms`, `/cookies`: no route-specific assertion beyond the global checks (these are content pages; the global blank/overflow/console checks are sufficient).
       f. **Pill width check** (mobile viewport only, identical to mobile-render-check rule): for every `.pbw-toggle-pill`, `boundingBox.width <= viewport.width * 0.45` (no runaway widget pills).
       g. Collect all failures into a list. If non-empty, `console.error("HOLD — e2e smoke regressions:\n" + ...)` and `process.exit(1)`. Else `console.log("e2e smoke passed: 22 page-loads OK")` and exit 0.
       h. Base URL configurable via `BASE_URL` env (default `http://localhost:3000`). Don't start the dev server — assume the user runs `npm run dev` or `npm run start` in a separate terminal first (the existing `mobile-render-check.mjs` follows the same convention).
    2. Modify `package.json`:
       - Add `"smoke": "node scripts/e2e-smoke.mjs"` to `scripts`.
       - Add `"smoke:mobile": "node scripts/mobile-render-check.mjs"` to `scripts`.
       - Add `"playwright": "^1.50.0"` (or current latest stable major) to `devDependencies`. Run `npm install` after editing so `package-lock.json` is updated.
    3. Run the smoke pass once locally to confirm it exits 0. Capture the tail of `npm run smoke` output in the builder reply.
  - **Out of scope (7.3, defer if proposed):**
    - Any UI code changes (`app/`, `components/`, `lib/`, `public/`). The smoke pass is read-only against the running site; if it surfaces a real bug, that's a separate fix in a follow-up task — **not** something to patch in this 7.3 turn.
    - Wiring the smoke pass into CI (a Vercel preview check or GitHub Actions job). 7.3 is "build the smoke pass and run it once locally"; CI integration belongs to Phase 8 hardening.
    - Cross-browser smoke (firefox/webkit). Chromium is sufficient for v1 — the existing `mobile-render-check.mjs` is also chromium-only.
    - Visual regression / pixel-diff. Screenshots are captured for human triage only; the script doesn't compare against a baseline.
    - Re-testing the OG image routes (already covered by `npm run build` route table in 7.2; running per-route OG image fetches is unnecessary).
    - Actually dropping a file on `/viewer` and asserting markdown rendering (Playwright file-drop is fiddly; presence of the drop-target element is sufficient for v1 smoke).
    - Actually submitting a mailto link (mailto's open the system mail client — assert href value, don't click).
    - Touching `mobile-render-check.mjs` or its assertions.
    - Touching any monorepo file.
    - Touching `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, or any other top-level config.

- Required fix:

  **1. New file: `paperboy-site/scripts/e2e-smoke.mjs`.** Use the existing `mobile-render-check.mjs` as a structural reference (same Playwright import, same `BASE_URL` env, same screenshot-on-each-route, same `failures[]` collector + `HOLD —` exit-1 contract). The new script extends that pattern to 11 routes × 2 viewports + the CTA/demo assertions listed above.

  ```js
  import { chromium } from "playwright";
  import { mkdirSync } from "node:fs";

  const BASE = process.env.BASE_URL || "http://localhost:3000";
  const ROUTES = ["/", "/a2", "/a3", "/a4", "/a5", "/viewer", "/help", "/directory", "/privacy", "/terms", "/cookies"];
  const VIEWPORTS = [
    { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    { name: "desktop", width: 1280, height: 800, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  ];
  const OUT = "smoke-screenshots";
  mkdirSync(OUT, { recursive: true });

  const FOOTER_MAILTO = "mailto:support@paperboy.run?subject=Contact%20Editor";
  const ASK_MAILTO = "mailto:support@paperboy.run?subject=Ask%20The%20Editor";
  const DESKTOP_RELEASES = "https://github.com/proticom/paperboy/releases";
  const DESKTOP_BUILD = "https://github.com/proticom/paperboy/tree/main/paperboy-app";
  const EXT_RELEASES = "https://github.com/proticom/paperboy/releases?q=ext-v&expanded=true";
  const WIDGET_CDN_SUBSTR = "cdn.jsdelivr.net/npm/@proticom/paperboy-widget";
  const CLI_INSTALL_SUBSTR = "npm install -g @proticom/paperboy-cli";

  const failures = [];
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor,
    });

    for (const route of ROUTES) {
      const tag = `${vp.name}-${(route.replace(/\//g, "_") || "_home")}`;
      const page = await context.newPage();
      const consoleIssues = [];
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning") consoleIssues.push(`[${m.type()}] ${m.text()}`);
      });

      try {
        await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 15000 });
      } catch (e) {
        failures.push(`${tag}: navigation failed — ${e.message}`);
        await page.close();
        continue;
      }

      // Global checks
      const m = await page.evaluate(() => ({
        textLen: document.body.innerText.length,
        overflow: document.body.scrollWidth - window.innerWidth,
        innerWidth: window.innerWidth,
        footerMailto: document.querySelector('a[href^="mailto:support@paperboy.run"]')?.getAttribute("href") || "",
        pillWidths: [...document.querySelectorAll(".pbw-toggle-pill")].map((el) => el.getBoundingClientRect().width),
      }));

      await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: false });

      if (m.textLen < 200) failures.push(`${tag}: blank page (innerText ${m.textLen})`);
      if (m.overflow > 1) failures.push(`${tag}: horizontal overflow (+${m.overflow}px)`);
      // Footer mailto is on every page (Footer renders globally)
      if (!m.footerMailto.startsWith("mailto:support@paperboy.run")) {
        failures.push(`${tag}: footer mailto missing or wrong (got ${JSON.stringify(m.footerMailto)})`);
      }
      // Pill width only enforced on mobile (matches mobile-render-check rule)
      if (vp.isMobile) {
        for (const w of m.pillWidths) {
          if (w > m.innerWidth * 0.45) failures.push(`${tag}: runaway pill (${Math.round(w)}px of ${m.innerWidth})`);
        }
      }
      if (consoleIssues.length) failures.push(`${tag}: ${consoleIssues.length} console issue — ${consoleIssues[0]}`);

      // Route-specific checks
      if (route === "/a2") {
        const dl = await page.locator(`a[href="${DESKTOP_RELEASES}"]`).count();
        if (dl < 1) failures.push(`${tag}: missing desktop releases CTA`);
        const build = await page.locator(`a[href="${DESKTOP_BUILD}"]`).count();
        if (build < 1) failures.push(`${tag}: missing desktop build-from-source link`);
      } else if (route === "/a3") {
        const ext = await page.locator(`a[href="${EXT_RELEASES}"]`).count();
        if (ext < 1) failures.push(`${tag}: missing extension releases CTA`);
        const liCount = await page.locator("ol").first().locator("li").count();
        if (liCount < 4) failures.push(`${tag}: sideload OL has ${liCount} items, expected ≥4`);
      } else if (route === "/a4") {
        const text = await page.locator("body").innerText();
        if (!text.includes(WIDGET_CDN_SUBSTR)) failures.push(`${tag}: missing widget CDN snippet substring`);
      } else if (route === "/a5") {
        const text = await page.locator("body").innerText();
        if (!text.includes(CLI_INSTALL_SUBSTR)) failures.push(`${tag}: missing CLI install snippet`);
      } else if (route === "/viewer") {
        const dropCount = await page.locator("input[type=file], [data-drop-target], [aria-label*='drop' i]").count();
        if (dropCount < 1) failures.push(`${tag}: missing viewer drop-target`);
      } else if (route === "/help") {
        const ask = await page.locator(`a[href="${ASK_MAILTO}"]`).count();
        if (ask < 1) failures.push(`${tag}: missing AskTheEditor mailto CTA`);
      }

      await page.close();
    }

    await context.close();
  }

  await browser.close();

  if (failures.length) {
    console.error("HOLD — e2e smoke regressions:\n" + failures.map((f) => " - " + f).join("\n"));
    process.exit(1);
  }
  console.log(`e2e smoke passed: ${ROUTES.length * VIEWPORTS.length} page-loads OK across ${ROUTES.length} routes × ${VIEWPORTS.length} viewports`);
  ```

  **2. Edit `paperboy-site/package.json`:**

  - Add to `scripts`:
    ```json
    "smoke": "node scripts/e2e-smoke.mjs",
    "smoke:mobile": "node scripts/mobile-render-check.mjs"
    ```
  - Add to `devDependencies` (alphabetized):
    ```json
    "playwright": "^1.50.0"
    ```
    (Or current latest stable major; pin the major. After editing, run `npm install` from `paperboy-site/` so `package-lock.json` updates.)

  **3. One-shot validation:** Builder must run the smoke pass once locally to confirm exit 0:
  - Terminal A: `npm run dev` (or `npm run build && npm run start` for a production-like pass)
  - Terminal B: `BASE_URL=http://localhost:3000 npm run smoke`
  - Expect: `e2e smoke passed: 22 page-loads OK across 11 routes × 2 viewports`
  - If chromium isn't installed: `npx playwright install chromium` first.
  - Paste the smoke command output (last ~20 lines) into the reply.

  **Builder rules:**
  - **Site repo only.** Working tree: `paperboy-site/`. Branch: `master`. Do not touch the monorepo.
  - **Files to create (1 total):**
    1. `paperboy-site/scripts/e2e-smoke.mjs` (new e2e smoke pass, ~120 lines)
  - **Files to modify (1 total):**
    1. `paperboy-site/package.json` (add `smoke`, `smoke:mobile` scripts + `playwright` devDep)
    2. `paperboy-site/package-lock.json` (auto-updates after `npm install`; this is expected and acceptable)
  - Do **not** edit `paperboy-site/scripts/mobile-render-check.mjs` (keep the existing iPhone-only pass unchanged; the new `smoke:mobile` script just calls it).
  - Do **not** edit any file in `app/`, `components/`, `lib/`, or `public/`.
  - Do **not** add new screenshots to git (the `smoke-screenshots/` directory should be runtime-only; add it to `.gitignore` if it's not already covered).
  - Do **not** install browsers via package.json post-install scripts (let the developer run `npx playwright install chromium` once on first use).
  - The smoke script MUST exit 0 when run against a fresh `npm run dev` server with 7.1, 7.2, 6.5, 3.8 already landed (they all are — confirmed in `master`).
  - The smoke script MUST exit 1 with a `HOLD —` report if any route's smoke assertion fails (matches the `mobile-render-check.mjs` contract).
  - The smoke script MUST be runnable with no extra args beyond optionally setting `BASE_URL`.
  - Do **not** push the site repo. Commit locally only.

- Validation:

  ```bash
  cd /Users/edward/MSDev/projects/paperboy/paperboy-site

  # 1. Exactly 1 new file + 2 modified files
  git status --short
  # expected:
  #  M package.json
  #  M package-lock.json
  # ?? scripts/e2e-smoke.mjs

  # 2. New script exists
  ls -la scripts/e2e-smoke.mjs
  # expected: file present, ~80-150 lines

  # 3. mobile-render-check.mjs untouched
  git diff scripts/mobile-render-check.mjs
  # expected: empty

  # 4. Both npm scripts wired
  cat package.json | jq '.scripts.smoke, .scripts["smoke:mobile"]'
  # expected: two strings, both pointing at scripts/

  # 5. playwright in devDependencies
  cat package.json | jq '.devDependencies.playwright'
  # expected: a version string like "^1.50.0"

  # 6. No edits to UI code
  git diff app components lib public
  # expected: empty

  # 7. No monorepo changes
  cd /Users/edward/MSDev/projects/paperboy && git status --short
  # expected: only reviews/7.3/ artifacts + dashboard files; no other site-monorepo edits

  # 8. Smoke pass exits 0 against a running dev server
  # (Terminal A): npm run dev
  # (Terminal B):
  BASE_URL=http://localhost:3000 npm run smoke
  # expected last line: "e2e smoke passed: 22 page-loads OK across 11 routes × 2 viewports"
  # expected exit code: 0

  # 9. TypeScript still clean
  npx tsc --noEmit
  # expected: no output

  # 10. Build still green
  npm run build 2>&1 | tail -20
  # expected: "Compiled successfully" (Phase 7 work is preserved)
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 7.3.

**Objective:** Add a comprehensive end-to-end smoke pass for paperboy.run. Every route, every download/CTA link, every demo's mount point must be exercised on both mobile and desktop viewports via a single repeatable command.

**Files to create / edit (paperboy-site/ only):**

1. **`paperboy-site/scripts/e2e-smoke.mjs`** — Create a new Playwright script following the structure in Required Fix step 1. Iterate `ROUTES × VIEWPORTS` (11 × 2 = 22 page-loads). For each load: navigate (15s timeout, `networkidle`), screenshot to `smoke-screenshots/<viewport>-<route>.png`, run the global checks (innerText ≥ 200, no horizontal overflow, footer mailto present, no console errors/warnings, pill-width sanity on mobile), then run the route-specific checks for /, /a2, /a3, /a4, /a5, /viewer, /help. Collect failures into a list; if non-empty, `console.error("HOLD — e2e smoke regressions:\n...")` and `process.exit(1)`. Else print the success line and exit 0. Base URL via `BASE_URL` env (default `http://localhost:3000`).

2. **`paperboy-site/package.json`** — Add two scripts:
   - `"smoke": "node scripts/e2e-smoke.mjs"`
   - `"smoke:mobile": "node scripts/mobile-render-check.mjs"`
   Add `"playwright": "^1.50.0"` (or latest stable major) to `devDependencies`. Run `npm install` after editing.

**Do not edit:**
- `paperboy-site/scripts/mobile-render-check.mjs` (keep unchanged — the new `smoke:mobile` script just calls it)
- Anything in `paperboy-site/app/`, `components/`, `lib/`, or `public/`
- `paperboy-site/next.config.ts`, `tsconfig.json`, `eslint.config.mjs`
- Anything outside `paperboy-site/`
- Do not add Playwright browsers to `postinstall`

**Run once locally (or against a `npm run start` server) to confirm exit 0.** If Chromium isn't installed: `npx playwright install chromium`.

**Validate (run these from `paperboy-site/` and paste outputs into the reply):**

```bash
cd /Users/edward/MSDev/projects/paperboy/paperboy-site

git status --short
# expect: 2 M (package.json, package-lock.json) + 1 ?? (scripts/e2e-smoke.mjs)

ls -la scripts/e2e-smoke.mjs
# expect: file present

git diff scripts/mobile-render-check.mjs
# expect: empty

cat package.json | jq '.scripts.smoke, .scripts["smoke:mobile"]'
# expect: both keys present, both point to scripts/ files

cat package.json | jq '.devDependencies.playwright'
# expect: a version string

git diff app components lib public
# expect: empty

npx tsc --noEmit
# expect: no output

npm run build 2>&1 | tail -20
# expect: "Compiled successfully"

# Start dev server in a separate terminal, then:
BASE_URL=http://localhost:3000 npm run smoke 2>&1 | tail -10
# expect: "e2e smoke passed: 22 page-loads OK across 11 routes × 2 viewports"
```

When you reply, write `reviews/7.3/cursor-reply-turn-1.md` with: (a) the new `scripts/e2e-smoke.mjs` file contents verbatim; (b) the diff of `package.json` (just the `scripts` and `devDependencies` blocks); (c) the output of each validation command above, including the final `npm run smoke` tail; (d) confirmation that `git diff app components lib public` and `git diff scripts/mobile-render-check.mjs` are both empty.

## Consensus Checklist
- [ ] `scripts/e2e-smoke.mjs` exists and iterates `ROUTES = ["/", "/a2", "/a3", "/a4", "/a5", "/viewer", "/help", "/directory", "/privacy", "/terms", "/cookies"]` (11 entries)
- [ ] Script iterates `VIEWPORTS = [{name:"mobile", ...}, {name:"desktop", ...}]` (2 entries) — 22 page-loads total
- [ ] Each page-load asserts: innerText ≥ 200, no horizontal overflow (≤ 1px tolerance), no console error/warn, footer mailto present (`mailto:support@paperboy.run`)
- [ ] Mobile viewport additionally asserts no runaway `.pbw-toggle-pill` (≤ 45% of viewport)
- [ ] `/a2` asserts links to `https://github.com/proticom/paperboy/releases` AND `https://github.com/proticom/paperboy/tree/main/paperboy-app`
- [ ] `/a3` asserts link to `https://github.com/proticom/paperboy/releases?q=ext-v&expanded=true` AND OL ≥ 4 `<li>` (sideload steps from 6.5)
- [ ] `/a4` asserts page text contains `cdn.jsdelivr.net/npm/@proticom/paperboy-widget`
- [ ] `/a5` asserts page text contains `npm install -g @proticom/paperboy-cli`
- [ ] `/viewer` asserts a drop-target element exists (`input[type=file]`, `[data-drop-target]`, or `[aria-label*='drop' i]`)
- [ ] `/help` asserts link to `mailto:support@paperboy.run?subject=Ask%20The%20Editor`
- [ ] Failure mode: `console.error("HOLD — e2e smoke regressions:\n...")` + `process.exit(1)`
- [ ] Success mode: `console.log("e2e smoke passed: 22 page-loads OK ...")` + exit 0
- [ ] Screenshots written to `smoke-screenshots/<viewport>-<route>.png` per page-load
- [ ] `BASE_URL` env honored, defaults to `http://localhost:3000`
- [ ] `package.json` has new `smoke` AND `smoke:mobile` scripts
- [ ] `package.json` has `playwright` in `devDependencies`
- [ ] `package-lock.json` updated by `npm install`
- [ ] `scripts/mobile-render-check.mjs` untouched
- [ ] No edits to `app/`, `components/`, `lib/`, or `public/`
- [ ] `npx tsc --noEmit` succeeds
- [ ] `npm run build` succeeds (Phase 7 work preserved)
- [ ] `npm run smoke` exits 0 against a running dev server, prints the success line
- [ ] No monorepo changes
- [ ] `git status --short` shows exactly 2 M + 1 ?? (3 lines total)

## Decision
**send_to_builder.** Fresh task, no builder commit yet. 3-file scope in `paperboy-site/` only (1 new + 2 modified). New `scripts/e2e-smoke.mjs` covers all 11 routes × mobile + desktop viewports with global checks (blank/overflow/console/footer-mailto/mobile-pills) plus route-specific CTA + demo assertions tied to the 7.1, 6.5, 3.8 wiring. `package.json` adds two npm scripts (`smoke`, `smoke:mobile`) and pins `playwright` as a devDep. Existing `mobile-render-check.mjs` untouched. 24-item validation checklist.

## Notes
- Why a sibling script and not extending `mobile-render-check.mjs`: that script is purpose-built for iPhone-viewport render regression (overflow, pill widths, late-edition). Bolting CTA + demo + desktop onto it would muddy the original intent. The new `e2e-smoke.mjs` is the "comprehensive" pass; the old script remains the "did the iPhone render break?" canary.
- Why no CI wiring in 7.3: spec says "scripted pass on mobile + desktop viewports" — i.e. a repeatable local command. CI integration (Vercel preview check, GHA matrix) is Phase 8 hardening.
- Why no file-drop on `/viewer`: Playwright file-drop is fiddly across browsers and the smoke pass should be fast (~30-60s total). Presence of the drop-target element is sufficient signal; a failure to render the element catches the actual regression case.
- Why no cross-browser smoke: chromium is sufficient for v1 (matches the existing `mobile-render-check.mjs`). Future hardening can add firefox/webkit via Playwright matrices.
- Why the spec mentions `cursor-ide-browser` but we use Playwright: `cursor-ide-browser` is a Cursor-IDE MCP, not portable across machines or CI. Playwright is already used by `mobile-render-check.mjs`, ships as an npm package, and is the industry-standard pattern for headless smoke. The spec phrase is a suggestion, not a binding tool choice — the goal ("scripted pass on mobile + desktop viewports") is what matters.
- Phase 7 closes when 7.3 lands. After that, the only remaining reviewable items are the 4 deferred GATEs (5.3, 5.8, 5.9, 6.4) and any Phase 8 hardening tasks.
