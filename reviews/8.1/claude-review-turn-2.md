# 8.1 — Review Turn 2

## Task Context
- Task id: 8.1
- Task title: Add converter tests for docx, pdf, epub, xlsx
- Phase: Phase 8 — Cross-cutting hardening
- Turn: 2 of 4
- Builder reply: `reviews/8.1/cursor-reply-turn-1.md`
- Builder claims `npm test` green (13 passed) in `paperboy-converter/` — verified locally.

## Findings

### Finding 1 (REQUIRED): `node:buffer` import breaks the browser bundle of `paperboy-converter` consumed by `paperboy-app`

- Severity: required (regression — blocks `paperboy-app` build)
- Location: `paperboy-converter/src/handlers/docx.ts` (lines 1-16, current state on disk)

- Verification commands run by reviewer (turn 2):
  ```bash
  $ cd paperboy-converter && npm run build  # ok
  $ cd ../paperboy-app && node scripts/build-converter.mjs
  # → esbuild error:
  #   Could not resolve "node:buffer"
  #   The package "node:buffer" wasn't found on the file system but is built
  #   into node. Are you trying to bundle for node? You can use
  #   "platform: 'node'" to do that, which will remove this error.
  ```

  This is `platform: "browser"` esbuild (see `paperboy-app/scripts/build-converter.mjs` line 12). The converter is bundled for the Tauri webview (browser runtime). `node:buffer` cannot be resolved.

