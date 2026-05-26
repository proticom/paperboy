---
name: npm-trusted-publisher
description: One-time npm Trusted Publisher (OIDC) setup for @proticom/paperboy-converter, @proticom/paperboy-ai, @proticom/paperboy-cli, and @proticom/paperboy-widget. Use before the first tag-driven publish, when publish workflows 404, or when onboarding a new maintainer to npm publish rights. Documents manual npmjs.com steps only — the agent cannot configure npm.com.
disable-model-invocation: true
---

# npm Trusted Publisher Setup (OIDC)

**Manual, one-time configuration on npmjs.com.** GitHub Actions publish workflows authenticate via OIDC — no `NPM_TOKEN` secret. npm must trust each package's workflow before tag pushes can publish.

Same pattern as [Gnosys](https://www.npmjs.com/package/gnosys) / `@proticom` org setup.

## Packages and workflows

| npm package | Workflow file | Tag trigger |
|-------------|---------------|-------------|
| `@proticom/paperboy-converter` | `.github/workflows/publish-paperboy-converter.yml` | `v*` (e.g. `v0.2.2`) |
| `@proticom/paperboy-ai` | `.github/workflows/publish-paperboy-ai.yml` | `ai-v*` (e.g. `ai-v0.2.2`) |
| `@proticom/paperboy-cli` | `.github/workflows/publish-paperboy.yml` | `cli-v*` (e.g. `cli-v0.2.3`) |
| `@proticom/paperboy-widget` | `.github/workflows/publish-paperboy-widget.yml` | `widget-v*` (e.g. `widget-v0.2.2`) |

**GitHub repo:** `proticom/paperboy`

All four workflows:

- Run `npm ci` at the **monorepo root** (root `package-lock.json`)
- Use `actions/setup-node@v5` with `cache: npm` and `cache-dependency-path: package-lock.json`
- Publish with `id-token: write` (OIDC) — **do not** set `registry-url` in `setup-node`

## Why this is required

Without Trusted Publisher entries, `npm publish` in CI fails (typically 404 or auth errors). The workflows are already wired for OIDC; npm.com must whitelist which repo + workflow filename may publish each package.

## Steps (per package, on npmjs.com)

Requires `@proticom` org membership with publish rights for the package.

1. Open [npmjs.com](https://www.npmjs.com/) → the package (or org package settings for a first-ever package).
2. **Settings** → **Trusted Publisher** → **GitHub Actions**.
3. Set:
   - **Organization or user:** `proticom`
   - **Repository:** `paperboy`
   - **Workflow filename:** the matching `publish-paperboy-*.yml` from the table above (filename only, e.g. `publish-paperboy-converter.yml`)
   - **Environment:** leave blank unless the workflow uses a GitHub Environment
4. **Save**.
5. Repeat for all four packages (four separate Trusted Publisher entries).

## First-publish caveat

If npm will not let you configure Trusted Publisher before the package exists on the registry:

1. Perform **one** initial `npm publish --access public` locally or in CI using a granular npm automation token.
2. Then configure Trusted Publisher on npm.com for that package.
3. All subsequent publishes should use tag-triggered OIDC workflows only.

Check [npm Trusted Publishers docs](https://docs.npmjs.com/trusted-publishers) at setup time and record whichever path you used.

## Gotcha: do not set `registry-url`

The publish workflows include this comment for a reason:

> DO NOT set registry-url — it writes .npmrc with empty token (404s OIDC)

`actions/setup-node` with `registry-url` injects an `.npmrc` that overrides OIDC and breaks publish.

## Verify after setup

1. Cut the appropriate tag (see `/release-cut` or Phase 3 plan).
2. Confirm the GitHub Actions publish workflow succeeds.
3. Confirm the version landed on npm:

```bash
npm view @proticom/paperboy-converter@<version>
npm view @proticom/paperboy-cli@<version>
npm view @proticom/paperboy-widget@<version>
```

Each should show the expected version, `dist-tags.latest`, and repository metadata pointing at `github.com/proticom/paperboy`.

## Related

- Monorepo publish overview: root `AGENTS.md` → *npm publishing*
- Ship flow after setup: `.claude/skills/release-cut/SKILL.md`
- Publish workflow lockfile fix: Phase 2 task 2.2 (root `npm ci`)
