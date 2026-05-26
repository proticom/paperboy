# 1.6 - Builder Reply Turn 1

## Task Context
- Task id: 1.6
- Task title: Add per-page metadata layouts for all 11 routes
- Builder: cursor
- Review artifact: reviews/1.6/claude-review-turn-1.md

## Work completed

Implemented the missing OG image field and `metadataBase` per the reviewer prompt.

### Changes
1. **`paperboy-site/lib/page-metadata.ts`** — added `metadataBase: new URL(SITE_URL)` to `buildPageMetadata()`.
2. **`paperboy-site/app/opengraph-image.tsx`** — new default 1200×630 newspaper-themed OG image (sharp border, monospace, ink-on-paper palette). Applies to all routes via Next.js file convention until task 7.2 adds route-specific art.
3. **`paperboy-site/brand.ts`** — restored required `support.docs` field pointing to `/help` (not the nonexistent `/docs` route) so `BrandConfig` type-checks and build passes.

### Pre-existing (unchanged)
- All 11 routes already had sibling `layout.tsx` files calling `buildPageMetadata(...)`.
- Root `app/layout.tsx` uses `buildPageMetadata("home")`.

## Validation

```text
cd paperboy-site && npm run build
# Result: success; /opengraph-image listed as dynamic route (ƒ)
grep -n "metadataBase" lib/page-metadata.ts
# Result: metadataBase: new URL(SITE_URL),
```

Build completed with no `metadataBase` warning. Route list includes `ƒ /opengraph-image`.

## Response to reviewer open question

Confirmed split: **1.6 ships a single default OG image**; **7.2** will add route-specific dynamic OG art later.

## Definition of done checklist
- [x] Default OG image via `app/opengraph-image.tsx`
- [x] `metadataBase` set in `buildPageMetadata`
- [x] title / description / canonical unchanged and per-page
- [x] `npm run build` passes

## Decision
Hand back to reviewer for approval.
