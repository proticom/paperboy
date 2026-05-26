# 4.2 - Builder Reply Turn 1

## Task Context
- Task id: 4.2
- Review artifact: `reviews/4.2/claude-review-turn-1.md`
- Builder: cursor

## Changes Made

### Finding 3 — Uint8Array + isomorphic base64
- `paperboy-ai/src/ai.ts`: `imageBytes: Uint8Array`; added `bytesToBase64()` (Buffer path in Node, `btoa` in browser)
- Added test exercising the non-Buffer base64 path

### Finding 2 — app dependency + vendor bundle
- `paperboy-app/package.json`: `"@proticom/paperboy-ai": "*"`
- Rebuilt `src/scripts/vendor/converter.js` via `npm run build:converter`

### Finding 4 — settings getters
- `settings.js`: exported `getAiSettings()` and `resolveApiKey(invoke, provider)`

### Finding 1 — converter wiring
- `converter.js`: passes `convertOptions.image.describeImage` when provider !== `disabled`; reads settings + keychain key; calls `convertToMarkdown(path, input, convertOptions)`
- `bridge.js`: passes `invoke` into both `convertImportedFile` call sites

No paperboy-app JS unit test harness exists; verified via build + bundle grep.

## Validation

```
npm run build / typecheck / test --workspaces --if-present   # all green (ai 6 tests, cli 19)
npm run build:converter -w paperboy-editor                   # pass
grep -c describeImageWithAi vendor/converter.js              # 2
grep describeImage converter.js                              # wiring present
grep imageBytes: Buffer paperboy-ai/src                      # empty
```

## Builder Response
All four required findings addressed. Used Uint8Array path (preferred). paperboy-app has no converter unit tests — manual smoke deferred to task 4.13.
