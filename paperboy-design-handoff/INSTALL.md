# Paperboy — 404 + Site Directory handoff

Three files. Drop them straight into `paperboy-site/app/`.

```
paperboy-site/app/
  not-found.tsx               ← new
  directory/
    page.tsx                  ← new
  sitemap.ts                  ← new (SEO; replaces any existing one)
```

## What each file does

### `app/not-found.tsx` — the 404 page
- Next.js App Router auto-routes every unmatched URL to this file.
- "Return to Sender / Dead Letter Office" treatment — telegram block on the left, editorial body in the middle, "Also in Today's Times" on the right.
- Reads the missing URL with `usePathname()` and slots it into three places (telegram envelope, editorial inline code, body copy).
- "Cable the Editor" CTA opens the existing `AskTheEditor` modal via `useSiteUi().setAskEditorOpen(true)` — same as the footer's Contact Editor link.

### `app/directory/page.tsx` — the site map
- New route at `/directory`.
- "Plan of the Premises" — cutaway architectural drawing of the Paperboy newsroom, with every public route as a labeled, clickable room.
- Below the plan: a typeset three-column index with dotted leaders. Accessible, scannable, and works as a fallback if SVG fails.
- Floor plan uses your existing `--color-ink` / `--color-paper` CSS vars, so Late Edition inverts the whole drawing for free.

### `app/sitemap.ts` — the SEO sitemap
- Generates `/sitemap.xml` (App Router metadata route).
- Lists every public route with `changeFrequency` and `priority` set sensibly for a marketing site (front page weekly, product pages monthly, legal pages yearly).
- Includes the new `/directory` route.
- If you already have an `app/sitemap.ts`, diff first and merge what you need.

## Wiring up

**1. Add a "Site Directory" link in `components/Footer.tsx`**

In the "Directory & Resources" nav, somewhere near the other in-site links:

```tsx
<Link
  href="/directory"
  className="hover:bg-ink hover:text-paper px-1 -mx-1 transition-colors underline decoration-1 underline-offset-4"
>
  Site Directory
</Link>
```

**2. Drop `robots.txt` a hint about the sitemap (optional)**

If you have a `public/robots.txt`, add:

```
Sitemap: https://paperboy.run/sitemap.xml
```

Or generate it with `app/robots.ts`:

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://paperboy.run/sitemap.xml",
  };
}
```

## Notes

- Both pages are client components (`"use client"`) so they can use `usePathname()` and `useSiteUi()`. The site layout (`app/layout.tsx`) keeps providers, masthead toggle mount, footer, etc. wrapped around them, so nothing else needs to change.
- Both pages call `<InteriorHeader pageLabel="..." />` (with labels `"Page Not Found"` and `"Site Directory"`) so the back-to-front-page link in the masthead is correctly announced for screen readers.
- Both pages are wrapped in `<PageMarkdownView>` so the paperboy-widget toggle still works — readers can see the 404 or the directory as either the broadsheet view or as raw markdown, same as the rest of the site.
- No new dependencies. Tailwind, your fonts (Canterbury, IM Fell English, Courier Prime), and your theme tokens do all the styling work.
