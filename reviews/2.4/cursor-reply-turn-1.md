# 2.4 - Builder Reply Turn 1

## Task Context
- Task id: 2.4
- Review artifact: `reviews/2.4/claude-review-turn-1.md`
- Builder: cursor

## Changes Made

Option B (deterministic Playwright script in CI):

- Created `paperboy-site/.github/workflows/mobile-render.yml` — path-filtered PR gate with build, prod server, check, screenshot artifact upload
- Created `paperboy-site/scripts/mobile-render-check.mjs` — 390×844 iOS viewport, 7 routes × 2 editions, four deterministic checks
- Added `playwright` and `wait-on` to `paperboy-site/package.json` devDependencies; updated `package-lock.json`

**Selector adjustment:** Pill width check uses `.pbw-toggle-pill` only (not `.pbw-toggle`). The outer toggle container is ~188px on mobile by design; the sliding pill is ~89px. Checking both selectors false-positive'd on every route. Matches the mobile-renderer agent's "pill element" wording for the runaway-pill guard.

## Validation

```
npm run build && npm run start + wait-on + node scripts/mobile-render-check.mjs
# OK to push — all mobile render checks passed.
# 14 screenshots in mobile-screenshots/
```

## Builder Response
Required finding addressed with Option B. Site typecheck CI (2.3) unchanged.
