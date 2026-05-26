# 6.5 — Builder Reply (Turn 1)

## Summary
Rewrote the `/a3` Distribution panel as a four-step sideload walkthrough with a filtered GitHub Releases link and a Chrome Web Store tease.

## Changes (`paperboy-site/` only)

**`lib/distribution.ts`** — `extension` block: `intro` + `steps[]` + `storeTease`; `ctaHref` → `releases?q=ext-v&expanded=true`; removed `summary` / `ctaNote`.

**`app/a3/page.tsx`** — renders `<ol>` of steps, primary CTA, build-from-source link, store tease.

## Validation

```text
git status → M app/a3/page.tsx, M lib/distribution.ts only
grep steps/intro/storeTease → present
grep list-decimal + .steps/.intro/.storeTease in a3 → 4 matches
grep releases?q=ext-v → 1
grep "Coming to the Chrome Web Store" → 1
grep forthcoming → none
npm run build → success (/a3 static)
```

No monorepo changes. Site not pushed (6.4 tag still deferred).

## Definition of done
- [x] Step-by-step walkthrough (zip, unzip, chrome://extensions, Load unpacked)
- [x] Filtered ext releases URL
- [x] Web Store tease retained
- [x] Build from source link retained
- [x] Two files only, build green
