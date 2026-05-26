# 8.1 — Review Turn 1

## Task Context
- Task id: 8.1
- Task title: Add converter tests for docx, pdf, epub, xlsx
- Dashboard implementation status: in_progress (queue auto-activated 8.1 when 7.3 closed)
- Review status: in_review → waiting_for_builder
- Phase: Phase 8 — Cross-cutting hardening
- Turn: 1 of 4
- Spec section (verbatim from `/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md` line 157):
  > "**8.1** Add converter tests for **docx**, **pdf**, **epub**, **xlsx** using committed fixtures. These four handlers ship zero coverage today ([paperboy-converter/tests/converter.test.ts](paperboy-converter/tests/converter.test.ts))."

- Related context (verified):
  - Working tree: `paperboy-converter/` (monorepo workspace, branch `main`).
  - Existing test file: `paperboy-converter/tests/converter.test.ts` (100 lines) covers `txt`, `html`, `rtf`, `csv`, unsupported extension, image (OCR), image (no OCR). **Zero coverage for docx/pdf/epub/xlsx.**
  - Existing fixtures directory: **none yet** (`paperboy-converter/tests/fixtures/` does not exist). 8.1 introduces it.
  - Test runner: `vitest` (`paperboy-converter/package.json` script `test` = `npm run build && vitest run`). Already wired.
  - Public entry: `convertToMarkdown(filename, data, options?)` from `../src/index.js` — same call shape as existing tests.
  - Handler internals (verified):
    - **docx** (`src/handlers/docx.ts`): uses `mammoth.convertToHtml` then `turndown`. Returns `{ markdown, title, warnings }`. Warnings come from `mammoth` messages where `type === "warning"`.
    - **pdf** (`src/handlers/pdf.ts`): uses `unpdf.extractText` (`mergePages: false`). For single-page PDFs, no `## Page N` header; for multi-page, prefixes each page with `## Page N`. Warnings:
      - "No selectable text was found. This PDF may be image-based." (zero non-empty pages)
      - "Some pages had little or no extractable text." (some pages empty)
    - **epub** (`src/handlers/epub.ts`): uses `JSZip` + `parseXml`/`parseHtml`. Reads `META-INF/container.xml`, follows `rootfile/full-path` to package.opf, walks `manifest > item` + `spine > itemref` to order chapters. Each chapter renders as `## <title>\n\n<markdown>`. Fallback path scans all `*.xhtml`/`*.html` if container/package/spine missing. Specific warning strings exist for each fallback branch.
    - **xlsx** (`src/handlers/xlsx.ts`): uses `XLSX.read` (`type: "array"`). Iterates `workbook.SheetNames`, renders each non-empty sheet as `## <sheetName>\n\n<markdown table>`. Empty sheets emit `Sheet "X" is empty and was skipped.` warning. Whole workbook with no data emits `No readable sheet data was found in this workbook.`
  - Build/test convention: `convertToMarkdown` is async and accepts `Uint8Array | ArrayBuffer | string` for binary handlers. Test must pass `Uint8Array` from `readFileSync` for docx/pdf/epub/xlsx (binary), or build the fixture in-memory.

- Files inspected:
  - `paperboy-converter/tests/converter.test.ts` (existing test suite)
  - `paperboy-converter/src/handlers/docx.ts`, `pdf.ts`, `epub.ts`, `xlsx.ts`
  - `paperboy-converter/package.json` (scripts + devDeps)
- Commands run (turn 1, read-only):
  ```bash
  $ ls paperboy-converter/src/handlers/
  # csv.ts docx.ts epub.ts html.ts image.ts pdf.ts rtf.ts text.ts xlsx.ts

  $ ls paperboy-converter/tests/
  # converter.test.ts turndown-pdf.test.ts

  $ ls paperboy-converter/tests/fixtures/ 2>&1
  # No such file or directory

  $ grep -n "docx\|pdf\|epub\|xlsx" paperboy-converter/tests/converter.test.ts
  # (no matches)
  ```
