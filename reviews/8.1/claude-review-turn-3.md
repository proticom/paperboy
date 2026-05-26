# 8.1 — Review Turn 3 (Decision)

## Task Context
- Task id: 8.1
- Task title: Add converter tests for docx, pdf, epub, xlsx
- Phase: Phase 8 — Cross-cutting hardening
- Turn: 3 of 4
- Builder reply: `reviews/8.1/cursor-reply-turn-2.md`

## Findings

No findings. All turn-2 issues resolved.

### Verification log (reviewer turn 3)

Independent reviewer verification, all commands run from project root unless noted:

```bash
$ cat paperboy-converter/src/handlers/docx.ts
# 27-line handler. No `node:buffer` import. Passes both keys:
#   arrayBuffer: toArrayBuffer(bytes),
#   buffer: bytes as unknown as Buffer,
# Documentation comment explains why both keys are required.

$ grep -rn "node:buffer\|Buffer\.from" paperboy-converter/src/
# only:
#   paperboy-converter/src/handlers/docx.ts:16: // ... no `Buffer.from` wrapping is required.
# (comment text only; no imports, no runtime use)

$ cd paperboy-converter && npm test 2>&1 | tail -10
# Test Files  2 passed (2)
# Tests  13 passed (13)
# (turndown-pdf.test.ts: 2; converter.test.ts: 11 — 7 existing + 4 new binary handlers)

$ cd paperboy-converter && npm run typecheck
# exit 0, no output

$ cd paperboy-app && node scripts/build-converter.mjs
# Bundled converter -> src/scripts/vendor/converter.js
# exit 0 — no esbuild errors

$ grep -A 4 "function convertDocx" paperboy-app/src/scripts/vendor/converter.js | head -7
# async function convertDocx(filename, data, _options) {
#   const bytes = toBytes(data);
#   const result2 = await import_mammoth.default.convertToHtml({
#     arrayBuffer: toArrayBuffer(bytes),
#     buffer: bytes
# (both keys present in bundled output)

$ cd paperboy-app && npm test 2>&1 | tail -8
# Test Files  1 passed (1)
# Tests  6 passed (6)
# (app test suite green with the rebuilt vendored converter)

$ git diff HEAD --stat -- paperboy-converter/src/
# paperboy-converter/src/handlers/docx.ts | 5 +++++
# 1 file changed, 5 insertions(+)  — minimal scope

$ git diff HEAD -- paperboy-converter/package.json
# (empty)

$ ls -la paperboy-converter/tests/fixtures/
# sample.docx 8520 B; sample.epub 1445 B; sample.pdf 861 B; sample.xlsx 15955 B
# Total content ≈ 27 KB (du: 36 KB incl. filesystem block padding) — under 30 KB content budget

$ cat paperboy-converter/.gitattributes
# tests/fixtures/** binary
```

Validation: All commands above exit 0 and match expected outputs.

## Builder Prompt

No further builder action. Closing 8.1 as `review_passed`.

## Consensus Checklist (final, all checked)
- [x] `paperboy-converter/src/handlers/docx.ts` no longer imports `node:buffer`
- [x] `paperboy-converter/src/handlers/docx.ts` passes BOTH `arrayBuffer` and `buffer` to `mammoth.convertToHtml`
- [x] `paperboy-converter/src/handlers/docx.ts` re-imports `toArrayBuffer` from `../helpers.js`
- [x] `npm test` in `paperboy-converter/` green (13 tests)
- [x] `npm run typecheck` in `paperboy-converter/` clean
- [x] `node scripts/build-converter.mjs` in `paperboy-app/` exits 0 (no esbuild errors)
- [x] No other `src/` files changed in `paperboy-converter/`
- [x] No `package.json` change in `paperboy-converter/`
- [x] Fixtures unchanged (still 4 files, total ~27 KB content)
- [x] Tests unchanged from turn 1 (still 4 new `it()` cases with substring assertions)
- [x] `.gitattributes` unchanged (single line: `tests/fixtures/** binary`)
- [x] `Buffer.from` no longer appears anywhere in `paperboy-converter/src/` (only a comment mentioning it)
- [x] Inline comment in `docx.ts` documents WHY both keys are passed (Node vs browser unzip entry)
- [x] `paperboy-app` vendor bundle (`src/scripts/vendor/converter.js`) regenerated and includes both keys
- [x] `paperboy-app/npm test` green (6 tests) with the rebuilt vendor bundle
- [x] Total `tests/fixtures/` size ≤ 30 KB content (27 KB actual)
- [x] Substring assertions only (no full-markdown snapshots)

## Decision

**review_passed.** 8.1 closes Phase 8 task #1 of 5. Coverage gap closed for the four binary handlers (docx/pdf/epub/xlsx), and a latent platform bug in the docx handler — invisible until now because there were no docx tests — is fixed correctly across Node and browser runtimes.

## Notes
- The latent docx handler bug (`{ arrayBuffer: ... }` shape works only in mammoth's browser entry, never in Node) was surfaced by adding the first-ever docx test. The fix (`{ arrayBuffer, buffer }` dual keys) is the clean, isomorphic pattern and is accompanied by an inline code comment so future maintainers understand the shape.
- `bytes as unknown as Buffer` is the type cast required because mammoth's TS types are Node-shaped; we are intentionally passing a `Uint8Array` (which `JSZip.loadAsync` accepts directly) without importing the `node:buffer` global. The cast is correct and minimal.
- This change required edits in two committed bundles: `paperboy-converter/src/handlers/docx.ts` (+5 lines) and `paperboy-app/src/scripts/vendor/converter.js` (regenerated from the converter dist via `paperboy-app/scripts/build-converter.mjs`). Both must be committed together.
- Phase 8 progresses: after 8.1 closes, activator picks 8.2 (CLI crawl tests).
