---
name: bump-version
description: Bump every workspace package in the paperboy monorepo to the same version, then propagate the new converter tarball to every consumer. Use after agreeing on a new version (e.g. 0.2.2 → 0.2.3) and before cutting a release. Skip this and call /release-cut directly if you want the full ship flow.
---

# Bump version across the monorepo

Two scripts cooperate to keep version numbers aligned across `paperboy-converter`, `paperboy-cli`, `paperboy-app`, `paperboy-ext`, `paperboy-widget`, and the Tauri Cargo manifest:

- `scripts/bump-version.mjs <version>` — rewrites the version field in every package.json + manifest.json + tauri.conf.json + Cargo.toml.
- `paperboy-converter/scripts/sync-all.mjs` — rebuilds the converter, `npm pack`s the new tarball, copies it into `paperboy-site/`, and runs `npm install` there.

`paperboy-site` lives in a separate Git repo and only gets the new tarball — its own `version` field is independent.

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

3. **Sync the converter tarball into paperboy-site.**
   ```bash
   cd paperboy-converter && npm run sync:all && cd ..
   ```
   This regenerates `paperboy-site/proticom-paperboy-converter-<version>.tgz`, rewrites the site's `package.json` to point at it, and runs `npm install --legacy-peer-deps` in the site repo.

4. **Sanity-check each consumer builds.** The workspace symlinks the converter for cli/app/ext/widget, so just `tsc -p paperboy-converter/tsconfig.json` (or the workspace build) is usually enough. Optionally:
   ```bash
   npm --workspace=@proticom/paperboy-cli run build
   npm --workspace=@proticom/paperboy-ext run build
   npm --workspace=@proticom/paperboy-widget run build
   cd paperboy-site && npm run build && cd ..
   ```

## What to report back

- The new version number.
- The list of files touched by `bump-version.mjs` (it prints them).
- Whether all consumer builds passed.
- Whether `paperboy-site` was bumped (yes — its vendored tarball is updated even though its own `version` stays the same).

## What NOT to do

- Don't hand-edit version fields in package.json/manifest.json/Cargo.toml. The script keeps them aligned; manual edits drift them.
- Don't commit between bump and sync — they should land as a single coherent change so a reviewer sees "v0.2.3 across the board" not "half-bumped".
- Don't touch `paperboy-site/package.json`'s own version field. Only its converter dependency line moves.
