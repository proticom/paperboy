# 7.3 — Review Turn 2

## Task Context
- Task id: 7.3
- Task title: End-to-end smoke pass on all routes
- Phase: Phase 7 — Site backend & polish
- Review status: waiting_for_reviewer → review_passed
- Turn: 2 of 4
- Builder: cursor (reply at `reviews/7.3/cursor-reply-turn-1.md`)
- Diff under review: `paperboy-site/` (branch `master`)
  - New: `scripts/e2e-smoke.mjs` (138 lines)
  - Modified: `package.json`, `.gitignore`
  - Unchanged: `scripts/mobile-render-check.mjs`, all `app/`/`components/`/`lib/`/`public/`

## Findings

### Finding 1: Smoke script structure matches contract (22 page-loads, exit-non-zero on failure)
- Severity: pass
- Evidence:
  - `ROUTES` array (lines 5–17) contains all 11 routes: `/`, `/a2`, `/a3`, `/a4`, `/a5`, `/viewer`, `/help`, `/directory`, `/privacy`, `/terms`, `/cookies`.
  - `VIEWPORTS` array (lines 18–21) contains 2 entries — `mobile` (390×844, isMobile=true) and `desktop` (1280×800, isMobile=false).
  - 11 × 2 = 22 page-loads per spec.
  - Global checks (lines 62–89): innerText ≥ 200, overflow ≤ 1px, footer mailto present, mobile pill widths ≤ 45% of viewport, no console error/warn.
  - Failure mode (lines 131–134): `console.error("HOLD — e2e smoke regressions:\n...")` + `process.exit(1)`.
  - Success mode (lines 135–137): logs `e2e smoke passed: 22 page-loads OK across 11 routes × 2 viewports`.
- `node --check scripts/e2e-smoke.mjs` → PARSE OK.

### Finding 2: Route-specific assertions tied to 7.1/6.5/3.8 wiring
- Severity: pass
- Evidence:
  - `/a2` (lines 91–95): asserts both `DESKTOP_RELEASES` and `DESKTOP_BUILD` link presence (matches `lib/distribution.ts`).
  - `/a3` (lines 96–100): asserts `EXT_RELEASES` filtered URL and OL ≥ 4 `<li>` (matches 6.5 sideload contract).
  - `/a4` (lines 101–103): asserts page text contains `cdn.jsdelivr.net/npm/@proticom/paperboy-widget` (matches 3.8).
  - `/a5` (lines 104–106): asserts `npm install -g @proticom/paperboy-cli` substring (matches 3.8).
  - `/viewer` (lines 107–109): asserts `input[type=file]` count ≥ 1.
  - `/help` + `/` (lines 110–121): deviation from contract — see Finding 3.

### Finding 3: Accepted deviation — AskTheEditor mailto check moved from `/help` to `/`
- Severity: pass (deviation justified and verified)
- Contract expected: `/help` asserts mailto `mailto:support@paperboy.run?subject=Ask%20The%20Editor`.
- Actual implementation: `/help` asserts the "ASK THE EDITOR" headline only; `/` clicks the AskTheEditor open button and then asserts the mailto href.
- Verification: `grep -rn "AskTheEditor" app/` shows `AskTheEditor` is imported only by `app/page.tsx` (line 7 + line 205 render). The `/help` route only renders the literal text "ASK THE EDITOR" as part of its letters-column content (`app/help/page.tsx:46`). The contract's `/help` expectation was based on a misread; cursor's deviation is the correct interpretation of where the widget actually lives.
- Net effect: the same canonical mailto string (`mailto:support@paperboy.run?subject=Ask%20The%20Editor`) is still asserted by the smoke pass, just on the page where the widget actually mounts.

### Finding 4: Package wiring + .gitignore correct
- Severity: pass
- `package.json`:
  - `scripts.smoke` = `node scripts/e2e-smoke.mjs`
  - `scripts["smoke:mobile"]` = `node scripts/mobile-render-check.mjs`
  - `devDependencies.playwright` = `^1.60.0` (already present; not freshly added but pinned)
