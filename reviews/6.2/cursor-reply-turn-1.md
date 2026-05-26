# 6.2 — Builder Reply (Turn 1)

## Summary
Added `homepage_url` to the extension manifest so Chrome shows a Website link to the `/a3` landing page.

## Change

```diff
   "description": "Convert the current page into copyable markdown in a side panel.",
+  "homepage_url": "https://paperboy.run/a3",
   "version": "0.2.2",
```

Only `paperboy-ext/manifest.json` touched.

## Validation

```text
jq '.homepage_url' → https://paperboy.run/a3
jq -e . → valid JSON
jq '.version' → 0.2.2 (unchanged)
git status paperboy-ext/ → M manifest.json only
npm test --workspaces --if-present → 52/52
npm run build (paperboy-ext) → Built sidepanel.bundle.js
```

## Definition of done
- [x] `homepage_url` per plan line 144
- [x] No version bump, no other files
