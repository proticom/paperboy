# 3.2 - Review Turn 1

## Task Context
- Task id: 3.2
- Task title: Add paperboy-widget to the npm publish story (workflow + prepublishOnly)
- Dashboard implementation status: todo (in spec) — verified NOT done
- Review status: in_review → waiting_for_builder
- Spec sections: Phase 3 item **3.2**
- Files inspected:
  - `.github/workflows/` (no widget publish workflow)
  - `paperboy-widget/package.json`, `paperboy-widget/` (README/LICENSE)
  - `.github/workflows/publish-paperboy-converter.yml` (corrected 2.2 pattern to mirror)
- Commands run:
  - `ls .github/workflows/publish-paperboy-widget.yml` → absent
  - `jq '{description,license,homepage,repository,keywords,files,scripts}' paperboy-widget/package.json`
  - `ls paperboy-widget/{README.md,LICENSE}`
- Current claim being verified: the widget can be published via a `widget-v*`-tagged workflow and
  ships a well-formed package.

## Findings

### Finding 1: no publish-paperboy-widget.yml workflow
- Severity: required
- Location: `.github/workflows/publish-paperboy-widget.yml` (absent)
- Problem: there is no workflow to publish `@proticom/paperboy-widget`. Phase 3 (item 3.6) cuts a
  `widget-v0.2.2` tag expecting one.
- Spec mismatch / risk: the widget can't be published.
- Required fix: add the workflow, mirroring the **post-2.2** converter workflow (root lockfile
  cache + `npm ci` at root; build/test/publish scoped to `paperboy-widget`). Do NOT copy the
  pre-2.2 per-package-lockfile pattern.
- Code sample / exact change — `.github/workflows/publish-paperboy-widget.yml` (new):
```yaml
name: Publish @proticom/paperboy-widget

on:
  push:
    tags:
      - 'widget-v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v5

      - name: Use Node.js 24
        uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: package-lock.json
          # DO NOT set registry-url — it writes .npmrc with empty token (404s OIDC)

      - name: Install dependencies (root, all workspaces)
        run: npm ci

      - name: Build
        working-directory: paperboy-widget
        run: npm run build

      - name: Run tests
        working-directory: paperboy-widget
        run: npm test

      - name: Publish to npm (OIDC trusted publishing, no token needed)
        working-directory: paperboy-widget
        run: npm publish --access public
```
- Validation:
```
test -f .github/workflows/publish-paperboy-widget.yml && echo present
grep -n "widget-v\*\|cache-dependency-path: package-lock.json\|npm ci" .github/workflows/publish-paperboy-widget.yml
```

### Finding 2: missing prepublishOnly in widget package.json
- Severity: required
- Location: `paperboy-widget/package.json` `scripts`
- Problem: no `prepublishOnly`. The plan wants `npm run build` to run automatically before any
  publish (CI or manual), so the published `dist/` is always fresh.
- Required fix: add the script.
- Code sample / exact change:
```jsonc
// paperboy-widget/package.json -> scripts
"prepublishOnly": "npm run build"
```
- Validation:
```
jq -r '.scripts.prepublishOnly' paperboy-widget/package.json   # "npm run build"
```

### Finding 3: widget package is not fully publish-ready (no homepage, no LICENSE file, thin files)
- Severity: required
- Location: `paperboy-widget/package.json` (`homepage` null, `files: ["dist"]`),
  `paperboy-widget/` (no `LICENSE`)
- Problem: 3.2 adds the widget to "the npm publish story", and 3.6 will publish it. Today it
  declares `license: "MIT"` but ships **no LICENSE file**; `homepage` is null (converter + cli have
  it); `files` lists only `dist` (converter + cli ship README + LICENSE). Description, license
  field, repository, and keywords are already present and fine.
- Spec mismatch / risk: the published package would assert MIT with no license text and omit the
  README/homepage — inconsistent with converter (v0.2.2) and cli (3.1).
- Required fix: add `homepage`, copy the MIT LICENSE, align `files`.
- Code sample / exact change:
```bash
cp paperboy-converter/LICENSE paperboy-widget/LICENSE
```
```jsonc
// paperboy-widget/package.json
"homepage": "https://github.com/proticom/paperboy/tree/main/paperboy-widget#readme",
"files": ["dist", "README.md", "LICENSE"]
```
- Validation:
```
ls paperboy-widget/LICENSE
jq '{homepage, files}' paperboy-widget/package.json
npm pack --dry-run -w @proticom/paperboy-widget 2>&1 | grep -i "license\|readme"
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: make `@proticom/paperboy-widget` publishable via a `widget-v*` workflow, with a fresh
build guaranteed at publish and a well-formed package.

Files to edit:
- `.github/workflows/publish-paperboy-widget.yml` (new — content in Finding 1)
- `paperboy-widget/package.json` (add `prepublishOnly`, `homepage`; set `files`)
- `paperboy-widget/LICENSE` (new — copy from `paperboy-converter/LICENSE`)

Files not to edit:
- the converter/cli publish workflows (done in 2.2/3.1)
- widget `version`, `main`, `description`, `repository`, `keywords` (already correct)

Exact changes: as in the three findings.

Data shapes / CLI examples: tag trigger `widget-v*`; root lockfile cache + `npm ci` at root;
build/test/publish in `paperboy-widget`. `prepublishOnly: npm run build`.

Tests to add or update: none (the workflow runs the existing widget vitest suite).

Commands to run:
- `npm run build -w @proticom/paperboy-widget` (or `cd paperboy-widget && npm run build`)
- `npm test -w @proticom/paperboy-widget`
- `npm pack --dry-run -w @proticom/paperboy-widget` (confirm README + LICENSE in tarball)
- `jq '{scripts:.scripts.prepublishOnly, homepage, files}' paperboy-widget/package.json`

Definition of done:
- `publish-paperboy-widget.yml` exists, triggers on `widget-v*`, installs at root, builds + tests +
  publishes the widget with OIDC.
- `paperboy-widget/package.json` has `prepublishOnly: "npm run build"`, a `homepage`, and
  `files: ["dist","README.md","LICENSE"]`.
- `paperboy-widget/LICENSE` exists; `npm pack --dry-run` includes README + LICENSE.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A blockers; all three required findings have fixes
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions

## Decision
send_to_builder
