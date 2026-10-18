---
name: release-cut
description: Ship a release for ONE or more of the four paperboy packages (converter, cli, widget, ext). Prompts the user for which package(s) and what version. Maps tag prefixes to workflows and watches the right publish/release run.
disable-model-invocation: true
---

# Cut a release

End-to-end ship flow for the paperboy monorepo. Each package has its own **tag prefix** and **GitHub Actions workflow**. Four packages ship this way: converter, cli, widget, and ext.

Run all commands from the **monorepo root** (where `AGENTS.md` and `package.json` workspaces live).

## Package → tag → workflow

| Package dir | Publish name | Tag | Workflow | Output |
|-------------|--------------|-----|----------|--------|
| `paperboy-converter/` | `@proticom/paperboy-converter` | `v<version>` | `publish-paperboy-converter.yml` | npm (OIDC) |
| `paperboy-cli/` | `@proticom/paperboy-cli` | `cli-v<version>` | `publish-paperboy.yml` | npm (OIDC) |
| `paperboy-widget/` | `@proticom/paperboy-widget` | `widget-v<version>` | `publish-paperboy-widget.yml` | npm (OIDC) |
| `paperboy-ext/` | `@proticom/paperboy-ext` | `ext-v<version>` | `release-ext.yml` | GitHub Release zip + Chrome Web Store |

## Prerequisites (one-time)

**All releases**

- `gh` CLI authenticated to `github.com/proticom`.
- Working tree clean (`git status` empty) before you start.

**npm packages** (converter, cli, widget)

- [npm Trusted Publisher](https://docs.npmjs.com/trusted-publishers) registered per package on npmjs.com (Proticom scope). Workflows use OIDC — **no `NPM_TOKEN`**.

**Extension** (`paperboy-ext`)

- Chrome Web Store API credentials in repo secrets (`release-ext.yml`). Sideload zip still lands on GitHub Releases.

## Step 1 — Ask which package(s) and version

**Prompt the user up front:**

> Which package are you cutting a release for? (multi-select OK)
>
> 1. **converter** — `@proticom/paperboy-converter` → tag `v*`
> 2. **cli** — `@proticom/paperboy-cli` → tag `cli-v*`
> 3. **widget** — `@proticom/paperboy-widget` → tag `widget-v*`
> 4. **ext** (Chrome extension) — `@proticom/paperboy-ext` → tag `ext-v*`

For **each** selected package, ask for `X.Y.Z` (no prefix in the version string). Default: next patch from that package's `package.json`.

Record the choices in a small table (package → directory → tag → workflow) before proceeding.

## Step 2 — Validate the choice

- **npm packages:** Remind the user Trusted Publisher must exist for that package (no runtime check unless they want `npm view`).
- **ext:** Confirm Chrome Web Store secrets for `release-ext.yml`.

## Step 3 — Bump versions

- **Converter only:** Use workspace-wide bump — `/bump-version` skill or:
  ```bash
  node scripts/bump-version.mjs --check
  node scripts/bump-version.mjs <version>
  (cd paperboy-converter && npm run sync:all)
  ```
  This aligns consumer `package.json` versions that track the converter.

- **Single non-converter package:** Edit **only** that package's `package.json` `version` field (and its lockfile if you run `npm install` there).

- **Multiple packages:** Bump in dependency order: **converter → cli → widget → ext**. Use one version per package (they need not match).

## Step 4 — Build + test every released package

For each selected workspace, run build and test where defined. **Bail on non-zero exit** — do not tag a broken tree.

```bash
npm --workspace=@proticom/paperboy-converter run build
npm --workspace=@proticom/paperboy-converter test

npm --workspace=@proticom/paperboy-cli run build
npm --workspace=@proticom/paperboy-cli test

npm --workspace=@proticom/paperboy-widget run build
npm --workspace=@proticom/paperboy-widget test

# ext
npm --workspace=@proticom/paperboy-ext run build
```

If **converter** was bumped, also verify `paperboy-site/` still builds after updating its converter caret (step 6).

## Step 5 — Commit (monorepo)

```bash
git add -A
git commit -m "release: <pkg1> v<v1>[, <pkg2> v<v2>, ...]"
```

One commit for the whole release batch.

## Step 6 — Site repo sync (converter only)

`paperboy-site/` is a **separate Git repo** under `./paperboy-site/`. **Only if converter was released:**

1. Set `@proticom/paperboy-converter` in `paperboy-site/package.json` to a caret that includes the new version (e.g. `^0.2.3`).
2. `npm install --legacy-peer-deps && npm run build` inside `paperboy-site/`.
3. Commit and push the site repo.

Skip this step for cli / widget / ext-only releases.

## Step 7 — Push monorepo

```bash
git push origin main
```

## Step 8 — Tag + push tags

Push **one tag per package**, in order if multiple (see "What NOT to do"):

| Package | Commands |
|---------|----------|
| converter | `git tag v<version> && git push origin v<version>` |
| cli | `git tag cli-v<version> && git push origin cli-v<version>` |
| widget | `git tag widget-v<version> && git push origin widget-v<version>` |
| ext | `git tag ext-v<version> && git push origin ext-v<version>` |

Wrong prefix triggers the wrong workflow (e.g. `v*` always runs the **converter** publish).

## Step 9 — Watch publish/release runs

After each tag push, watch the matching workflow:

```bash
# converter
gh run watch --exit-status $(gh run list --workflow=publish-paperboy-converter.yml --limit 1 --json databaseId --jq '.[0].databaseId')

# cli
gh run watch --exit-status $(gh run list --workflow=publish-paperboy.yml --limit 1 --json databaseId --jq '.[0].databaseId')

# widget
gh run watch --exit-status $(gh run list --workflow=publish-paperboy-widget.yml --limit 1 --json databaseId --jq '.[0].databaseId')

# ext
gh run watch --exit-status $(gh run list --workflow=release-ext.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

On failure: `gh run view <id> --log-failed` (last ~40 lines).

## Step 10 — Verify

- **npm** (`converter`, `cli`, `widget`):
  ```bash
  npm view @proticom/<package-name>@<version> version
  ```
- **ext:** GitHub Release zip + Chrome Web Store upload success in workflow logs.

## Step 11 — Report

Per package: name, version, tag, publish status, monorepo commit SHA.

If converter: site repo commit SHA and note that Vercel redeploys on site push.

## npm Trusted Publisher recipe

```yaml
permissions:
  contents: read
  id-token: write          # required for OIDC — do not omit
# setup-node@v5: DO NOT set registry-url (avoids empty-token .npmrc)
# publish step: npm publish --access public — no NPM_TOKEN
```

## What NOT to do

- Don't skip step 4. A bad tag forces a follow-up patch to undo.
- Don't tag a non-converter package as `v<version>` — that only publishes the converter.
- Don't push two related tags at once (e.g. `v0.2.3` and `cli-v0.2.7`). **Push converter first**, wait for npm publish, then cli/widget that depend on it.
- Don't force-push tags. Retry with a new patch version instead.
- Don't vendor a converter `.tgz` into `paperboy-site/` (site uses npm registry).
- Don't assume `paperboy-site` is in the monorepo push — it is a nested separate repo.
