# 2.4 - Review Turn 1

## Task Context
- Task id: 2.4
- Task title: Add a mobile-renderer invocation on the site repo's CI for PRs touching render paths
- Dashboard implementation status: todo (in spec) — verified NOT done
- Review status: in_review → waiting_for_builder
- Spec sections: Phase 2 item **2.4**
- Files inspected:
  - `.claude/agents/mobile-renderer.md` (agent definition + checks + render paths)
  - `paperboy-site/.github/workflows/ci.yml` (typecheck job only, from 2.3)
- Commands run:
  - `find . -iname "*mobile-renderer*"` → `.claude/agents/mobile-renderer.md`
  - `cat paperboy-site/.github/workflows/ci.yml`
- Current claim being verified: the site CI runs the mobile-renderer checks on PRs touching the
  listed render paths.

## Findings

### Finding 1: no mobile-render gate in the site CI; agent isn't directly CI-runnable
- Severity: required
- Location: `paperboy-site/.github/workflows/` (no mobile-render workflow)
- Problem: `mobile-renderer` is a Claude Code subagent that drives the **Playwright MCP** and uses
  LLM judgment. It cannot be invoked verbatim in GitHub Actions (no MCP, needs an API key, costs
  tokens per PR, and is non-deterministic). However, every concrete check it performs is
  deterministic and portable to a headless Playwright script:
  - `document.body.innerText.length > 200` (blank-page guard)
  - `document.body.scrollWidth - window.innerWidth <= 0` (horizontal-overflow guard)
  - widget pill width not ≈ 50% of viewport (runaway-pill guard)
  - no console `error`/`warn` messages
  - one screenshot per route per edition, for human review
  …at 390×844 (iPhone 12 Pro), in Morning and Late editions, for the agent's default routes.
- Spec mismatch / risk: without this, the mobile-Safari regressions the agent exists to catch
  (blank body from SVG filters, runaway widget pill, dark-mode breakage, overflow) can merge.
- Required fix: add a path-filtered `mobile-render.yml` workflow + a `scripts/mobile-render-check.mjs`
  Playwright script to the site repo (a separate workflow file so the `paths:` filter scopes only
  this gate, leaving 2.3's typecheck always-on). Use the Next.js production server in CI.
- Code sample / exact change:

`paperboy-site/.github/workflows/mobile-render.yml` (new):
```yaml
name: Mobile render check

on:
  pull_request:
    paths:
      - "app/globals.css"
      - "app/layout.tsx"
      - "components/Masthead.tsx"
      - "components/ScopedMarkdownView.tsx"
      - "app/page.tsx"
      - "app/**/page.tsx"

jobs:
  mobile-render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Use Node.js 24
        uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: package-lock.json
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium
      - name: Build
        run: npm run build
      - name: Start server
        run: npm run start &
      - name: Wait for server
        run: npx wait-on http://localhost:3000
      - name: Mobile render check
        run: node scripts/mobile-render-check.mjs
      - name: Upload screenshots
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mobile-screenshots
          path: mobile-screenshots/
```

`paperboy-site/scripts/mobile-render-check.mjs` (new):
```js
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ROUTES = ["/", "/a2", "/a3", "/a4", "/a5", "/help", "/viewer"];
const OUT = "mobile-screenshots";
mkdirSync(OUT, { recursive: true });

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const failures = [];
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: IOS_UA,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

for (const edition of ["morning", "late"]) {
  for (const route of ROUTES) {
    const page = await context.newPage();
    const consoleIssues = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") consoleIssues.push(m.text());
    });
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    if (edition === "late") {
      await page.evaluate(() => document.documentElement.classList.add("late-edition"));
      await page.waitForTimeout(300);
    }
    const m = await page.evaluate(() => ({
      textLen: document.body.innerText.length,
      overflow: document.body.scrollWidth - window.innerWidth,
      innerWidth: window.innerWidth,
      pillWidths: [...document.querySelectorAll(".pbw-toggle, .pbw-toggle-pill")].map(
        (el) => el.getBoundingClientRect().width,
      ),
    }));
    const tag = `${(route.replace(/\//g, "_") || "_home")}-${edition}`;
    await page.screenshot({ path: `${OUT}/${tag}.png` });

    if (m.textLen < 200) failures.push(`${tag}: blank page (innerText ${m.textLen})`);
    if (m.overflow > 0) failures.push(`${tag}: horizontal overflow (+${m.overflow}px)`);
    for (const w of m.pillWidths)
      if (w > m.innerWidth * 0.45)
        failures.push(`${tag}: runaway pill (${Math.round(w)}px of ${m.innerWidth})`);
    if (consoleIssues.length)
      failures.push(`${tag}: ${consoleIssues.length} console error/warn — ${consoleIssues[0]}`);
    await page.close();
  }
}
await browser.close();

if (failures.length) {
  console.error("HOLD — mobile render regressions:\n" + failures.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
console.log("OK to push — all mobile render checks passed.");
```

Also add devDependencies to `paperboy-site/package.json`: `playwright` and `wait-on`.
- Validation:
```
cd paperboy-site
npm i -D playwright wait-on && npx playwright install chromium
npm run build && (npm run start &) && npx wait-on http://localhost:3000
node scripts/mobile-render-check.mjs   # exit 0 on a clean tree; prints "OK to push"
ls mobile-screenshots/                  # 14 screenshots (7 routes x 2 editions)
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: gate the site CI on the mobile-renderer's deterministic checks for PRs touching the
render paths, uploading screenshots as artifacts for human review.

Files to edit:
- create `paperboy-site/.github/workflows/mobile-render.yml` (content above)
- create `paperboy-site/scripts/mobile-render-check.mjs` (content above)
- `paperboy-site/package.json` — add `playwright` and `wait-on` to devDependencies; run
  `npm install` so `package-lock.json` updates

Files not to edit:
- `paperboy-site/.github/workflows/ci.yml` (2.3 typecheck job stays separate and always-on)
- `.claude/agents/mobile-renderer.md` (the interactive agent stays for local use)

Exact changes: as in the code samples. The `paths:` filter must include
`app/globals.css`, `app/layout.tsx`, `components/Masthead.tsx`,
`components/ScopedMarkdownView.tsx`, and `app/**/page.tsx` (+ `app/page.tsx` for the home route).

Data shapes / CLI examples: viewport 390×844, iOS Safari UA, routes
`/ /a2 /a3 /a4 /a5 /help /viewer`, both editions; thresholds: innerText > 200, overflow ≤ 0,
pill width < 45% of viewport, zero console error/warn.

Tests to add or update: the script IS the check; no separate unit test.

Commands to run: the Validation block above (locally, to confirm exit 0 + 14 screenshots).

Definition of done:
- `mobile-render.yml` triggers only on PRs touching the listed paths.
- `scripts/mobile-render-check.mjs` runs the four deterministic checks in both editions across the
  default routes, exits non-zero on any regression, and writes screenshots to `mobile-screenshots/`.
- CI uploads `mobile-screenshots/` as an artifact (always, even on failure).
- Local run is green on the current tree.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A blockers; the required finding has a full fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Approach fork: this prompt ports the mobile-renderer's deterministic checks into CI (Option B —
  reliable, no API key, no per-PR token cost). The literal alternative (Option A) is to run the
  actual Claude `mobile-renderer` agent in CI via `anthropics/claude-code-action` against the
  Vercel preview URL, which needs an `ANTHROPIC_API_KEY` secret and costs tokens per PR. If you
  prefer Option A, say so in your reply and I'll revise the contract; otherwise proceed with B.

## Decision
send_to_builder
