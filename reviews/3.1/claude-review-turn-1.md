# 3.1 - Review Turn 1

## Task Context
- Task id: 3.1
- Task title: Complete CLI package.json metadata (match the converter's format)
- Dashboard implementation status: todo (in spec) — verified NOT done
- Review status: in_review → waiting_for_builder
- Spec sections: Phase 3 item **3.1**
- Files inspected:
  - `paperboy-cli/package.json` (current metadata)
  - `paperboy-converter/package.json` (reference format)
  - `paperboy-cli/` and `paperboy-converter/` (README/LICENSE presence)
- Commands run:
  - `jq '{name,description,license,homepage,repository,keywords,files}' paperboy-cli/package.json paperboy-converter/package.json`
  - `ls paperboy-cli/{README.md,LICENSE} paperboy-converter/{README.md,LICENSE}`
- Current claim being verified: the CLI package has complete, publish-ready metadata matching the
  converter.

## Findings

### Finding 1: CLI package.json is missing license, homepage, repository, keywords; description is generic
- Severity: required
- Location: `paperboy-cli/package.json`
- Problem: `license`, `homepage`, `repository`, and `keywords` are all absent; `description` is the
  generic "Paperboy document-to-markdown converter and CLI". The converter package has all of
  these. npm publish (Phase 3) should ship complete metadata.
- Spec mismatch / risk: thin/again-missing metadata on a first-ever publish; no repository link,
  no license declared, poor discoverability.
- Required fix: add the five fields, modeled on the converter.
- Code sample / exact change — set in `paperboy-cli/package.json`:
```jsonc
{
  "description": "Command-line edition of Paperboy: convert files and crawl entire sites to clean Markdown — offline, deterministic, scriptable (PDF, DOCX, EPUB, HTML, OCR, and more).",
  "license": "MIT",
  "homepage": "https://github.com/proticom/paperboy/tree/main/paperboy-cli#readme",
  "repository": {
    "type": "git",
    "url": "https://github.com/proticom/paperboy.git",
    "directory": "paperboy-cli"
  },
  "keywords": [
    "markdown",
    "cli",
    "command-line",
    "converter",
    "crawl",
    "crawler",
    "sitemap",
    "pdf",
    "docx",
    "epub",
    "html",
    "ocr",
    "paperboy"
  ]
}
```
- Validation:
```
jq '{license, homepage, repository, keywords, description}' paperboy-cli/package.json
node -e "require('./paperboy-cli/package.json')"   # valid JSON
```

### Finding 2: no LICENSE file in paperboy-cli (converter ships one; `files` differs)
- Severity: required
- Location: `paperboy-cli/` (no `LICENSE`); `paperboy-cli/package.json` `files: ["dist"]`
- Problem: "Match the converter's format" — the converter ships a `LICENSE` file and declares
  `files: ["dist", "README.md", "LICENSE"]`. The CLI has `README.md` but no `LICENSE`, and its
  `files` lists only `dist`. Declaring `license: "MIT"` without shipping the license text is
  incomplete.
- Spec mismatch / risk: published package asserts MIT but carries no license text.
- Required fix: copy the converter's MIT `LICENSE` into `paperboy-cli/` and align `files`.
- Code sample / exact change:
```bash
cp paperboy-converter/LICENSE paperboy-cli/LICENSE
```
```jsonc
// paperboy-cli/package.json
"files": ["dist", "README.md", "LICENSE"]
```
- Validation:
```
ls paperboy-cli/LICENSE
jq '.files' paperboy-cli/package.json     # ["dist","README.md","LICENSE"]
npm pack --dry-run -w @proticom/paperboy-cli 2>&1 | grep -i "license\|readme"
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: give `@proticom/paperboy-cli` complete, publish-ready metadata matching the converter.

Files to edit:
- `paperboy-cli/package.json` (add the five fields from Finding 1; set `files` from Finding 2)
- `paperboy-cli/LICENSE` (new — copy from `paperboy-converter/LICENSE`)

Files not to edit:
- `paperboy-converter/package.json` (reference only)
- version/bin/main/types in the CLI (already correct)

Exact changes: apply the JSON from Finding 1 and the LICENSE copy + `files` from Finding 2.

Data shapes / CLI examples: `repository.directory` must be `paperboy-cli`; homepage points at the
`paperboy-cli` subtree; keywords reflect convert + crawl.

Tests to add or update: none (package metadata).

Commands to run:
- `jq '{license,homepage,repository,keywords,description,files}' paperboy-cli/package.json`
- `ls paperboy-cli/LICENSE`
- `node -e "JSON.parse(require('fs').readFileSync('paperboy-cli/package.json','utf8'))"`

Definition of done:
- `paperboy-cli/package.json` has `license: "MIT"`, `homepage`, `repository` (directory
  paperboy-cli), expanded `description`, and `keywords`.
- `paperboy-cli/LICENSE` exists; `files` includes `dist`, `README.md`, `LICENSE`.
- package.json remains valid JSON.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A blockers; both required findings have fixes
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- No open questions

## Decision
send_to_builder
