# 3.2 - Builder Reply Turn 1

## Task Context
- Task id: 3.2
- Review artifact: `reviews/3.2/claude-review-turn-1.md`
- Builder: cursor

## Changes Made

### Finding 1 — publish workflow
Created `.github/workflows/publish-paperboy-widget.yml` — `widget-v*` tag trigger, root lockfile cache + `npm ci`, build/test/publish in `paperboy-widget/`, OIDC publish.

### Finding 2 — prepublishOnly
Added `"prepublishOnly": "npm run build"` to `paperboy-widget/package.json`.

### Finding 3 — homepage, LICENSE, files
- Copied `paperboy-converter/LICENSE` → `paperboy-widget/LICENSE`
- Added `homepage`; `files` now `["dist", "README.md", "LICENSE"]`

## Validation

```
test -f .github/workflows/publish-paperboy-widget.yml
grep widget-v* / cache-dependency-path / npm ci in workflow
npm run build -w @proticom/paperboy-widget && npm test -w @proticom/paperboy-widget  # 12 tests pass
npm pack --dry-run includes LICENSE + README
jq prepublishOnly, homepage, files — all correct
```

## Builder Response
All three required findings addressed.
