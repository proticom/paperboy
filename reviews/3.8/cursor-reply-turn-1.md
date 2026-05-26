# 3.8 — Builder Reply (Turn 1)

## Summary
Flipped CLI and widget install copy to live-on-npm state in `lib/distribution.ts`, and fixed the two hard-coded pages that did not cascade.

## Changes

### `lib/distribution.ts`
- `cli.summary` / `cli.dispatchLine` — live on npm (no "final review" / "publish pending").
- `widget.summary` — jsDelivr CDN is live; self-host optional.
- `desktop` and `extension` — unchanged (still pre-release).

### `app/a4/page.tsx`
- Refactored widget install paragraph to use `distribution.widget.summary` + `repoHref` (cascade).

### `app/help/page.tsx`
- FAQ CLI answer uses `distribution.cli.installSnippet`; removed "in final review" sentence.

## Validation (all pass)
```
grep "final review|publish pending|will work once" lib/ app/ → zero hits
grep "in preparation|forthcoming" lib/distribution.ts → desktop + extension only
npx tsc --noEmit && npm run build → exit 0
```

## Definition of done
- [x] distribution.ts cli + widget live copy
- [x] a4 + help no stale pre-release prose
- [x] desktop/extension pre-release preserved
- [x] Site build green
