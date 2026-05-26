# 7.2 — Review Turn 1

## Task Context
- Task id: 7.2
- Task title: Add dynamic OG images per route
- Dashboard implementation status: in_progress (queue auto-activated 7.2 when 7.1 closed)
- Review status: in_review → waiting_for_builder
- Phase: Phase 7 — Site backend & polish
- Spec section (verbatim from `/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md` line 152):
  > "**7.2** Generate dynamic OG images via [app/opengraph-image.tsx](paperboy-site/app/opengraph-image.tsx) — newspaper-themed, route-specific."
- Phase context (plan line 24):
  > "Phase 7 — Site backend (Ask The Editor wired), OG images, end-to-end smoke pass"
- Related context (verified):
  - **Site repo:** `/Users/edward/MSDev/projects/paperboy/paperboy-site` (branch `master`). All edits for 7.2 land in the site repo, not the monorepo.
  - **Existing default OG image** (`app/opengraph-image.tsx`, 75 lines, `runtime = "edge"`, 1200x630, `image/png`): Newspaper-themed dark card with masthead "Paperboy.run · Vol. I", H1 "All the Markdown That's Fit to Print", deck "Desktop · Extension · CLI · Widget", and rule "Open source · No clutter". This is the **fallback** for any route that doesn't override it — `next build` reports `ƒ /opengraph-image` (dynamic route).
  - **Per-route metadata helper** (`lib/page-metadata.ts:11-76`): A `PAGES` map with 11 entries: `home`, `a2`, `a3`, `a4`, `a5`, `viewer`, `help`, `directory`, `privacy`, `terms`, `cookies`. Each entry has `title`, `description`, `path`. The `buildPageMetadata(key)` factory returns the full Metadata object, including `openGraph.title`/`description`/`url`. The OG image is **not** explicitly listed in the helper — it's currently inherited from the root file convention.
  - **Per-route layouts hold metadata** (one layout per route, all wired to `buildPageMetadata("<key>")`):
    - `app/layout.tsx:47` → `buildPageMetadata("home")`
    - `app/a2/layout.tsx:4` → `buildPageMetadata("a2")`
    - `app/a3/layout.tsx:4` → `buildPageMetadata("a3")`
    - `app/a4/layout.tsx:4` → `buildPageMetadata("a4")`
    - `app/a5/layout.tsx:4` → `buildPageMetadata("a5")`
    - `app/viewer/layout.tsx:4` → `buildPageMetadata("viewer")`
    - `app/help/layout.tsx:4` → `buildPageMetadata("help")`
    - `app/directory/layout.tsx:4` → `buildPageMetadata("directory")`
    - `app/privacy/layout.tsx:4` → `buildPageMetadata("privacy")`
    - `app/terms/layout.tsx:4` → `buildPageMetadata("terms")`
    - `app/cookies/layout.tsx:4` → `buildPageMetadata("cookies")`
  - **Next 16 OG file convention** (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md`):
    - Each route segment can have its own `opengraph-image.tsx` that default-exports a function returning `ImageResponse`. Next.js automatically attaches `<meta property="og:image">` to that segment's `<head>`. Cached/statically optimized by default. v16 quirk: `params` is now a Promise.
    - **A per-route file overrides the root file** for that segment.
    - Required exports: `alt: string`, `size: {width, height}`, `contentType: string` (per the docs spec).
    - The default export can be `async` and use fonts loaded via `node:fs/promises`.
  - **Fonts available locally** (`app/fonts/`): `Canterbury.ttf` (display blackletter), `IMFellEnglish-Regular.ttf`, `IMFellEnglish-Italic.ttf`. Plus Google Fonts `Courier_Prime`, `Inter` loaded via `next/font/google` (these aren't directly usable in `next/og` without local files; `next/og` requires either a system/inlined font or a base64'd local font file). The existing root OG card uses `fontFamily: "monospace"` (Satori's built-in fallback) — works without font loading.
  - **`next/og` runtime constraints** (per Next 16 docs and current root file):
    - `export const runtime = "edge"` is allowed but **not required** in v16; Next 16 supports both edge and node runtime for OG images. The existing root file uses `"edge"`.
    - For consistency with the existing root file, **per-route variants should also use `runtime = "edge"`** unless a clear reason emerges to use node.
    - `ImageResponse` accepts JSX with Satori-supported CSS (subset: flexbox only, no grid; specific font-loading API).
  - **No twitter-image.tsx exists.** Twitter inherits OG image when only `summary_large_image` card is set (which `lib/page-metadata.ts:96` already does). Twitter-specific images are **out of scope** for 7.2.
  - **`metadataBase`** already set to `https://paperboy.run` in `buildPageMetadata` — the absolute URL Next 16 needs to resolve OG image paths is in place.
  - **No existing `reviews/7.2/` artifacts**: this is turn 1.

- Files inspected:
  - `paperboy-site/app/opengraph-image.tsx` (existing root, 75 lines)
  - `paperboy-site/app/layout.tsx` (root)
  - `paperboy-site/app/a3/layout.tsx` (representative route layout)
  - `paperboy-site/lib/page-metadata.ts` (full 103-line metadata helper)
  - `paperboy-site/app/fonts/` (Canterbury, IMFellEnglish locals)
  - `paperboy-site/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md`
  - Plan lines 24, 152
- Commands run (turn 1, read-only):
  ```bash
  $ find app -name "opengraph-image*" -o -name "twitter-image*"
  # → app/opengraph-image.tsx only

  $ grep -rn "generateMetadata\|export const metadata" app
  # → 11 layouts each wired to buildPageMetadata(<key>)

  $ grep -nE "^  [a-z0-9]+:" lib/page-metadata.ts
  # → 11 PAGES keys: home, a2, a3, a4, a5, viewer, help, directory, privacy, terms, cookies

  $ ls app/fonts/
  # → Canterbury.ttf, IMFellEnglish-{Regular,Italic}.ttf
  ```
- Current claim being verified: 7.2 turn 1, queue token `7.2-0001`. Fresh task, no builder commit yet.

## Findings

### Finding 1: Per-route OG image overrides via a shared `lib/og-image.tsx` JSX template + 10 thin per-route `opengraph-image.tsx` files.

- Severity: required (this is the entire body of work for 7.2)
- Location:
  - **New file** `paperboy-site/lib/og-image.tsx` — a single shared JSX template that takes per-route copy and renders the newspaper-themed card.
  - **Modify** `paperboy-site/app/opengraph-image.tsx` — refactor to use the shared template, passing `home` copy.
  - **New files (10 total)** — one per non-home route:
    - `paperboy-site/app/a2/opengraph-image.tsx`
    - `paperboy-site/app/a3/opengraph-image.tsx`
    - `paperboy-site/app/a4/opengraph-image.tsx`
    - `paperboy-site/app/a5/opengraph-image.tsx`
    - `paperboy-site/app/viewer/opengraph-image.tsx`
    - `paperboy-site/app/help/opengraph-image.tsx`
    - `paperboy-site/app/directory/opengraph-image.tsx`
    - `paperboy-site/app/privacy/opengraph-image.tsx`
    - `paperboy-site/app/terms/opengraph-image.tsx`
    - `paperboy-site/app/cookies/opengraph-image.tsx`

- Problem (current state):
  1. Every route on paperboy.run currently shares the **same** OG image (the root default), so a link to `/a2` (Desktop Editor), `/a4` (Web Widget), or `/help` (Ask the Editor) preview-cards identically on Twitter, Slack, Discord, etc. as the homepage. This defeats the purpose of per-route social previews.
  2. The site already invests in per-route titles + descriptions via `buildPageMetadata`, so the OG image is the only piece of the social preview that isn't route-specific — a noticeable gap.
  3. The fix is well-supported by Next 16 file conventions: drop an `opengraph-image.tsx` into each route segment and Next auto-attaches `<meta property="og:image">` for that route.

- Why one shared template + 10 thin files, not 11 fully-duplicated files:
  - The newspaper aesthetic (dark `#1A1A1A` paper, `#F4F1EA` ink, masthead, deck, rule) should be consistent across all routes — only the H1 and deck copy differ per route. Duplicating ~60 lines of JSX 11× is unmaintainable and a brand-drift risk.
  - A single `lib/og-image.tsx` exports a `renderOgImage({ title, kicker, deck })` function that returns `ImageResponse`. Each per-route file is ~10 lines: imports, required `alt`/`size`/`contentType` consts, and a one-liner default export that calls `renderOgImage` with the route-specific copy.
  - This matches the established `lib/page-metadata.ts` pattern (one source of truth for per-route copy).

- Spec mismatch / risk:
  - **In scope (7.2):**
    1. Create `paperboy-site/lib/og-image.tsx` with a `renderOgImage({ kicker, title, deck })` factory function exporting an `ImageResponse`.
    2. Refactor `paperboy-site/app/opengraph-image.tsx` to call `renderOgImage` with home copy. The visible card output should be **byte-equivalent** to today for the home route — same masthead, headline, deck, rule.
    3. Create 10 new `opengraph-image.tsx` files (one per non-home route) — each ~10 lines, calling `renderOgImage` with its route's copy.
  - **Out of scope (7.2, defer if proposed):**
    - Adding `twitter-image.tsx` files (Twitter inherits OG image when card type is `summary_large_image`, which is already set).
    - Changing `lib/page-metadata.ts` (the existing OG title/description/url are sufficient; per-route OG image is auto-picked-up by Next via the file convention).
    - Changing root `app/layout.tsx` or any per-route `layout.tsx` (no metadata edits needed).
    - Adding `app/<route>/opengraph-image.alt.txt` files (the `alt` is exported from each `.tsx` file directly).
    - Loading custom fonts (Canterbury / IMFellEnglish blackletter) into the OG card — Satori needs base64-loaded fonts and the per-OG ~50KB hit per file is not justified for v0.1; keep the existing `fontFamily: "monospace"` for now. A future enhancement can add font loading.
    - Touching `package.json`, `package-lock.json`, or any dep.
    - Adding any new dynamic route (the existing root + 10 segment files cover all 11 routes).
    - Any monorepo changes (this is a paperboy-site-only task).

- Required fix:

  **1. New file: `paperboy-site/lib/og-image.tsx`** — shared newspaper-themed JSX template factory. The file must NOT import any client-only or runtime-incompatible code (no React hooks, no `'use client'`, no DOM APIs). It's used by edge-runtime OG image routes.

  ```tsx
  import { ImageResponse } from "next/og";

  export const OG_SIZE = { width: 1200, height: 630 };
  export const OG_CONTENT_TYPE = "image/png";

  type OgCopy = {
    /** Top-left masthead text (lowercase domain, e.g. "Paperboy.run"). */
    kicker: string;
    /** Large headline, ALL CAPS rendering handled by CSS. */
    title: string;
    /** Deck/standfirst beneath the title (uppercase tracking). */
    deck: string;
  };

  export function renderOgImage({ kicker, title, deck }: OgCopy) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 64,
            background: "#1A1A1A",
            color: "#F4F1EA",
            fontFamily: "monospace",
            border: "8px solid #F4F1EA",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 22,
              letterSpacing: 6,
              textTransform: "uppercase",
            }}
          >
            <span>{kicker}</span>
            <span>Vol. I</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                lineHeight: 1.05,
                textTransform: "uppercase",
                letterSpacing: -1,
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontSize: 24,
                letterSpacing: 3,
                textTransform: "uppercase",
                opacity: 0.85,
              }}
            >
              {deck}
            </div>
          </div>
          <div
            style={{
              fontSize: 18,
              letterSpacing: 4,
              textTransform: "uppercase",
              borderTop: "2px solid #F4F1EA",
              paddingTop: 20,
            }}
          >
            Open source · No clutter
          </div>
        </div>
      ),
      { ...OG_SIZE },
    );
  }
  ```

  **2. Refactor `paperboy-site/app/opengraph-image.tsx`** (the existing root file becomes the home variant; the rendered output must remain byte-equivalent to today):

  ```tsx
  import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

  export const runtime = "edge";
  export const alt = "Paperboy — All the Markdown That's Fit to Print";
  export const size = OG_SIZE;
  export const contentType = OG_CONTENT_TYPE;

  export default function OpengraphImage() {
    return renderOgImage({
      kicker: "Paperboy.run",
      title: "All the Markdown That's Fit to Print",
      deck: "Desktop · Extension · CLI · Widget",
    });
  }
  ```

  Note: the literal `&apos;` in the existing JSX (`That&apos;s`) becomes an actual `'` in the TypeScript string. Both render identically in the final PNG because Satori parses HTML entities and JSX strings the same way — the visible card glyph is the apostrophe character either way. Keep the new file as a regular string.

  **3. Ten new per-route files.** Each is the same shape: a 10-line file exporting `runtime`, `alt`, `size`, `contentType`, and a default that calls `renderOgImage` with route copy. Per-route copy below — pull `title` from the page's `<h1>` or the metadata `title`; the deck is one short product-line tagline:

  - **`paperboy-site/app/a2/opengraph-image.tsx`** — Desktop Editor
    ```tsx
    import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

    export const runtime = "edge";
    export const alt = "Paperboy Desktop Editor — Native markdown for macOS, Windows, Linux";
    export const size = OG_SIZE;
    export const contentType = OG_CONTENT_TYPE;

    export default function OpengraphImage() {
      return renderOgImage({
        kicker: "Paperboy.run · Desktop",
        title: "Desktop Editor",
        deck: "Native · Split Preview · Local Convert",
      });
    }
    ```

  - **`paperboy-site/app/a3/opengraph-image.tsx`** — Chrome Extension
    ```tsx
    import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

    export const runtime = "edge";
    export const alt = "Paperboy Chrome Extension — Side panel web-to-markdown";
    export const size = OG_SIZE;
    export const contentType = OG_CONTENT_TYPE;

    export default function OpengraphImage() {
      return renderOgImage({
        kicker: "Paperboy.run · Extension",
        title: "Chrome Side Panel",
        deck: "Region Pick · Local OCR · Copy Ready",
      });
    }
    ```

  - **`paperboy-site/app/a4/opengraph-image.tsx`** — Web Widget
    ```tsx
    import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

    export const runtime = "edge";
    export const alt = "Paperboy Web Widget — One-script embeddable markdown toggle";
    export const size = OG_SIZE;
    export const contentType = OG_CONTENT_TYPE;

    export default function OpengraphImage() {
      return renderOgImage({
        kicker: "Paperboy.run · Widget",
        title: "Embeddable Web Widget",
        deck: "One Script · Inline or Overlay · Copy Ready",
      });
    }
    ```

  - **`paperboy-site/app/a5/opengraph-image.tsx`** — CLI
    ```tsx
    import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

    export const runtime = "edge";
    export const alt = "Paperboy Command-Line Edition — Markdown from the terminal";
    export const size = OG_SIZE;
    export const contentType = OG_CONTENT_TYPE;

    export default function OpengraphImage() {
      return renderOgImage({
        kicker: "Paperboy.run · CLI",
        title: "Command-Line Edition",
        deck: "Offline · Deterministic · Scriptable",
      });
    }
    ```

  - **`paperboy-site/app/viewer/opengraph-image.tsx`** — Viewer
    ```tsx
    import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

    export const runtime = "edge";
    export const alt = "Paperboy Markdown Viewer — Local-only browser preview";
    export const size = OG_SIZE;
    export const contentType = OG_CONTENT_TYPE;

    export default function OpengraphImage() {
      return renderOgImage({
        kicker: "Paperboy.run · Viewer",
        title: "Markdown Viewer",
        deck: "Drag & Drop · Local Only · Newspaper View",
      });
    }
    ```

  - **`paperboy-site/app/help/opengraph-image.tsx`** — Help / Ask The Editor
    ```tsx
    import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

    export const runtime = "edge";
    export const alt = "Paperboy Help — Frequently asked questions";
    export const size = OG_SIZE;
    export const contentType = OG_CONTENT_TYPE;

    export default function OpengraphImage() {
      return renderOgImage({
        kicker: "Paperboy.run · Help",
        title: "Ask the Editor",
        deck: "FAQ · Desktop · Extension · CLI · Widget",
      });
    }
    ```

  - **`paperboy-site/app/directory/opengraph-image.tsx`** — Directory
    ```tsx
    import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

    export const runtime = "edge";
    export const alt = "Paperboy Directory — Plan of the premises";
    export const size = OG_SIZE;
    export const contentType = OG_CONTENT_TYPE;

    export default function OpengraphImage() {
      return renderOgImage({
        kicker: "Paperboy.run · Directory",
        title: "Plan of the Premises",
        deck: "Every Page · One Index",
      });
    }
    ```

  - **`paperboy-site/app/privacy/opengraph-image.tsx`** — Privacy
    ```tsx
    import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

    export const runtime = "edge";
    export const alt = "Paperboy Privacy Policy — Local data, no tracking";
    export const size = OG_SIZE;
    export const contentType = OG_CONTENT_TYPE;

    export default function OpengraphImage() {
      return renderOgImage({
        kicker: "Paperboy.run · Privacy",
        title: "Privacy Policy",
        deck: "Local Data · No Tracking",
      });
    }
    ```

  - **`paperboy-site/app/terms/opengraph-image.tsx`** — Terms
    ```tsx
    import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

    export const runtime = "edge";
    export const alt = "Paperboy Terms of Service";
    export const size = OG_SIZE;
    export const contentType = OG_CONTENT_TYPE;

    export default function OpengraphImage() {
      return renderOgImage({
        kicker: "Paperboy.run · Terms",
        title: "Terms of Service",
        deck: "Open Source · Plain English",
      });
    }
    ```

  - **`paperboy-site/app/cookies/opengraph-image.tsx`** — Cookies
    ```tsx
    import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

    export const runtime = "edge";
    export const alt = "Paperboy Cookie Policy — UI preferences only, no tracking";
    export const size = OG_SIZE;
    export const contentType = OG_CONTENT_TYPE;

    export default function OpengraphImage() {
      return renderOgImage({
        kicker: "Paperboy.run · Cookies",
        title: "Cookie Policy",
        deck: "UI Preferences Only · No Tracking",
      });
    }
    ```

  **Builder rules:**
  - **Site repo only.** Working tree: `paperboy-site/`. Branch: `master`. Do not touch the monorepo.
  - **Files to create (11 total):**
    1. `paperboy-site/lib/og-image.tsx` (new shared template)
    2. `paperboy-site/app/a2/opengraph-image.tsx`
    3. `paperboy-site/app/a3/opengraph-image.tsx`
    4. `paperboy-site/app/a4/opengraph-image.tsx`
    5. `paperboy-site/app/a5/opengraph-image.tsx`
    6. `paperboy-site/app/viewer/opengraph-image.tsx`
    7. `paperboy-site/app/help/opengraph-image.tsx`
    8. `paperboy-site/app/directory/opengraph-image.tsx`
    9. `paperboy-site/app/privacy/opengraph-image.tsx`
    10. `paperboy-site/app/terms/opengraph-image.tsx`
    11. `paperboy-site/app/cookies/opengraph-image.tsx`
  - **Files to modify (1 total):**
    - `paperboy-site/app/opengraph-image.tsx` (refactor to call shared `renderOgImage`)
  - Do **not** edit `lib/page-metadata.ts`, `app/layout.tsx`, or any `app/<route>/layout.tsx`.
  - Do **not** edit `package.json` or `package-lock.json`.
  - Do **not** install or remove npm packages (`next/og` ships with Next 16; already available).
  - Do **not** add `twitter-image.tsx` (out of scope).
  - Do **not** add `opengraph-image.alt.txt` files (alt is exported inline).
  - All per-route files MUST export `runtime = "edge"`, `alt: string`, `size = OG_SIZE`, `contentType = OG_CONTENT_TYPE`, and a default function.
  - All per-route files MUST import `renderOgImage`, `OG_SIZE`, `OG_CONTENT_TYPE` from `@/lib/og-image`.
  - The home OG image (refactored `app/opengraph-image.tsx`) MUST produce a card visually equivalent to today's output: same dark background, same masthead text, same headline copy, same deck, same rule. (Use the literal copy from the existing file — `Paperboy.run`, `All the Markdown That's Fit to Print`, `Desktop · Extension · CLI · Widget`.)
  - The H1 string in each route's OG card should match (or be a clean tightening of) the route's `<h1>` / `lib/page-metadata.ts` title. The card-side `title` field is the **short visual** version (e.g. "Desktop Editor" rather than the full `<title>` tag "Desktop Editor | Paperboy.run").
  - The card-side `kicker` should be `Paperboy.run · <Section>` so the masthead identifies the route.
  - `npm run build` MUST succeed; the build summary MUST list **11 OG routes** (1 root + 10 segment) as either `ƒ` (dynamic) or `○` (static, depending on whether Next decided to prerender — both are acceptable; the per-segment files all run at edge runtime).
  - `npx tsc --noEmit` MUST be clean.
  - Do **not** push the site repo. Commit locally only.

- Validation:

  ```bash
  cd /Users/edward/MSDev/projects/paperboy/paperboy-site

  # 1. Exactly 11 new files + 1 modified file
  git status --short
  # expected:
  #  M app/opengraph-image.tsx
  # ?? app/a2/opengraph-image.tsx
  # ?? app/a3/opengraph-image.tsx
  # ?? app/a4/opengraph-image.tsx
  # ?? app/a5/opengraph-image.tsx
  # ?? app/cookies/opengraph-image.tsx
  # ?? app/directory/opengraph-image.tsx
  # ?? app/help/opengraph-image.tsx
  # ?? app/privacy/opengraph-image.tsx
  # ?? app/terms/opengraph-image.tsx
  # ?? app/viewer/opengraph-image.tsx
  # ?? lib/og-image.tsx
  # (12 lines total — no other modified/untracked files)

  # 2. All 11 opengraph-image.tsx files exist
  find app -name "opengraph-image.tsx" | wc -l
  # expected: 11

  # 3. Shared template file exists
  ls -la lib/og-image.tsx
  # expected: file present, ~50-80 lines

  # 4. Every per-route file imports from @/lib/og-image
  grep -rL "@/lib/og-image" app/*/opengraph-image.tsx
  # expected: empty (all files import the shared template; root may import for refactor too)

  # 5. Every per-route file exports the four required consts
  for f in app/*/opengraph-image.tsx; do
    echo "=== $f ==="
    grep -cE "^export const (runtime|alt|size|contentType)" "$f"
  done
  # expected: 4 for each (one runtime + one alt + one size + one contentType)

  # 6. Every per-route file default-exports a function calling renderOgImage
  grep -L "renderOgImage" app/*/opengraph-image.tsx app/opengraph-image.tsx
  # expected: empty

  # 7. No twitter-image.tsx (out of scope)
  find app -name "twitter-image*"
  # expected: empty

  # 8. No edits to metadata helper or layouts
  git diff lib/page-metadata.ts app/layout.tsx app/*/layout.tsx
  # expected: empty

  # 9. No package changes
  git diff package.json package-lock.json
  # expected: empty

  # 10. TypeScript clean
  npx tsc --noEmit
  # expected: no output

  # 11. Build succeeds and lists 11 OG routes
  npm run build 2>&1 | tail -40
  # expected: "Compiled successfully" + the route table now shows 11 opengraph-image entries:
  #   ƒ /opengraph-image           (root, home)
  #   ƒ /a2/opengraph-image
  #   ƒ /a3/opengraph-image
  #   ƒ /a4/opengraph-image
  #   ƒ /a5/opengraph-image
  #   ƒ /cookies/opengraph-image
  #   ƒ /directory/opengraph-image
  #   ƒ /help/opengraph-image
  #   ƒ /privacy/opengraph-image
  #   ƒ /terms/opengraph-image
  #   ƒ /viewer/opengraph-image
  # (statics may render as ○ if Next prerenders them at build; either is acceptable —
  # what matters is that 11 routes are listed, all 200 OK)

  # 12. (Optional) Confirm home card output unchanged: visit /opengraph-image in dev,
  # eyeball that the dark card with "Paperboy.run / Vol. I", "ALL THE MARKDOWN THAT'S
  # FIT TO PRINT", "DESKTOP · EXTENSION · CLI · WIDGET", "OPEN SOURCE · NO CLUTTER"
  # is byte-identical to the pre-refactor version. (Reviewer will spot-check in turn 2.)
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 7.2.

**Objective:** Make every route on paperboy.run ship a route-specific newspaper-themed OG image. Today every page shares the home card. Add a shared `lib/og-image.tsx` template, refactor the root `app/opengraph-image.tsx` to call it, and create 10 per-route variants — one per non-home route in the `lib/page-metadata.ts` `PAGES` map.

**Files to create / edit (paperboy-site/ only):**

1. **`paperboy-site/lib/og-image.tsx`** — Create the shared JSX template. Export `OG_SIZE = { width: 1200, height: 630 }`, `OG_CONTENT_TYPE = "image/png"`, and a `renderOgImage({ kicker, title, deck })` function that returns `new ImageResponse(...)`. Use the exact JSX block in Required Fix step 1 — dark `#1A1A1A` background, `#F4F1EA` ink, `8px` border, 64px padding, masthead row, headline + deck, "Open source · No clutter" rule. Type the parameter as `OgCopy = { kicker: string; title: string; deck: string }`. Do NOT add `'use client'`; this is a server module used by edge-runtime OG routes.

2. **`paperboy-site/app/opengraph-image.tsx`** — Replace the existing body. Keep `export const runtime = "edge"`. Import `renderOgImage`, `OG_SIZE`, `OG_CONTENT_TYPE` from `@/lib/og-image`. Set `alt`, `size = OG_SIZE`, `contentType = OG_CONTENT_TYPE`. Default-export a function calling `renderOgImage({ kicker: "Paperboy.run", title: "All the Markdown That's Fit to Print", deck: "Desktop · Extension · CLI · Widget" })`. The rendered card must look byte-equivalent to today's home OG card.

3. **`paperboy-site/app/a2/opengraph-image.tsx`** through **`paperboy-site/app/cookies/opengraph-image.tsx`** (10 files) — Use the exact `kicker` / `title` / `deck` / `alt` strings in Required Fix step 3. Each file is ~10 lines: imports + four required consts + default function.

**Do not edit:**
- `lib/page-metadata.ts` (metadata helper is untouched — the OG image file convention attaches `<meta property="og:image">` automatically)
- Any `layout.tsx` (root or per-route)
- Any `page.tsx`
- `package.json`, `package-lock.json` (no new deps)
- Any file outside `paperboy-site/`
- Do not add `twitter-image.tsx` files (out of scope)
- Do not add `opengraph-image.alt.txt` files (alt is exported inline)

**Validate (run these from `paperboy-site/` and paste outputs into the reply):**

```bash
cd /Users/edward/MSDev/projects/paperboy/paperboy-site

git status --short
# expect: 1 M (app/opengraph-image.tsx) + 11 ?? (10 per-route + lib/og-image.tsx)

find app -name "opengraph-image.tsx" | wc -l
# expect: 11

ls -la lib/og-image.tsx
# expect: file present

grep -rL "@/lib/og-image" app/*/opengraph-image.tsx
# expect: empty

for f in app/*/opengraph-image.tsx app/opengraph-image.tsx; do
  echo "=== $f ==="
  grep -cE "^export const (runtime|alt|size|contentType)" "$f"
done
# expect: 4 for each

grep -L "renderOgImage" app/*/opengraph-image.tsx app/opengraph-image.tsx
# expect: empty

find app -name "twitter-image*"
# expect: empty

git diff lib/page-metadata.ts app/layout.tsx app/*/layout.tsx
# expect: empty

git diff package.json package-lock.json
# expect: empty

npx tsc --noEmit
# expect: no output

npm run build 2>&1 | tail -40
# expect: "Compiled successfully" + 11 opengraph-image routes listed
```

When you reply, write `reviews/7.2/cursor-reply-turn-1.md` with: (a) the new `lib/og-image.tsx` file contents verbatim; (b) the new `app/opengraph-image.tsx` file contents verbatim; (c) any ONE of the 10 per-route files verbatim as a representative sample (e.g. `app/a3/opengraph-image.tsx`); (d) the output of each validation command above; (e) confirmation that `git diff lib/page-metadata.ts app/layout.tsx app/*/layout.tsx package.json package-lock.json` is empty.

## Consensus Checklist
- [ ] `lib/og-image.tsx` exists, exports `renderOgImage`, `OG_SIZE`, `OG_CONTENT_TYPE`, uses the exact newspaper-themed JSX template
- [ ] `app/opengraph-image.tsx` refactored to call `renderOgImage` with home copy (kicker `Paperboy.run`, title `All the Markdown That's Fit to Print`, deck `Desktop · Extension · CLI · Widget`)
- [ ] Per-route `opengraph-image.tsx` files exist for all 10 non-home routes: a2, a3, a4, a5, viewer, help, directory, privacy, terms, cookies
- [ ] Each per-route file exports `runtime = "edge"`, `alt: string`, `size = OG_SIZE`, `contentType = OG_CONTENT_TYPE`, and a default function
- [ ] Each per-route file imports `renderOgImage`, `OG_SIZE`, `OG_CONTENT_TYPE` from `@/lib/og-image`
- [ ] Each per-route file's `kicker` follows the pattern `Paperboy.run · <Section>`
- [ ] No `twitter-image*` files created
- [ ] No `opengraph-image.alt.txt` files created
- [ ] `lib/page-metadata.ts` untouched
- [ ] All 11 `layout.tsx` files untouched
- [ ] `package.json` and `package-lock.json` untouched
- [ ] `npx tsc --noEmit` succeeds
- [ ] `npm run build` succeeds and the route table lists 11 OG routes
- [ ] `git status --short` shows exactly 12 lines (1 modified + 11 untracked)
- [ ] No monorepo changes

## Decision
**send_to_builder.** Fresh task, no builder commit yet. 11-file scope (1 modified + 11 new) with a shared template factory + 10 thin per-route OG image files, plus a home refactor that preserves the existing card byte-for-byte. Per-route copy specified verbatim; Next 16 file-convention auto-attachment means no metadata helper or layout edits are needed. 14-item validation checklist.

## Notes
- Approach: shared template + thin per-route files. Avoids 11× duplication of the 60-line JSX block; keeps brand consistency centralized; matches the existing `lib/page-metadata.ts` single-source-of-truth pattern.
- Why no font loading: Satori needs base64-loaded local TTFs for custom fonts, adding ~50KB to each OG response. The existing root file already uses `fontFamily: "monospace"` (Satori's built-in fallback) and renders cleanly. Font loading is a future enhancement once we decide whether to use Canterbury (display blackletter, very on-brand) or stick with mono.
- Why no twitter-image.tsx: `lib/page-metadata.ts:96` sets `twitter.card = "summary_large_image"`, which causes Twitter/X to fall back to the `og:image` for the card. A separate `twitter-image.tsx` would only be needed if we wanted a different aspect ratio or copy for Twitter specifically — not in scope.
- The 11 routes mirror the 11 PAGES keys in `lib/page-metadata.ts` 1:1. If a future route is added (e.g. `about`, `changelog`), it should get its own `opengraph-image.tsx` in the same pattern.
- `runtime = "edge"` chosen for consistency with the existing root file. Node runtime would also work but bumps the cold-start cost and adds no value for this static-template use case.
