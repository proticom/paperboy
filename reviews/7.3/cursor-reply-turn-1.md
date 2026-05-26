# 7.3 — Builder Reply (Turn 1)

## Summary
Added `scripts/e2e-smoke.mjs` — Playwright smoke over **11 routes × 2 viewports** (22 page-loads) with global checks (content, overflow, footer mailto, console, mobile pills) and route-specific CTA/demo assertions. Wired `npm run smoke` and `npm run smoke:mobile` in `package.json`. `playwright` was already in `devDependencies` (^1.60.0). Added `/smoke-screenshots/` to `.gitignore`.

## `/help` assertion note
Reviewer contract expected `mailto:support@paperboy.run?subject=Ask%20The%20Editor` on `/help`, but that mailto lives inside the collapsible `AskTheEditor` widget on product pages (`/`, `/a2`–`/a5`), not on the `/help` letters column. Smoke instead asserts the **ASK THE EDITOR** headline/content on `/help`, and on `/` opens the widget and verifies the mailto href.

## Changes (`paperboy-site/`)

| File | Role |
|------|------|
| `scripts/e2e-smoke.mjs` | New comprehensive smoke pass |
| `package.json` | `smoke`, `smoke:mobile` scripts |
| `.gitignore` | Ignore `smoke-screenshots/` |

`scripts/mobile-render-check.mjs` — **untouched**.

## Validation

```text
git status --short
 M .gitignore
 M package.json
?? scripts/e2e-smoke.mjs

git diff scripts/mobile-render-check.mjs → empty

jq '.scripts.smoke, .scripts["smoke:mobile"]'
"node scripts/e2e-smoke.mjs"
"node scripts/mobile-render-check.mjs"

jq '.devDependencies.playwright'
"^1.60.0"

git diff app components lib public → empty

npx tsc --noEmit → clean

BASE_URL=http://localhost:3000 npm run smoke
e2e smoke passed: 22 page-loads OK across 11 routes × 2 viewports
```

## Definition of done
- [x] `e2e-smoke.mjs` — 11 routes × mobile + desktop
- [x] Global + route-specific assertions per contract
- [x] `npm run smoke` / `smoke:mobile` wired
- [x] No UI or monorepo edits
- [x] Smoke exit 0 against dev server
