# 7.2 — Review Turn 2

## Task Context
- Task id: 7.2
- Task title: Add dynamic OG images per route
- Phase: Phase 7 — Site backend & polish
- Spec section (plan line 152):
  > "**7.2** Generate dynamic OG images via [app/opengraph-image.tsx](paperboy-site/app/opengraph-image.tsx) — newspaper-themed, route-specific."
- Builder reply: `reviews/7.2/cursor-reply-turn-1.md`
- Reviewer contract (turn 1): `reviews/7.2/claude-review-turn-1.md`
- Files inspected (in `paperboy-site/`):
  - `lib/og-image.tsx` (shared template, 80 lines)
  - `app/opengraph-image.tsx` (refactored home, 14 lines)
  - All 10 per-route files: `app/{a2,a3,a4,a5,viewer,help,directory,privacy,terms,cookies}/opengraph-image.tsx`
- Commands run (turn 2, read-only + build):
  ```bash
  cd /Users/edward/MSDev/projects/paperboy/paperboy-site
  git status --short                                  # → 1 M + 11 ?? (12 lines total)
  find app -name "opengraph-image.tsx" | sort        # → 11 files
  find app -name "twitter-image*"                     # → empty
  ls -la lib/og-image.tsx                             # → present, 1881 bytes
  git diff lib/page-metadata.ts app/layout.tsx \
    app/*/layout.tsx package.json package-lock.json   # → empty
  for f in app/*/opengraph-image.tsx app/opengraph-image.tsx; do
    grep -cE "^export const (runtime|alt|size|contentType)" "$f"
  done                                                # → 4 for every file (11 files × 4 exports)
  npx tsc --noEmit                                    # → clean (no output)
  npm run build 2>&1 | tail -80                       # → ✓ Compiled successfully + 11 ƒ OG routes
  ```
- Build output confirms exactly 11 `ƒ /…/opengraph-image` routes (all edge-runtime, server-rendered on demand):
  - `ƒ /opengraph-image` (root / home)
  - `ƒ /a2/opengraph-image`
  - `ƒ /a3/opengraph-image`
  - `ƒ /a4/opengraph-image`
  - `ƒ /a5/opengraph-image`
  - `ƒ /cookies/opengraph-image`
  - `ƒ /directory/opengraph-image`
  - `ƒ /help/opengraph-image`
  - `ƒ /privacy/opengraph-image`
  - `ƒ /terms/opengraph-image`
  - `ƒ /viewer/opengraph-image`

## Findings

### Finding 1: All consensus-checklist items satisfied verbatim.

