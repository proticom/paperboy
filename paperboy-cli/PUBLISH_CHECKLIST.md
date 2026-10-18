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
- [ ] Build copies `dist/lang/eng.traineddata.gz` from pinned `@tesseract.js-data/eng@1.0.0`
- [ ] `npm run test:coverage`
- [ ] `node dist/cli.js --help` runs successfully

## 3) Command Smoke Tests

- [ ] `node dist/cli.js setup` saves the OCR layout-table preference
- [ ] `node dist/cli.js config show` prints valid JSON
- [ ] `node dist/cli.js doctor` reports expected environment checks
- [ ] `node dist/cli.js convert <sample-file> --json` converts and returns metadata

## 4) OCR Behavior

- [ ] Image OCR conversion works on a sample image
- [ ] English OCR works with network access blocked and creates no language cache in the current directory
- [ ] `--no-layout-table` removes positioning table

## 5) Documentation

- [ ] README includes install, setup, convert, doctor, config, and examples
- [ ] README lists supported file types and OCR behavior
- [ ] README covers conversion defaults and config paths
- [ ] Changelog/release notes prepared

## 6) Package Dry Run

- [ ] `npm pack --dry-run` shows expected files only
- [ ] Tarball contains `dist` output and README
- [ ] Tarball contains `dist/lang/eng.traineddata.gz`

## 7) Publish

- [ ] Logged into npm with correct account (`npm whoami`)
- [ ] Scope permissions verified
- [ ] Publish command:

```bash
npm publish --access public
```

## 8) Post-Publish Verification

- [ ] Install from npm in a clean temp folder
- [ ] `paperboy-cli --help` works after global install
- [ ] `paperboy-cli doctor` works after global install
- [ ] `paperboy-cli convert` works on a known sample file
