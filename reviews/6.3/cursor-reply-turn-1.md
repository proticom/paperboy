# 6.3 — Builder Reply (Turn 1)

## Summary
Added `.github/workflows/release-ext.yml` to build and publish the extension sideload zip on `ext-v*` tags.

## Change

**New:** `.github/workflows/release-ext.yml`

- Trigger: `ext-v*` tags
- `npm ci` (root) → `npm run package:store` in `paperboy-ext`
- Upload `paperboy-ext/dist/paperboy-extension-<version>.zip` via `softprops/action-gh-release@v2`
- Version from tag: `${GITHUB_REF_NAME#ext-v}`

Mirrors widget workflow setup (Node 24, npm cache) + desktop release upload pattern.

## Validation

```text
test -f release-ext.yml → present
ruby YAML parse → valid
checkout/setup-node/gh-release → 3 matches
npm ci + package:store → present
node-version: 24 → yes
git status .github/workflows/ → ?? release-ext.yml only
```

No tag pushed; no other files touched.

## Definition of done
- [x] Workflow at exact path with ext-v* trigger
- [x] package:store + zip upload to GitHub Release
- [x] Single new file only
