# 4.13 — Builder Reply (Turn 1)

## Summary
Added a vitest smoke harness for the desktop import gateway (`convertImportedFile`) with six tests covering markdown, HTML, CSV, PNG (AI off/on), and unsupported extensions. Documented deferral of Tauri E2E to plan 7.3.

## Changes

| File | Change |
|------|--------|
| `paperboy-app/package.json` | `test` / `test:watch` scripts; `vitest` devDep |
| `paperboy-app/vitest.config.js` | node env, `tests/setup.js`, 120s timeout for OCR |
| `paperboy-app/tests/setup.js` | `localStorage` polyfill for `getAiSettings()` |
| `paperboy-app/tests/import-flow.test.js` | Tests A–F on `convertImportedFile` |
| `paperboy-app/tests/README.md` | Rationale + run instructions + 7.3 deferral |

**Note:** Review specified `happy-dom`; tesseract.js worker paths fail under happy-dom (`http://localhost:3000/...` worker URL). Used **node** + `localStorage` polyfill instead — same goal (no Tauri shell), OCR matches production.

## Validation (exit 0)

```text
cd paperboy && npm install
cd paperboy-app && npm test                    # 6 passed
cd paperboy && npm test --workspaces --if-present   # 52 passed (9+6+19+6+12)
cd paperboy && npm run build --workspaces --if-present
grep -rn convertImportedFile paperboy-app/tests/  # 7 hits
grep -rn "describe\|expect" paperboy-app/tests/   # >5
node --check paperboy-app/vitest.config.js
```

Test F: `describeImageWithAi` mock called with `apiKey: "sk-test"` and `imageMimeType: "image/png"`.

## Definition of done
- [x] `test` script + vitest devDep in `paperboy-app/package.json`
- [x] vitest config, import-flow tests, README exist
- [x] ≥36 workspace tests pass (52 total)
- [x] No edits under `paperboy-app/src/**` or other workspaces
- [x] README documents Tauri E2E deferred to 7.3
