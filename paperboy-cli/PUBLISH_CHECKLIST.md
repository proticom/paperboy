# Publish-Ready Checklist

Use this checklist before publishing `@proticom/paperboy-cli`.

## 1) Package Metadata

- [ ] `name` is correct (`@proticom/paperboy-cli`)
- [ ] `version` bumped correctly (semver)
- [ ] `description`, `repository`, `license`, and `engines` are accurate
- [ ] `bin` entries point to built CLI (`dist/cli.js`)
- [ ] `files` only includes publish-safe content (`dist`)

## 2) Build and Type Safety

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run test:coverage`
- [ ] `node dist/cli.js --help` runs successfully

## 3) Command Smoke Tests

- [ ] `node dist/cli.js setup` launches interactive flow
- [ ] `node dist/cli.js config show` prints valid JSON
- [ ] `node dist/cli.js doctor` reports expected environment checks
- [ ] `node dist/cli.js convert <sample-file> --json` converts and returns metadata

## 4) OCR and AI Behavior

- [ ] Image OCR conversion works on a sample image
- [ ] `--no-layout-table` removes positioning table
- [ ] `--describe-image` adds description when AI is configured
- [ ] Deterministic conversion still works with AI mode disabled

## 5) Security and Credential Handling

- [ ] API key storage options work on target OS:
  - [ ] macOS Keychain
  - [ ] Linux `secret-tool` (if available)
  - [ ] dotenv fallback
- [ ] No secrets in committed files
- [ ] `.env` paths are documented and excluded from accidental commits in downstream repos

## 6) Documentation

- [ ] README includes install, setup, convert, doctor, config, and examples
- [ ] README lists supported file types and OCR behavior
- [ ] README covers key storage and config paths
- [ ] Changelog/release notes prepared

## 7) Package Dry Run

- [ ] `npm pack --dry-run` shows expected files only
- [ ] Tarball contains `dist` output and README

## 8) Publish

- [ ] Logged into npm with correct account (`npm whoami`)
- [ ] Scope permissions verified
- [ ] Publish command:

```bash
npm publish --access public
```

## 9) Post-Publish Verification

- [ ] Install from npm in a clean temp folder
- [ ] `paperboy-cli --help` works after global install
- [ ] `paperboy-cli doctor` works after global install
- [ ] `paperboy-cli convert` works on a known sample file