- Current claim: 8.1 turn 1, queue token `8.1-0001`. Fresh task, no builder commit yet.

## Findings

### Finding 1: Add `tests/fixtures/` plus four new test groups covering docx/pdf/epub/xlsx in `converter.test.ts`

- Severity: required (this is the entire body of work for 8.1)
- Location:
  - **New directory** `paperboy-converter/tests/fixtures/` with four binary fixtures.
  - **Modify** `paperboy-converter/tests/converter.test.ts` — append four new `describe`-or-`it` groups (one per handler).
  - **No edits** to `src/` (this is a pure test addition; if a test fails because a handler has a real bug, surface it and stop — do not patch the handler in this turn).

- Problem (current state):
  1. `tests/converter.test.ts` has zero coverage for the four binary handlers (`docx`, `pdf`, `epub`, `xlsx`). Each ships real production code (mammoth, unpdf, JSZip+xml parsing, xlsx) with non-trivial branching (warnings, fallback paths, multi-section output) and no tests guarding regressions.
  2. The repo has no committed binary fixtures for these formats.
  3. Phase 8 is the final hardening phase; closing the converter coverage gap is a prerequisite for the release-cut workflow.

- Why fixtures (not synthesized bytes):
  - docx/xlsx/epub are ZIP-based formats. Building a valid one in-memory inside the test file is possible (the `xlsx` and `JSZip` npm packages can also *write*) but bulky. Committed fixtures keep the test file readable.
  - pdf cannot be assembled by-hand in a unit test without pulling a generator.
  - A real `.docx`/`.xlsx`/`.epub`/`.pdf` exercises the handler's real parse path end-to-end — synthetic mocks would hide bugs in the third-party libraries' integration.
  - Fixtures should be **tiny** (<5 KB each ideally) and **deterministic** so test output is stable.

- Spec mismatch / risk:
  - **In scope (8.1):**
    1. Create `paperboy-converter/tests/fixtures/` with four binary fixtures:
       - `sample.docx` — a minimal Word doc with one heading "Hello" and one paragraph "World" (Mammoth should render `# Hello\n\nWorld`). Generate via `python -c "from docx import Document; ..."` if available, OR Node-side via the `docx` npm package (one-off, not added to deps), OR commit a hand-built minimal fixture. Builder picks the path that lands a stable byte stream.
       - `sample.pdf` — a minimal 1-page (or 2-page) PDF whose extracted text deterministically contains a known sentinel string. Single-page output should NOT include `## Page 1` header (per handler logic). Builder can hand-craft a minimal PDF (the PDF format permits tiny hand-built files) OR use a one-off generator script that runs locally.
       - `sample.epub` — a minimal EPUB with one chapter ("Chapter 1") containing a heading + paragraph. Output should contain `## Chapter 1` (or whatever the `<title>` tag is) and the body text.
       - `sample.xlsx` — a minimal workbook with one named sheet "Sheet1" containing two rows: header `Name,Role` and one data row `Ada,Engineer`. Output should contain `## Sheet1` and the markdown table.
       - Fixtures committed to git (binary). Size budget: total `tests/fixtures/` ≤ 30 KB.
    2. Extend `paperboy-converter/tests/converter.test.ts`:
       - Read each fixture with `readFileSync(new URL("./fixtures/sample.docx", import.meta.url))` (returns `Buffer`/`Uint8Array`-compatible).
       - Call `convertToMarkdown("sample.docx", bytes)` for each.
       - Assertions per handler (minimums):
         - **docx**: `result.title === "sample"`; `result.markdown` contains the known heading text (e.g., `"Hello"` and `"World"`); `result.warnings` is an array (empty for the clean fixture).
         - **pdf**: `result.title === "sample"`; `result.markdown` contains the sentinel text; `result.warnings` is an array. If you use a multi-page fixture, also assert the markdown contains `## Page 1` and `## Page 2`. If single-page, assert markdown does NOT start with `## Page 1`.
         - **epub**: `result.title === "sample"`; `result.markdown` contains the chapter heading (e.g., `## Chapter 1`) and the chapter body text; `result.warnings` is an array (empty for a well-formed fixture).
         - **xlsx**: `result.title === "sample"`; `result.markdown` contains `## Sheet1`; `result.markdown` contains `| Name | Role |` and `| Ada | Engineer |`; `result.warnings` is empty.
    3. Run `npm test` from `paperboy-converter/` and confirm all tests pass (existing 8 + new 4 = 12 minimum).

  - **Out of scope (8.1, defer if proposed):**
    - Tests for CLI crawl (8.2), widget integration (8.3), release-cut skill (8.4), CHANGELOG.md (8.5).
    - Tests for text/html/csv/rtf/image handlers (already covered).
    - Tests for warning branches (fallback paths in epub, empty-sheet in xlsx, image-only pdf). Optional: if builder adds them, fine — but not required by 8.1. Keep PR small.
    - Adding `docx`/`epub`-write libraries as devDependencies just for fixture generation. Generate fixtures **once** with a one-off command and commit the bytes; do not add a generator to `package.json`.
    - Editing `src/handlers/*.ts`. If a fixture surfaces a real bug, stop and report in the reply — do NOT silently patch.
    - Adding fixtures larger than 30 KB total. Keep them minimal.
    - Cross-platform line-ending normalization in fixtures (commit them as binary; do not let `.gitattributes` mangle them — confirm `git check-attr -a tests/fixtures/sample.docx` returns nothing unusual, OR add a `.gitattributes` line `tests/fixtures/** binary`).
    - Touching the monorepo or any other workspace.