- Severity: required → resolved
- Location: 12 files in `paperboy-site/` (1 M + 11 new).
- Verification, item-by-item (from the turn-1 Consensus Checklist):
  1. [x] **`lib/og-image.tsx` exists, exports `renderOgImage`, `OG_SIZE`, `OG_CONTENT_TYPE`, newspaper JSX template** — confirmed. File is 80 lines, exports all three symbols, uses the exact dark `#1A1A1A` + ink `#F4F1EA` + `8px` border + 64px padding layout from the contract; masthead row (`{kicker}` + `Vol. I`), headline + deck stack, "Open source · No clutter" rule.
  2. [x] **`app/opengraph-image.tsx` refactored to call `renderOgImage` with home copy** — confirmed. Imports from `@/lib/og-image`; `kicker: "Paperboy.run"`, `title: "All the Markdown That's Fit to Print"`, `deck: "Desktop · Extension · CLI · Widget"` — all three strings match the existing home card byte-for-byte.
  3. [x] **All 10 per-route files exist** — confirmed via `find app -name "opengraph-image.tsx" | wc -l` → 11 (1 root + 10 routes). Routes present: a2, a3, a4, a5, viewer, help, directory, privacy, terms, cookies (1:1 with `lib/page-metadata.ts` PAGES non-home keys).
  4. [x] **Each per-route file exports `runtime = "edge"`, `alt`, `size = OG_SIZE`, `contentType = OG_CONTENT_TYPE`, default function** — confirmed. Grep shows 4 matching export-const lines per file; each default export calls `renderOgImage({...})`.
  5. [x] **Each per-route file imports `renderOgImage`, `OG_SIZE`, `OG_CONTENT_TYPE` from `@/lib/og-image`** — confirmed. Identical first-line import in all 11 files.
  6. [x] **`kicker` follows `Paperboy.run · <Section>` pattern** — confirmed. Sections: Desktop, Extension, Widget, CLI, Viewer, Help, Directory, Privacy, Terms, Cookies. Home is plain `Paperboy.run` (no suffix), as the contract specified.
  7. [x] **No `twitter-image*` files** — confirmed; `find app -name "twitter-image*"` returns empty.
  8. [x] **No `opengraph-image.alt.txt` files** — confirmed; alt is exported inline in every file.
  9. [x] **`lib/page-metadata.ts` untouched** — `git diff` empty.
  10. [x] **All 11 `layout.tsx` files untouched** — `git diff app/layout.tsx app/*/layout.tsx` empty.
  11. [x] **`package.json` and `package-lock.json` untouched** — `git diff` empty.
  12. [x] **`npx tsc --noEmit` succeeds** — confirmed, no output.
  13. [x] **`npm run build` succeeds and lists 11 OG routes** — confirmed: "✓ Compiled successfully in 3.8s", "Finished TypeScript in 1648ms", "✓ Generating static pages using 23 workers (18/18)". Route table lists all 11 `ƒ /…/opengraph-image` entries as edge-runtime dynamic routes (the expected behavior — the Next 16 build warning "Using edge runtime on a page currently disables static generation for that page" is informational and matches the existing root file's behavior; contract explicitly allowed either `ƒ` or `○`).
  14. [x] **`git status --short` shows exactly 12 lines (1 M + 11 ??)** — confirmed; output matches the contract expectation exactly:
      ```
       M app/opengraph-image.tsx
      ?? app/a2/opengraph-image.tsx
      ?? app/a3/opengraph-image.tsx
      ?? app/a4/opengraph-image.tsx
      ?? app/a5/opengraph-image.tsx
      ?? app/cookies/opengraph-image.tsx
      ?? app/directory/opengraph-image.tsx
      ?? app/help/opengraph-image.tsx
      ?? app/privacy/opengraph-image.tsx
      ?? app/terms/opengraph-image.tsx
      ?? app/viewer/opengraph-image.tsx
      ?? lib/og-image.tsx
      ```
  15. [x] **No monorepo changes** — site work entirely contained in `paperboy-site/`; monorepo `git status` shows only the existing `.agents/` + `.codex/` (pre-existing) and the in-flight `reviews/7.2/claude-review-turn-2.md` artifact this commit will add.

- Copy spot-check (every per-route file's `kicker · title · deck` matches the contract verbatim):
  | Route | Kicker | Title | Deck |
  |-------|--------|-------|------|
  | a2 | `Paperboy.run · Desktop` | `Desktop Editor` | `Native · Split Preview · Local Convert` |
  | a3 | `Paperboy.run · Extension` | `Chrome Side Panel` | `Region Pick · Local OCR · Copy Ready` |
  | a4 | `Paperboy.run · Widget` | `Embeddable Web Widget` | `One Script · Inline or Overlay · Copy Ready` |
  | a5 | `Paperboy.run · CLI` | `Command-Line Edition` | `Offline · Deterministic · Scriptable` |
  | viewer | `Paperboy.run · Viewer` | `Markdown Viewer` | `Drag & Drop · Local Only · Newspaper View` |
  | help | `Paperboy.run · Help` | `Ask the Editor` | `FAQ · Desktop · Extension · CLI · Widget` |
  | directory | `Paperboy.run · Directory` | `Plan of the Premises` | `Every Page · One Index` |
  | privacy | `Paperboy.run · Privacy` | `Privacy Policy` | `Local Data · No Tracking` |
  | terms | `Paperboy.run · Terms` | `Terms of Service` | `Open Source · Plain English` |
  | cookies | `Paperboy.run · Cookies` | `Cookie Policy` | `UI Preferences Only · No Tracking` |

- Required fix: none — implementation matches the contract verbatim.

- Validation:
  ```bash
  cd /Users/edward/MSDev/projects/paperboy/paperboy-site

  # 1. Exactly 12 status lines: 1 M + 11 ??
  git status --short
  # → " M app/opengraph-image.tsx" + 11 untracked files (10 per-route + lib/og-image.tsx)

  # 2. 11 OG image files
  find app -name "opengraph-image.tsx" | wc -l
  # → 11

  # 3. Shared template present
  ls -la lib/og-image.tsx
  # → file present, ~80 lines

  # 4. No twitter overrides
  find app -name "twitter-image*"
  # → empty

  # 5. No unintended edits to metadata helper, layouts, or package manifests
  git diff lib/page-metadata.ts app/layout.tsx app/*/layout.tsx package.json package-lock.json
  # → empty

  # 6. Each OG file exports the four required consts
  for f in app/*/opengraph-image.tsx app/opengraph-image.tsx; do
    grep -cE "^export const (runtime|alt|size|contentType)" "$f"
  done
  # → 4 for every file (11 × 4 = 44 total)

  # 7. Every OG file imports from @/lib/og-image
  grep -L "renderOgImage" app/*/opengraph-image.tsx app/opengraph-image.tsx
  # → empty

  # 8. TypeScript clean
  npx tsc --noEmit
  # → no output

  # 9. Build succeeds and lists 11 OG routes
  npm run build 2>&1 | tail -40
  # → "✓ Compiled successfully" + 11 `ƒ /…/opengraph-image` entries in the route table
  ```

## Builder Prompt
No further builder action required. 7.2 is review_passed — implementation matches the turn-1 contract verbatim across all 14 consensus-checklist items. Phase 7 next reviewable item is 7.3 (e2e smoke pass).

## Consensus Checklist
- [x] `lib/og-image.tsx` exists, exports `renderOgImage`, `OG_SIZE`, `OG_CONTENT_TYPE`, uses the newspaper-themed JSX template
- [x] `app/opengraph-image.tsx` refactored to call `renderOgImage` with home copy (kicker `Paperboy.run`, title `All the Markdown That's Fit to Print`, deck `Desktop · Extension · CLI · Widget`)
- [x] Per-route `opengraph-image.tsx` files exist for all 10 non-home routes: a2, a3, a4, a5, viewer, help, directory, privacy, terms, cookies
- [x] Each per-route file exports `runtime = "edge"`, `alt: string`, `size = OG_SIZE`, `contentType = OG_CONTENT_TYPE`, and a default function
- [x] Each per-route file imports `renderOgImage`, `OG_SIZE`, `OG_CONTENT_TYPE` from `@/lib/og-image`
- [x] Each per-route file's `kicker` follows the pattern `Paperboy.run · <Section>`
- [x] No `twitter-image*` files created
- [x] No `opengraph-image.alt.txt` files created
- [x] `lib/page-metadata.ts` untouched
- [x] All 11 `layout.tsx` files untouched
- [x] `package.json` and `package-lock.json` untouched
- [x] `npx tsc --noEmit` succeeds
- [x] `npm run build` succeeds and the route table lists 11 OG routes
- [x] `git status --short` shows exactly 12 lines (1 modified + 11 untracked)
- [x] No monorepo changes

## Decision
**review_passed.** All 14 consensus-checklist items satisfied. 12-file diff (1 modified + 11 new) matches the contract scope exactly; no metadata-helper, layout, page, or package edits. Shared `lib/og-image.tsx` template is the single source of truth for newspaper styling; 10 per-route files are ~14-line wrappers passing route-specific `kicker`/`title`/`deck` copy verbatim from the contract. Home OG card remains byte-equivalent to pre-refactor output (same kicker, headline, deck). `npx tsc --noEmit` clean; `npm run build` compiles successfully and lists 11 `ƒ /…/opengraph-image` edge-runtime routes in the route table.

## Notes
- The build emits an informational warning "Using edge runtime on a page currently disables static generation for that page". This is expected and pre-existing — the root OG file already used `runtime = "edge"` before 7.2. All 11 OG routes server-render on demand at edge, which is fine for OG images (each route's card is static per build but Next's file convention treats edge OG handlers as dynamic `ƒ`).
- macOS-only objc warning about `GNotificationCenterDelegate` is unrelated to 7.2 (it's a `sharp` / libvips / Homebrew glib conflict that appears on every build).
- Twitter inheritance still works: `lib/page-metadata.ts:96` sets `twitter.card = "summary_large_image"`, so per-route Twitter cards now auto-pick the per-route OG image with no additional work.
- Next OG file convention: a per-route `opengraph-image.tsx` overrides the root file for that segment, with `<meta property="og:image">` auto-injected into the segment's `<head>`. No `metadata.openGraph.images` edit needed in `lib/page-metadata.ts`.
- Phase 7 status after this passes: 7.1, 7.2 done; 7.3 (e2e smoke pass) is the last Phase 7 reviewable item before the deferred 5.3/5.8/5.9/6.4 GATEs.
