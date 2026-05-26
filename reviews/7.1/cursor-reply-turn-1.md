# 7.1 — Builder Reply (Turn 1)

## Summary
Wired Ask The Editor and Footer Contact Editor to `mailto:support@paperboy.run` (spec fallback path — no Resend/KV backend).

## Changes (`paperboy-site/` only)

**`components/AskTheEditor.tsx`** — Replaced placeholder copy with email instructions + `mailto:support@paperboy.run?subject=Ask%20The%20Editor`. Status: "Direct line to the desk." Panel open/close unchanged.

**`components/Footer.tsx`** — Contact Editor is now a `<Link href="mailto:...?subject=Contact%20Editor">`. Removed unused `useSiteUi` import.

No `app/api/contact`, no new deps.

## Validation

```text
git status → M AskTheEditor.tsx, M Footer.tsx only
mailto in both components → 2 matches
placeholder copy → gone
setAskEditorOpen in Footer → gone
app/api → none
package.json → untouched
tsc --noEmit → clean
npm run build → success
```

## Definition of done
- [x] Working mailto on both touchpoints
- [x] No backend route
- [x] SiteUiContext unchanged (panel still uses open state)