- Required fix:

  **1. Create fixtures.** Recommended approach (run locally, commit the byte output):

  ```bash
  cd /Users/edward/MSDev/projects/paperboy/paperboy-converter
  mkdir -p tests/fixtures

  # docx: smallest path — write a minimal one-off script that uses the
  # `docx` npm package (npx-installed, not committed):
  npx --yes --package=docx -- node -e '
    const { Document, Packer, Paragraph, HeadingLevel } = require("docx");
    const fs = require("fs");
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: "Hello", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: "World" }),
        ],
      }],
    });
    Packer.toBuffer(doc).then(buf => fs.writeFileSync("tests/fixtures/sample.docx", buf));
  '

  # xlsx: use the xlsx package that paperboy-converter already depends on
  node -e '
    const XLSX = require("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["Name", "Role"], ["Ada", "Engineer"]]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "tests/fixtures/sample.xlsx");
  '

  # epub: use JSZip (already a paperboy-converter dep) — write a minimal EPUB
  node -e '
    const JSZip = require("jszip");
    const fs = require("fs");
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip");
    zip.file("META-INF/container.xml",
      `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>`);
    zip.file("OEBPS/content.opf",
      `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">\n  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Sample</dc:title><dc:identifier id="bookid">x</dc:identifier><dc:language>en</dc:language></metadata>\n  <manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest>\n  <spine><itemref idref="ch1"/></spine>\n</package>`);
    zip.file("OEBPS/ch1.xhtml",
      `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head><body><h1>Chapter 1</h1><p>Hello epub world.</p></body></html>`);
    zip.generateAsync({ type: "nodebuffer" }).then(buf => fs.writeFileSync("tests/fixtures/sample.epub", buf));
  '

  # pdf: smallest reliable path — write a minimal hand-rolled PDF.
  # If hand-rolling is fiddly, use a one-off generator (e.g. pdf-lib via npx).
  # The fixture must contain a known sentinel string ("Hello pdf world.") that
  # unpdf.extractText returns when called from convertPdf().
  npx --yes --package=pdf-lib -- node -e '
    const { PDFDocument, StandardFonts } = require("pdf-lib");
    const fs = require("fs");
    (async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([300, 200]);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      page.drawText("Hello pdf world.", { x: 50, y: 100, size: 14, font });
      const bytes = await doc.save();
      fs.writeFileSync("tests/fixtures/sample.pdf", bytes);
    })();
  '

  ls -la tests/fixtures/
  # expect: sample.docx, sample.epub, sample.pdf, sample.xlsx — all ≤ ~10 KB
  ```

  Builder may use alternative generators (e.g., a Python one-liner for docx/xlsx) as long as the resulting fixtures are minimal (<10 KB each), deterministic, and exercise the handler's primary path. If a fixture can't be reliably generated, document the chosen path in the reply.

  **2. Edit `paperboy-converter/tests/converter.test.ts`** — append the four new test cases inside the existing `describe("shared converter", () => { ... })` block (or in a new sibling `describe` if cleaner). Import `readFileSync` from `node:fs` at the top of the file:

  ```ts
  import { readFileSync } from "node:fs";
  import { describe, expect, it } from "vitest";

  import { convertToMarkdown } from "../src/index.js";

  function loadFixture(name: string): Uint8Array {
    const url = new URL(`./fixtures/${name}`, import.meta.url);
    return new Uint8Array(readFileSync(url));
  }

  describe("shared converter — binary handlers", () => {
    it("converts docx files to markdown", async () => {
      const bytes = loadFixture("sample.docx");
      const result = await convertToMarkdown("sample.docx", bytes);
      expect(result.title).toBe("sample");
      expect(result.markdown).toContain("Hello");
      expect(result.markdown).toContain("World");
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it("converts pdf files to markdown", async () => {
      const bytes = loadFixture("sample.pdf");
      const result = await convertToMarkdown("sample.pdf", bytes);
      expect(result.title).toBe("sample");
      expect(result.markdown).toContain("Hello pdf world.");
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it("converts epub files to markdown", async () => {
      const bytes = loadFixture("sample.epub");
      const result = await convertToMarkdown("sample.epub", bytes);
      expect(result.title).toBe("sample");
      expect(result.markdown).toContain("Chapter 1");
      expect(result.markdown).toContain("Hello epub world.");
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it("converts xlsx files to markdown table", async () => {
      const bytes = loadFixture("sample.xlsx");
      const result = await convertToMarkdown("sample.xlsx", bytes);
      expect(result.title).toBe("sample");
      expect(result.markdown).toContain("## Sheet1");
      expect(result.markdown).toContain("| Name | Role |");
      expect(result.markdown).toContain("| Ada | Engineer |");
      expect(result.warnings).toEqual([]);
    });
  });
  ```

  Adjust assertion strings to match the exact text inside the fixtures you generate. The names "Hello", "World", "Hello pdf world.", "Hello epub world.", "Chapter 1", "Sheet1", "Ada", "Engineer" are recommended canonical fixtures — keep them stable so future maintenance is mechanical.

  **3. Validate locally:**

  ```bash
  cd /Users/edward/MSDev/projects/paperboy/paperboy-converter
  npm test 2>&1 | tail -20
  # expect: "Test Files  X passed" / "Tests  Y passed" with Y ≥ 12 (existing 8 + new 4)
  ```

  **Builder rules:**
  - **`paperboy-converter/` only.** Do not touch other workspaces, the monorepo root, or the site repo.
  - **Files to create (5 total):**
    1. `paperboy-converter/tests/fixtures/sample.docx`
    2. `paperboy-converter/tests/fixtures/sample.pdf`
    3. `paperboy-converter/tests/fixtures/sample.epub`
    4. `paperboy-converter/tests/fixtures/sample.xlsx`
    5. (Optional) `paperboy-converter/.gitattributes` with `tests/fixtures/** binary` (only if needed to keep git from mangling CRLF).
  - **Files to modify (1 total):**
    1. `paperboy-converter/tests/converter.test.ts`
  - Do **not** edit any `src/` file.
  - Do **not** add new dependencies to `package.json` (use `npx --yes` for one-off fixture generation; the runtime tests use already-shipped deps like `xlsx` and `JSZip` only for fixture creation, NOT for test imports).
  - Do **not** snapshot the entire markdown output — assert contained substrings only. Substring assertions are robust to whitespace changes; full-string assertions are brittle and will break on innocuous mammoth/turndown upgrades.
  - The 4 new tests MUST pass against the committed fixtures.
  - Total `tests/fixtures/` size budget: ≤ 30 KB.

- Validation:

  ```bash
  cd /Users/edward/MSDev/projects/paperboy/paperboy-converter

  # 1. New fixtures committed
  ls -la tests/fixtures/
  # expect: sample.docx, sample.epub, sample.pdf, sample.xlsx (each ≤ ~10 KB)

  du -k tests/fixtures/ | tail -1
  # expect: total ≤ 30 KB

  # 2. Test file updated
  git status --short
  # expect:
  #  M tests/converter.test.ts
  # A  tests/fixtures/sample.docx
  # A  tests/fixtures/sample.epub
  # A  tests/fixtures/sample.pdf
  # A  tests/fixtures/sample.xlsx
  # (and possibly: A  .gitattributes)

  # 3. No src/ edits
  git diff src/
  # expect: empty

  # 4. No package.json edits (no new deps)
  git diff package.json
  # expect: empty

  # 5. All tests pass
  npm test 2>&1 | tail -10
  # expect: a "passed" summary line with ≥ 12 tests (existing 8 + new 4)
  # expect exit code 0

  # 6. TypeScript still clean
  npm run typecheck
  # expect: no output

  # 7. No monorepo or other workspace changes
  cd /Users/edward/MSDev/projects/paperboy && git status --short
  # expect: only reviews/8.1/ artifacts + dashboard files; no other monorepo edits
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 8.1.

**Objective:** Close the test-coverage gap for the four binary converter handlers (`docx`, `pdf`, `epub`, `xlsx`). Commit minimal binary fixtures and add four focused tests that confirm each handler returns the expected markdown shape.

**Files to create / edit (paperboy-converter/ only):**

1. **`paperboy-converter/tests/fixtures/sample.docx`** — minimal Word doc; canonical content: heading "Hello" + paragraph "World".
2. **`paperboy-converter/tests/fixtures/sample.pdf`** — minimal 1-page PDF containing the sentinel "Hello pdf world."
3. **`paperboy-converter/tests/fixtures/sample.epub`** — minimal EPUB with one chapter titled "Chapter 1" containing "Hello epub world."
4. **`paperboy-converter/tests/fixtures/sample.xlsx`** — minimal workbook with sheet "Sheet1" holding `[["Name","Role"],["Ada","Engineer"]]`.
5. **`paperboy-converter/tests/converter.test.ts`** — append four `it(...)` cases inside a new `describe("shared converter — binary handlers", ...)` block (or extend the existing `describe`). Assert title + key substrings + warnings array shape. Do NOT snapshot the full markdown.

**Generation paths** (use whichever produces stable bytes; do NOT add fixture generators to `package.json`):
- docx: `npx --yes --package=docx -- node -e '...'`
- xlsx: `npx --yes --package=xlsx -- node -e '...'` (or use the workspace dep)
- epub: hand-rolled via `JSZip` (workspace dep) — see Required Fix.
- pdf: `npx --yes --package=pdf-lib -- node -e '...'`

Builder may swap to Python-based generation if it produces smaller/more deterministic bytes; please note the path you used in the reply.

**Do not edit:**
- `paperboy-converter/src/**` (if a fixture surfaces a real bug, STOP and report — do not patch the handler).
- `paperboy-converter/package.json` (no new deps).
- Anything outside `paperboy-converter/`.
- Any monorepo file (no Cargo, no other workspace, no site).

**Validate (run from `paperboy-converter/` and paste outputs into the reply):**

```bash
cd /Users/edward/MSDev/projects/paperboy/paperboy-converter

ls -la tests/fixtures/
# expect: 4 files (sample.docx, sample.epub, sample.pdf, sample.xlsx)

du -k tests/fixtures/ | tail -1
# expect: total ≤ 30 KB

git status --short
# expect: 1 M (tests/converter.test.ts) + 4 A (tests/fixtures/*)

git diff src/
# expect: empty

git diff package.json
# expect: empty

npm test 2>&1 | tail -20
# expect: a "passed" summary with all tests green (≥ 12 tests)

npm run typecheck
# expect: no output
```

When you reply, write `reviews/8.1/cursor-reply-turn-1.md` with: (a) the new test code block (the appended `describe`/`it` cases); (b) the generation commands you actually ran for each fixture (so they can be reproduced); (c) the output of each validation command above; (d) the total fixture size; (e) confirmation that `git diff src/` and `git diff package.json` are both empty.

## Consensus Checklist
- [ ] `tests/fixtures/sample.docx` exists (≤ 10 KB)
- [ ] `tests/fixtures/sample.pdf` exists (≤ 10 KB)
- [ ] `tests/fixtures/sample.epub` exists (≤ 10 KB)
- [ ] `tests/fixtures/sample.xlsx` exists (≤ 10 KB)
- [ ] Total `tests/fixtures/` size ≤ 30 KB
- [ ] `tests/converter.test.ts` has 4 new `it(...)` cases — one per handler
- [ ] docx test asserts title + "Hello"/"World" substrings + warnings shape
- [ ] pdf test asserts title + "Hello pdf world." substring + warnings shape
- [ ] epub test asserts title + "Chapter 1" + body substring + warnings shape
- [ ] xlsx test asserts title + "## Sheet1" + table substring + empty warnings
- [ ] No edits to `paperboy-converter/src/**`
- [ ] No edits to `paperboy-converter/package.json` (no new deps)
- [ ] `npm test` exits 0 with all tests passing
- [ ] `npm run typecheck` clean
- [ ] No other workspace or monorepo changes
- [ ] Substring assertions only (no full-markdown snapshots)

## Decision
**send_to_builder.** Fresh task, no builder commit yet. Scope: 4 new binary fixtures + 4 new test cases in `paperboy-converter/`. Public-API tests only (`convertToMarkdown` from `src/index.js`) — no internal handler imports, no `src/` edits, no new dependencies. Substring assertions are intentional to avoid brittle snapshots. 17-item validation checklist.

## Notes
- Why public-API tests, not unit tests on each handler module: the existing test file (`converter.test.ts`) follows the public-API pattern (`import { convertToMarkdown }`); staying consistent makes the new tests trivially relocatable if the internal handler split is refactored.
- Why substring assertions, not snapshots: mammoth, turndown, unpdf, JSZip, and xlsx all evolve their string output across minor versions. A `.toContain("Hello")` test is robust; a snapshot of the full markdown is brittle and noisy.
- Why no warning-branch tests: each handler has 2-3 warning branches (image-only PDF, missing EPUB container, empty sheets). Adding them all bloats the PR. 8.1 is "primary-path coverage exists at all" — branch coverage can land later if needed.
- Why no new dependencies: fixture generation is a one-shot operation (`npx --yes`) — adding `docx`/`pdf-lib` as devDeps would pull ~30 MB just to produce 4 tiny files committed once. The runtime tests only use existing workspace deps + `node:fs`.
- Why fixtures live in `tests/fixtures/` and not `tests/__fixtures__/`: matches Vitest convention; the existing test file does not use `__fixtures__` so introducing it would be a style change.
- Phase 8 progresses: after 8.1 closes, activator picks 8.2 (CLI crawl tests). 8.3 (widget integration), 8.4 (release-cut skill), 8.5 (CHANGELOGs) follow.
