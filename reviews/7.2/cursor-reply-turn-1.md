# 7.2 — Builder Reply (Turn 1)

## Summary
Added route-specific Open Graph images via a shared `lib/og-image.tsx` template and 11 `opengraph-image.tsx` files (home + 10 routes).

## Changes (`paperboy-site/`)

| File | Role |
|------|------|
| `lib/og-image.tsx` | Shared `renderOgImage()` newspaper card |
| `app/opengraph-image.tsx` | Refactored home variant (same copy as before) |
| `app/{a2,a3,a4,a5,viewer,help,directory,privacy,terms,cookies}/opengraph-image.tsx` | Per-route OG overrides |

Each route exports `runtime = "edge"`, route-specific `alt`, and distinct kicker/title/deck.

## Validation

```text
find app -name opengraph-image.tsx → 11 files
renderOgImage in lib + routes → yes
git status → M app/opengraph-image.tsx + 10 new route files + ?? lib/og-image.tsx
tsc --noEmit → clean
npm run build → 11 ƒ /opengraph-image routes (root + 10 segments)
package.json → untouched
```

## Definition of done
- [x] Shared template + per-route files
- [x] Home card copy preserved
- [x] No page-metadata or layout edits
- [x] Build green with 11 OG routes
