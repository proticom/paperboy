---
name: sync-widget
description: Rebuild paperboy-widget, copy the new bundle into paperboy-site/public/widget, and rebuild the site. Run after any change to paperboy-widget/src/ that needs to land on paperboy.run.
---

# Sync widget bundle into the site

The Paperboy site dogfoods the widget — `paperboy-site/public/widget/paperboy-widget.min.js` is a vendored copy of `paperboy-widget/dist/paperboy-widget.min.js`. The site repo is a separate Git remote and doesn't have the widget package symlinked, so changes to widget source need an explicit vendor step.

## When to run

Whenever any of these have changed:

- `paperboy-widget/src/widget.js`
- `paperboy-widget/src/styles.js`
- `paperboy-widget/src/turndown-config.js`

## Steps

Run from the monorepo root (`/Volumes/Dev/projects/paperboy/`):

```bash
# 1. Rebuild the widget bundle
npm --workspace=@proticom/paperboy-widget run build

# 2. Vendor the bundle into the site
cp paperboy-widget/dist/paperboy-widget.min.js paperboy-site/public/widget/paperboy-widget.min.js

# 3. Rebuild the site so the new bundle is in the static output
cd paperboy-site && npm run build
```

## What to verify after

- Site build exits 0 — bundle didn't introduce a syntax error that breaks Next's static export.
- `git -C paperboy-site status --short` shows only `public/widget/paperboy-widget.min.js` as modified (no unintended ripple).
- The site dev server (if running) picks up the new bundle on the next browser reload.

## What NOT to do

- Don't edit `paperboy-site/public/widget/paperboy-widget.min.js` directly. It's a build artifact; the canonical source is `paperboy-widget/src/`.
- Don't commit a vendored bundle that's out of sync with the published widget version — bump `paperboy-widget/package.json` if the change is user-visible, then run the sync.
