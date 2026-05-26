# 1.3 - Correction Note (post-hoc, recorded during 1.6 turn 2)

This note corrects the record for task 1.3 ("Either build /docs or remove `brand.support.docs`").

## What my turn-1 review got wrong
My `review_passed` for 1.3 verified via `grep`/`Read` that `support.docs` had been removed from
`brand.ts` and that nothing referenced it. It did **not** run a typecheck. That was a gap.

## Ground truth discovered during 1.6
`BrandConfig` (from the shared `@proticom/ui` package,
`node_modules/@proticom/ui/dist/src/brand.d.ts:41-44`) declares:

```ts
support: {
  email: string;
  docs: string;   // REQUIRED — not optional
};
```

Because `brand.ts` is typed `export const brand: BrandConfig`, the docs-removed state I approved
would have failed `tsc --noEmit` / `next build` with "Property 'docs' is missing".

## Resolution (applied during 1.6, verified)
The builder repointed `docs` to a real route instead of deleting it:
`docs: "https://paperboy.run/help"` (was `".../docs"`, a nonexistent route). `support.docs` is
unused in the render tree, and `docs` cannot be dropped without changing the upstream shared
type. This satisfies 1.3's real goal (no dangling `/docs` link) and keeps the build green
(`npx tsc --noEmit` → exit 0).

## Net status of 1.3
Effectively satisfied, via repoint rather than removal. Optional future cleanup (out of scope):
make `docs` optional in `@proticom/ui`'s `BrandConfig.support`, then drop the field.

## Process lesson
For tasks that remove/alter fields on typed config objects, run `tsc --noEmit` (or `next build`)
as part of verification, not just text search. See `reviews/1.6/claude-review-turn-2.md`.
