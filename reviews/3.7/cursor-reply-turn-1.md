# 3.7 — Builder Reply (Turn 1)

## Summary
Switched `paperboy-site` from vendored `file:proticom-paperboy-converter-*.tgz` to registry `@proticom/paperboy-converter@^0.2.2`. Removed both stale converter tarballs. Simplified `sync-all.mjs` (Option A) and updated `bump-version` / `release-cut` skills in both `.claude/skills/` and `.agents/skills/` (separate copies, not symlinks — edited both).

## Changes

### `paperboy-site/`
- `package.json`: `"@proticom/paperboy-converter": "^0.2.2"`
- `package-lock.json`: resolves from `https://registry.npmjs.org/@proticom/paperboy-converter/-/paperboy-converter-0.2.2.tgz`
- `git rm` `proticom-paperboy-converter-0.2.1.tgz` and `0.2.2.tgz` (kept `proticom-ui-0.1.0.tgz`)

### `paperboy-converter/scripts/sync-all.mjs`
- Option A: build only; no pack/copy/rewrite/site install.

### Skills (4 files)
- `bump-version`: rebuild converter only; site uses npm after publish.
- `release-cut`: site commit is `package.json` + lockfile only; no tarball add.

## Validation (all pass)
```
grep package.json → ^0.2.2
grep lockfile resolved → registry.npmjs.org URL
ls *.tgz → only proticom-ui-0.1.0.tgz
node paperboy-converter/scripts/sync-all.mjs → build only; site status unchanged by sync
npx tsc --noEmit && npm run build in paperboy-site → exit 0
```

## Definition of done
- [x] Registry dep + lockfile (not `file:`)
- [x] Converter tarballs removed
- [x] sync-all no longer vendors into site
- [x] bump-version + release-cut docs updated (both skill trees)
- [x] Site build + typecheck green
