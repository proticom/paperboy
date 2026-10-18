---
name: release-cut
description: Ship a new release end-to-end — bump all packages, rebuild the converter, commit, push, tag, and watch the npm OIDC publish run. Use when you've decided to ship a new version. Asks for the version number up front; nothing else is interactive.
disable-model-invocation: true
---

# Cut a release

End-to-end ship flow for `@proticom/paperboy-converter` (and the aligned package versions). The npm publish happens via OIDC from a GitHub Actions workflow triggered by a `v*` tag, so the human work is just bump → commit → push tag → wait.

## Prerequisites (one-time)

- `gh` CLI authenticated against `github.com/proticom`.
- npm trusted publisher already configured for `@proticom/paperboy-converter` (see `AGENTS.md` → "npm publishing").
- Working tree clean (`git status` empty).

## Steps

Run from the monorepo root (`/Volumes/Dev/projects/paperboy/`).

1. **Ask the user for the version.** Format `X.Y.Z` (no `v` prefix). If they don't supply one, infer the next patch from the current `paperboy-converter/package.json` version.

2. **Bump + rebuild converter.** This is the `/bump-version` skill, inlined:
   ```bash
   node scripts/bump-version.mjs --check          # sanity
   node scripts/bump-version.mjs <version>
   (cd paperboy-converter && npm run sync:all)
   ```

3. **Verify each consumer builds.** Bail and tell the user if any step exits non-zero — do not push a broken release.
   ```bash
   npm --workspace=@proticom/paperboy-converter run build
   npm --workspace=@proticom/paperboy-cli run build
   npm --workspace=@proticom/paperboy-ext run build
   (cd paperboy-site && npm install --legacy-peer-deps && npm run build)
   ```
   Ensure `paperboy-site/package.json` has `@proticom/paperboy-converter` set to a caret that includes `<version>` (e.g. `^0.2.3`).

4. **Commit (monorepo).** Include every file the bump + sync touched.
   ```bash
   git add -A
   git commit -m "release: v<version>"
   ```

5. **Site repo: commit + push (if lockfile changed).** `paperboy-site` is a separate Git repo nested at `./paperboy-site/`. After npm publish, the site picks up the new converter from the registry on `npm install` — no vendored `.tgz`.
   ```bash
   git -C paperboy-site add package.json package-lock.json
   git -C paperboy-site commit -m "chore: bump converter to v<version>"
   git -C paperboy-site push origin master
   ```
   Skip this step if the site repo has no converter-related changes.

6. **Push monorepo + tag.** The tag triggers the npm publish workflow.
   ```bash
   git push origin main
   git tag v<version>
   git push origin v<version>
   ```

7. **Watch the publish run.**
   ```bash
   gh run watch --exit-status $(gh run list --workflow="Publish to npm" --limit 1 --json databaseId --jq '.[0].databaseId')
   ```
   If it fails, surface the last 40 lines of logs via `gh run view --log-failed`.

8. **Verify on npm.**
   ```bash
   npm view @proticom/paperboy-converter@<version> version
   ```

9. **Report.**
   - New version live on npm: yes / no
   - Monorepo commit SHA + tag
   - Site repo commit SHA (if any)
   - Vercel: `paperboy-site` will auto-redeploy from its push; if the user wants to watch it, suggest `/deploy-watch`.

## What NOT to do

- Don't skip step 3. A failed consumer build that ships to a tag forces a follow-up `0.X.Y+1` to undo it.
- Don't tag before npm publish succeeds — the site consumes the converter from the registry, so it needs the new version on npm first (or a caret that already resolves once publish completes).
- Don't force-push tags. If the publish workflow failed and you need a retry, cut a new patch version instead.
- Don't vendor a converter `.tgz` into `paperboy-site/`.
