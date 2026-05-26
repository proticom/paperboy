# 1.6 - Review Turn 1

## Task Context
- Task id: 1.6
- Task title: Add per-page metadata (title, description, OG image, canonical) to all 11 routes
- Dashboard implementation status: todo (in spec) — verified partially satisfied in code
- Review status: in_review → waiting_for_builder
- Spec sections: Phase 1 — Truth & content fixes; plan item **1.6**
  (note overlap with Phase 7 item **7.2** "Generate dynamic OG images via app/opengraph-image.tsx")
- Files inspected:
  - `paperboy-site/lib/page-metadata.ts` (the `buildPageMetadata` helper)
  - `paperboy-site/app/layout.tsx` and all 11 route `layout.tsx` files
  - `paperboy-site/app/` (checked for file-based `opengraph-image` / `twitter-image`)
- Commands run:
  - `find app -name page.tsx` → 11 routes
  - `grep -rlnE "export const metadata|generateMetadata|buildPageMetadata" app` → all 11 routes covered via sibling `layout.tsx`
  - `find app -iname "opengraph-image*" -o -iname "twitter-image*"` → none
  - `grep -rn "metadataBase|images:" app lib` → none in metadata config
- Current claim being verified: every route exposes title, description, OG image, and canonical.

## Findings

### Finding 1: OG image field is missing (3 of 4 named metadata fields are present)
- Severity: required
- Location: `paperboy-site/lib/page-metadata.ts` (`buildPageMetadata`, lines 82-99); also the
  absence of any file-based `app/opengraph-image.*`.
- Problem: Task 1.6 names four fields — **title, description, OG image, canonical**. Three are
  fully and well implemented across all 11 routes:
  - title ✓ (per-page, `PAGES[key].title`)
  - description ✓ (per-page)
  - canonical ✓ (`alternates: { canonical: url }`)
  The fourth, **OG image**, is absent:
  - `openGraph` has no `images` array.
  - There is no file-based `app/opengraph-image.tsx` / `.png`, so Next.js generates no default
    OG image either.
  - `twitter.card` is set to `"summary_large_image"` but no image is provided — this declares a
    large-image card that no crawler can populate (it will fall back to a plain summary).
  - No `metadataBase` is set, which Next.js needs to resolve relative OG/twitter image URLs to
    absolute ones once an image is added (and it warns at build time when images are relative).
- Spec mismatch / risk: Social/link unfurls (Slack, iMessage, X, LinkedIn, Discord) will show no
  preview image for any route, and the `summary_large_image` card is half-configured. This is the
  one explicitly-named field of 1.6 that is not delivered.
- Required fix: provide a baseline OG image for all routes and make image URLs resolvable. The
  cheapest correct approach is the Next.js file convention — a single default
  `app/opengraph-image.tsx` (newspaper-themed) plus a `metadataBase`. Route-specific *dynamic* OG
  art is the dedicated deliverable of Phase 7 item 7.2, so 1.6 only needs a working default; 7.2
  upgrades it to per-route art later. (Alternatively, if the team prefers to defer ALL imagery to
  7.2, downgrade `twitter.card` to `"summary"` for now and add `metadataBase`, so nothing is
  half-configured — but a single default OG image is the higher-value path.)
- Code sample / exact change:
```tsx
// app/opengraph-image.tsx  (new file — one default OG image for every route)
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Paperboy — All the Markdown That's Fit to Print";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex",
        flexDirection: "column", justifyContent: "center", padding: 80,
        background: "#0a0a0a", color: "#fafafa", fontFamily: "monospace" }}>
        <div style={{ fontSize: 28, letterSpacing: 4, opacity: 0.7 }}>PAPERBOY.RUN</div>
        <div style={{ fontSize: 72, fontWeight: 700, marginTop: 24, lineHeight: 1.05 }}>
          All the Markdown That&rsquo;s Fit to Print
        </div>
      </div>
    ),
    { ...size }
  );
}
```
```ts
// lib/page-metadata.ts — add metadataBase so image/og URLs resolve to absolute:
export function buildPageMetadata(key: keyof typeof PAGES): Metadata {
  const page = PAGES[key];
  const url = `${SITE_URL}${page.path}`;
  return {
    metadataBase: new URL(SITE_URL),   // <-- add this
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: { title: page.title, description: page.description, url,
      siteName: "Paperboy.run", type: "website", locale: "en_US" },
    twitter: { card: "summary_large_image", title: page.title, description: page.description },
  };
}
```
- Validation:
```
npm run build   # expect no "metadataBase property ... not set" warning
# After build, confirm the default OG image route resolves:
#   curl -I http://localhost:3000/opengraph-image  -> 200 image/png
grep -n "metadataBase" lib/page-metadata.ts
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: deliver the one missing field of task 1.6 — an OG image — so all four named metadata
fields (title, description, OG image, canonical) are satisfied for all 11 routes, without
double-booking the route-specific dynamic OG work that belongs to Phase 7 item 7.2.

Files to edit:
- `paperboy-site/app/opengraph-image.tsx` (new — a single newspaper-themed default OG image)
- `paperboy-site/lib/page-metadata.ts` (add `metadataBase: new URL(SITE_URL)`)

Files not to edit:
- The 11 route `layout.tsx` files — they already correctly call `buildPageMetadata(...)`.
- Do NOT build route-specific dynamic OG variants here; that is task 7.2.

Exact changes: use the two code samples above verbatim (adjust styling to the brutalist
newspaper aesthetic — sharp corners, monospace, dark default; no emoji).

Data shapes / CLI examples: OG image must be 1200x630 PNG (`size` export above).

Tests to add or update: none required (no test specified for 1.6). If trivial, a smoke assertion
that `/opengraph-image` returns 200 is welcome but optional.

Commands to run:
- `npm run build` (must be warning-free re: metadataBase)
- `npm run dev` then `curl -I http://localhost:3000/opengraph-image` → `200`, `content-type: image/png`

Definition of done:
- A default OG image renders for every route (file-based `app/opengraph-image.tsx`).
- `metadataBase` is set; build emits no metadataBase warning.
- `twitter.card: summary_large_image` now has a backing image (via the default OG image).
- title/description/canonical remain unchanged and per-page.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A, no blockers; one required finding
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Confirm the 1.6 / 7.2 split: 1.6 ships a single default OG image (this prompt); 7.2 later
  upgrades to route-specific dynamic art. If you'd rather defer ALL imagery to 7.2, reply with
  that decision and instead set `twitter.card: "summary"` + add `metadataBase` only.

## Decision
send_to_builder