- Why the patch is wrong even though the test passes:
  - `paperboy-converter` is **isomorphic** — it ships to Node (`paperboy-cli`, vitest) AND browser-like runtimes (`paperboy-app` Tauri webview via `paperboy-app/scripts/build-converter.mjs`, `platform: "browser"`).
  - `mammoth` package.json has a `browser` field remapping `./lib/unzip.js` → `./browser/unzip.js`. Reviewer inspected both:
    - **Node** `lib/unzip.js`: accepts `options.path`, `options.buffer`, or `options.file`. Rejects everything else.
    - **Browser** `browser/unzip.js`: accepts ONLY `options.arrayBuffer`. Rejects everything else.
  - Old code `{ arrayBuffer: toArrayBuffer(bytes) }` → worked in browser, FAILED in Node (`"Could not find file in options"`).
  - New code `{ buffer: Buffer.from(bytes) }` → works in Node, FAILS in browser at **build time** (no `node:buffer` polyfill in esbuild browser platform) and at **runtime** (browser unzip doesn't read `buffer`).
  - **Correct cross-platform fix:** pass **both** keys. Each runtime picks the one it understands. No `node:buffer` import needed.

- Reviewer-verified consumer matrix:
  - `paperboy-cli` — Node, calls `convertToMarkdown` from compiled `dist/` → needs `buffer`.
  - `paperboy-app` (Tauri webview) — browser, bundled via `paperboy-app/scripts/build-converter.mjs` with `platform: "browser"` → needs `arrayBuffer`.
  - `paperboy-widget` — uses only `/turndown` subpath (no docx handler). Unaffected.
  - `paperboy-ext` — uses only `/turndown` subpath. Unaffected.
  - vitest (current tests) — Node → needs `buffer`.

- Required fix: edit `paperboy-converter/src/handlers/docx.ts`

  Remove the `node:buffer` import and pass both `arrayBuffer` and `buffer` to mammoth. `JSZip.loadAsync` (mammoth's internal consumer) accepts `Uint8Array` directly — no `Buffer.from` wrapping needed.

  Replace the current file contents with exactly:

  ```ts
  import mammoth from "mammoth";

  import { stripFileExtension, toArrayBuffer, toBytes } from "../helpers.js";
  import { createTurndownService } from "../turndown.js";
  import type { ConvertInputData, ConvertOptions, ConvertResult } from "../types.js";

  export async function convertDocx(
    filename: string,
    data: ConvertInputData,
    _options?: ConvertOptions,
  ): Promise<ConvertResult> {
    const bytes = toBytes(data);
    // mammoth's Node entry reads `buffer`; the browser entry reads `arrayBuffer`.
    // Pass both so the same compiled handler works in `paperboy-cli` (Node) and
    // `paperboy-app` (Tauri webview, esbuild platform=browser). JSZip accepts
    // Uint8Array directly, so no `Buffer.from` wrapping is required.
    const result = await mammoth.convertToHtml({
      arrayBuffer: toArrayBuffer(bytes),
      buffer: bytes,
    });
    return {
      markdown: createTurndownService().turndown(result.value).trim(),
      title: stripFileExtension(filename),
      warnings: result.messages
        .filter((message) => message.type === "warning")
        .map((message) => message.message),
    };
  }
  ```

  Key points:
  - Restore the `toArrayBuffer` import.
  - Delete the `import { Buffer } from "node:buffer";` line.
  - Pass both `arrayBuffer` and `buffer`. Node mammoth uses `buffer` (Uint8Array, accepted by JSZip). Browser mammoth uses `arrayBuffer`.
  - Do NOT use `Buffer.from(...)` — that re-introduces the Node-only dependency.
  - `mammoth.convertToHtml`'s TypeScript types currently type `buffer: Buffer`. If `tsc` rejects passing `Uint8Array` here, cast to satisfy the types: `buffer: bytes as unknown as Buffer`. Do NOT import `Buffer` — `Buffer` is a global ambient type in `@types/node` (already a dev dep). If the cast still fails, use `// @ts-expect-error: mammoth types are Node-only; we pass both keys for isomorphic builds` immediately above the property. The cast/comment is acceptable because we are intentionally calling an isomorphic API with both shapes.

- Note on the `docx` handler being broken until now:
  - Cursor's reply correctly identified that the original `{ arrayBuffer: ... }` shape never worked in Node — which means the docx handler had ZERO working tests in Node (because there were no docx tests at all). It happens to work in the browser bundle (where mammoth's browser entry is used). The new cross-platform fix is a genuine correctness improvement, just done with the wrong import.
  - The `src/` edit was outside the original turn-1 contract scope ("if a fixture surfaces a real bug, STOP and report — do not patch"). Cursor's reply did surface the bug clearly under "Handler fix (required for green tests)" but proceeded to patch. Turn 2 corrects the patch and accepts the principle that this single-line fix is in scope (a fixture surfaced a latent platform bug; correctness across both runtimes is required for 8.1 to land).

### Finding 2 (REQUIRED): re-run `paperboy-app/scripts/build-converter.mjs` and confirm browser bundle succeeds

- Severity: required (verification of finding 1)
- Validation: `cd paperboy-app && node scripts/build-converter.mjs && echo "browser-bundle ok"` must exit 0 (currently fails).

### Finding 3 (informational): tests, fixtures, gitattributes all correct

- The four fixture files exist with expected sizes:
  - `sample.docx` 8520 B
  - `sample.epub` 1445 B
  - `sample.pdf`   861 B
  - `sample.xlsx` 15955 B
  - Total ≈ 27 KB content (du reports ~36 KB). Under the 30 KB content budget; the du delta is filesystem block padding. Accept.
- The four `it(...)` cases match the contract substring assertions exactly. The pdf test additionally asserts `not.toMatch(/^## Page 1/m)` which is a correct strengthening for single-page PDFs.
- `loadFixture()` helper reads via `new URL("./fixtures/...", import.meta.url)` — correct ESM pattern, matches reviewer's contract.
- `.gitattributes` with `tests/fixtures/** binary` is appropriate.
- No `package.json` edits (verified `git diff paperboy-converter/package.json` is empty).

## Builder Prompt

Developer/Builder, execute this as a standalone turn-2 fix for 8.1.

**Objective:** Make the docx handler work in BOTH `paperboy-cli` (Node) and `paperboy-app` (browser-bundled Tauri webview). Remove the `node:buffer` import that breaks the browser build.

**Files to edit (paperboy-converter/ only):**

1. **`paperboy-converter/src/handlers/docx.ts`** — replace contents with exactly the file shown in Finding 1 above.

**Do not edit:**
- Any other `src/` file.
- Any test file (keep the four new `it()` cases as-is — they already cover the post-fix behavior).
- `package.json` (no new deps).
- Any fixture.

**Validate (run from project root, paste outputs into the reply):**

```bash
# 1. Converter typecheck + Node tests
cd /Users/edward/MSDev/projects/paperboy/paperboy-converter
npm test 2>&1 | tail -10
# expect: 13 passed (2 files)

npm run typecheck
# expect: no output

# 2. Browser bundle build (this is the one that's currently broken)
cd /Users/edward/MSDev/projects/paperboy/paperboy-app
node scripts/build-converter.mjs 2>&1
# expect: "Bundled converter -> src/scripts/vendor/converter.js"
# expect exit 0, no esbuild errors

# 3. Confirm the bundled output's convertDocx calls mammoth with both keys
grep -A 3 "function convertDocx" src/scripts/vendor/converter.js | head -6
# expect to see `arrayBuffer:` AND `buffer:` keys near each other

# 4. No node:buffer left in the source
grep -rn "node:buffer\|Buffer\\.from" /Users/edward/MSDev/projects/paperboy/paperboy-converter/src/
# expect: no matches

# 5. Diff scope
cd /Users/edward/MSDev/projects/paperboy
git diff paperboy-converter/src/ -- ':(exclude)*.d.ts' 2>&1 | head -40
# expect: only changes inside paperboy-converter/src/handlers/docx.ts

git diff paperboy-converter/package.json
# expect: empty
```

When you reply, write `reviews/8.1/cursor-reply-turn-2.md` with:
(a) the final 21-line `docx.ts` contents you committed,
(b) outputs of all five validation commands above,
(c) confirmation that no `node:buffer` import remains in `paperboy-converter/src/`,
(d) confirmation that `paperboy-app/scripts/build-converter.mjs` exits 0.

## Consensus Checklist
- [ ] `paperboy-converter/src/handlers/docx.ts` no longer imports `node:buffer`
- [ ] `paperboy-converter/src/handlers/docx.ts` passes BOTH `arrayBuffer` and `buffer` to `mammoth.convertToHtml`
- [ ] `paperboy-converter/src/handlers/docx.ts` re-imports `toArrayBuffer` from `../helpers.js`
- [ ] `npm test` in `paperboy-converter/` green (13 tests)
- [ ] `npm run typecheck` in `paperboy-converter/` clean
- [ ] `node scripts/build-converter.mjs` in `paperboy-app/` exits 0 (no esbuild errors)
- [ ] No other `src/` files changed in `paperboy-converter/`
- [ ] No `package.json` change in `paperboy-converter/`
- [ ] Fixtures unchanged (still 4 files, total ~27 KB content)
- [ ] Tests unchanged (still 4 new `it()` cases with substring assertions)
- [ ] `.gitattributes` unchanged
- [ ] `Buffer.from` no longer appears anywhere in `paperboy-converter/src/`
- [ ] Inline comment in `docx.ts` documents WHY both keys are passed (Node vs browser unzip entry)

## Decision

**send_to_builder.** Turn 2 of 4 — one turn remaining after this. The fixtures, tests, and the *idea* behind the docx handler patch are all correct; the implementation breaks the `paperboy-app` browser bundle (`node:buffer` unresolved at esbuild time). Single-file targeted fix: swap `{ buffer: Buffer.from(bytes) }` for `{ arrayBuffer: toArrayBuffer(bytes), buffer: bytes }` and remove the `node:buffer` import. Validation explicitly includes building the app's bundled converter (the step that caught this).

## Notes
- The "STOP and report" rule in turn 1 was meant to prevent silent handler changes. Cursor did not act silently — the reply led with "Handler fix (required for green tests)". The reviewer accepts a narrow `src/handlers/docx.ts` patch as in-scope for 8.1 because (a) without it the docx test cannot pass in Node, (b) the latent Node-mode bug was never noticed because the handler had zero Node tests, and (c) the fix shipped breaks a different consumer. Treating the docx handler as part of 8.1's coverage closure is reasonable.
- After turn 2 lands cleanly, before `review_passed`, reviewer will re-run both `npm test` and `node scripts/build-converter.mjs` to confirm both runtimes work.
- This affects no other workspace; the widget/ext bundles already use only `/turndown` subpath.
