---
name: bump-version
description: Bump every workspace package in the paperboy monorepo to the same version, then rebuild the converter. Use after agreeing on a new version (e.g. 0.2.2 → 0.2.3) and before cutting a release. Skip this and call /release-cut directly if you want the full ship flow.
---

# Bump version across the monorepo

Two scripts cooperate to keep version numbers aligned across `paperboy-converter`, `paperboy-ai`, `paperboy-cli`, `paperboy-app`, `paperboy-ext`, `paperboy-widget`, and the Tauri Cargo manifest:

- `scripts/bump-version.mjs <version>` — rewrites the version field in every package.json + manifest.json + tauri.conf.json + Cargo.toml.
- `paperboy-converter/scripts/sync-all.mjs` — rebuilds the converter only. Workspace consumers pick up the new build via symlinks; `paperboy-site` consumes `@proticom/paperboy-converter` from npm (no vendoring).

`paperboy-site` lives in a separate Git repo. After you publish a new converter tag, bump its `package.json` caret (e.g. `^0.2.3`) and run `npm install --legacy-peer-deps` there — its own `version` field is independent.

## Steps

Run from the monorepo root (`/Volumes/Dev/projects/paperboy/`).

1. **Confirm everything is aligned right now.**
   ```bash
   node scripts/bump-version.mjs --check
   ```
   If it complains, the next bump will paper over the drift — fine, just be aware.

2. **Bump.** Pass the new version (no `v` prefix):
   ```bash
   node scripts/bump-version.mjs <version>
   ```
   Verify by re-running `--check`.

3. **Rebuild the converter.**
   ```bash
   cd paperboy-converter && npm run sync:all && cd ..
   ```
   This runs `tsc` on the converter only. It does not touch `paperboy-site/`.

4. **Sanity-check each consumer builds.** The workspace symlinks the converter for cli/app/ext/widget, so just `tsc -p paperboy-converter/tsconfig.json` (or the workspace build) is usually enough. Optionally:
   ```bash
   npm --workspace=@proticom/paperboy-cli run build
   npm --workspace=@proticom/paperboy-ext run build
   npm --workspace=@proticom/paperboy-widget run build
   cd paperboy-site && npm install --legacy-peer-deps && npm run build && cd ..
   ```
   In `paperboy-site`, ensure `@proticom/paperboy-converter` in `package.json` uses a caret that includes the new version (e.g. `^0.2.3`) before `npm install`.

## What to report back

- The new version number.
- The list of files touched by `bump-version.mjs` (it prints them).
- Whether all consumer builds passed.
- Reminder: after `npm publish` (via release tag), update `paperboy-site` converter dep + lockfile if the caret does not already cover the new version.

## What NOT to do

- Don't hand-edit version fields in package.json/manifest.json/Cargo.toml. The script keeps them aligned; manual edits drift them.
- Don't commit between bump and sync — they should land as a single coherent change so a reviewer sees "v0.2.3 across the board" not "half-bumped".
- Don't vendor a converter `.tgz` into `paperboy-site/` — the site uses the npm registry.
