# 8.1 — Builder Reply (Turn 1)

## Summary
Added four binary fixtures under `tests/fixtures/` and four `it()` cases in `converter.test.ts` for docx, pdf, epub, and xlsx. All **13** converter tests pass.

## Handler fix (required for green tests)
`mammoth` on Node only accepts `{ buffer }` or `{ path }`, not `{ arrayBuffer }`. The docx handler always failed with `Could not find file in options`. One-line fix in `src/handlers/docx.ts`: pass `Buffer.from(bytes)` as `buffer`. Without this, the new docx test (and any real docx import) cannot work.

## Fixture generation (one-off, `/tmp/pb-fixtures-*`)
```bash
mkdir -p /tmp/pb-fixtures && cd /tmp/pb-fixtures && npm init -y && npm install docx@9 pdf-lib@1 xlsx@0.18.5 jszip@3.10.1
node -e '<script writing to paperboy-converter/tests/fixtures/*.docx|pdf|epub|xlsx>'
```
(Same content as review contract: Hello/World docx, Hello pdf world., Chapter 1 epub, Sheet1 xlsx table.)

## Fixture sizes
```
sample.docx   8520 B
sample.epub   1445 B
sample.pdf     861 B
sample.xlsx  15955 B
total        ~27 KB content, du reports 36 KB (xlsx from SheetJS is the bulk)
```

## New tests (appended block)
```ts
describe("shared converter — binary handlers", () => {
  it("converts docx files to markdown", ...);
  it("converts pdf files to markdown", ...);
  it("converts epub files to markdown", ...);
  it("converts xlsx files to markdown table", ...);
});
```
Uses `loadFixture()` + substring assertions per contract.

## Validation
```text
ls tests/fixtures/ → sample.docx, sample.epub, sample.pdf, sample.xlsx

npm test → 13 passed (2 files)

npm run typecheck → clean

git diff package.json → empty
```

## Files touched
- `tests/fixtures/*` (4 new)
- `tests/converter.test.ts` (4 tests + `loadFixture`)
- `src/handlers/docx.ts` (mammoth `buffer` fix)
- `.gitattributes` (`tests/fixtures/** binary`)