- `.gitignore`: added `/smoke-screenshots/` (matches `/mobile-screenshots/` convention).
- `scripts/mobile-render-check.mjs` untouched (verified `git diff` empty).
- `git status --short` shows exactly 3 lines: `M .gitignore`, `M package.json`, `?? scripts/e2e-smoke.mjs`.

### Finding 5: No scope creep
- Severity: pass
- `git diff app components lib public` empty — no UI code touched.
- No monorepo changes for this task.
- Cursor's reply also confirms `npm run smoke` passed 22 page-loads against a running dev server with exit code 0.

- Required fix: None — all five findings pass. No further builder work required for 7.3.

- Validation:

```bash
cd /Users/edward/MSDev/projects/paperboy/paperboy-site

git status --short
# M .gitignore
# M package.json
# ?? scripts/e2e-smoke.mjs

node --check scripts/e2e-smoke.mjs
# PARSE OK

jq '.scripts.smoke, .scripts["smoke:mobile"], .devDependencies.playwright' package.json
# "node scripts/e2e-smoke.mjs"
# "node scripts/mobile-render-check.mjs"
# "^1.60.0"

git diff scripts/mobile-render-check.mjs
# (empty)

git diff app components lib public
# (empty)

grep -n "process.exit\|console.error" scripts/e2e-smoke.mjs
# 132:  console.error("HOLD — e2e smoke regressions:\n" + ...)
# 133:  process.exit(1);

grep -c "^/smoke-screenshots/" .gitignore
# 1

grep -rn "AskTheEditor" app/
# app/page.tsx:7:import { AskTheEditor } from "@/components/AskTheEditor";
# app/page.tsx:205:            <AskTheEditor />
# (no /help mount — deviation is correct)
```

Cursor's reply confirms `BASE_URL=http://localhost:3000 npm run smoke` exit 0 with `e2e smoke passed: 22 page-loads OK across 11 routes × 2 viewports`.

## Builder Prompt
N/A — task closing.

## Consensus Checklist
- [x] `scripts/e2e-smoke.mjs` exists, 11 routes × 2 viewports = 22 page-loads
- [x] Global checks: innerText ≥ 200, no overflow, footer mailto, mobile pills, no console issues
- [x] Route-specific checks for `/a2`, `/a3`, `/a4`, `/a5`, `/viewer`, `/help`, `/`
- [x] AskTheEditor mailto asserted on `/` (not `/help` — accepted deviation, mailto string still verified)
- [x] Failure mode: `HOLD —` + `process.exit(1)`
- [x] Success mode: logs `22 page-loads OK` + exits 0
- [x] `BASE_URL` env honored, default `http://localhost:3000`
- [x] `package.json` has `smoke` + `smoke:mobile` scripts; `playwright` in devDependencies
- [x] `scripts/mobile-render-check.mjs` untouched
- [x] No edits to `app/`, `components/`, `lib/`, `public/`
- [x] `.gitignore` covers `/smoke-screenshots/`
- [x] `npm run smoke` exits 0 against running dev server (per cursor reply)
- [x] No monorepo changes

## Decision
**review_passed.** 7.3 lands as specified. The contract-versus-implementation deviation (`/help` headline-only, `/` widget-click for mailto) is the correct read of the codebase — the AskTheEditor widget is mounted only on `app/page.tsx`. The same canonical mailto string is still asserted by the smoke pass. Script parses cleanly, exit semantics match (process.exit(1) on failures, exit 0 with success line on pass), and cursor's local run produced the expected `22 page-loads OK` line.

## Notes
- Phase 7 closes with 7.3. The smoke pass becomes the canonical "did anything user-facing break?" guardrail; the existing `mobile-render-check.mjs` remains the iPhone-viewport canary (`npm run smoke:mobile`).
- Future hardening (CI wiring, cross-browser, real file-drop on /viewer) is Phase 8 or later.
- Activator next picks 8.1 — `paperboy-converter` test additions per `paperboy-spec-tasks.json` Phase 8 group.
