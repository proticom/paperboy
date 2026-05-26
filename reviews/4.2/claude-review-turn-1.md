# 4.2 - Review Turn 1

## Task Context
- Task id: 4.2
- Task title: Wire desktop AI image description during conversion
- Dashboard implementation status: todo (verified NOT done in the repo)
- Review status: in_review → waiting_for_builder
- Spec section (plan item **4.2**): "Wire the keychain settings in `paperboy-app/src/scripts/settings.js`
  → `paperboy-app/src/scripts/converter.js:52`: pass `ConvertOptions.image.describeImage` to
  `convertToMarkdown` when AI is configured, using the shared package from 4.1. Image and image-only-PDF
  imports now produce a `## Image Description` section."
- Files inspected:
  - `paperboy-app/src/scripts/converter.js` (the `convertToMarkdown(path, input)` call at line 52)
  - `paperboy-app/src/scripts/settings.js` (localStorage `paperboy-app-ai-settings` + keychain via `invoke`)
  - `paperboy-app/src/scripts/bridge.js` (callers of `convertImportedFile`, `invoke` plumbing)
  - `paperboy-app/scripts/build-converter.mjs` (esbuild `platform:"browser"` bundle → `vendor/converter.js`)
  - `paperboy-app/package.json` (deps), `paperboy-ai/src/ai.ts` (the shared `describeImageWithAi` contract)
  - `paperboy-converter/src/types.ts` + `src/handlers/image.ts` (the `ImageDescriptionParams` /
    `## Image Description` contract)
- Commands run:
  - `grep -rn "describeImage|paperboy-ai|describeImageWithAi" paperboy-app/src/scripts` (excl. vendor) → empty
  - `grep -c "describeImageWithAi" paperboy-app/src/scripts/vendor/converter.js` → 0
  - `grep -n "paperboy-ai|paperboy-converter" paperboy-app/package.json`
- Current claim being verified: AI image description is wired into the desktop conversion path.
  Result: it is NOT — `convertToMarkdown` is called with no options, no AI package is imported, and the
  app does not even depend on `@proticom/paperboy-ai`.

## Findings

### Finding 1: describeImage is never passed to the converter (the core of the task)
- Severity: required
- Location: `paperboy-app/src/scripts/converter.js:52` — `return convertToMarkdown(path, input);`
  (no second `options` argument).
- Problem: the converter only emits a `## Image Description` section when
  `options.image.describeImage` is supplied and returns a non-null string
  (`paperboy-converter/src/handlers/image.ts:156-171`). The app passes no options, so AI description
  never runs for image / image-only-PDF imports.
- Required fix: build a `ConvertOptions.image.describeImage` callback (when AI is configured) and pass it
  as the 2nd arg to `convertToMarkdown`. See Builder Prompt for the exact wiring.
- Validation:
```
grep -n  "describeImage" paperboy-app/src/scripts/converter.js               # MUST show the wiring
grep -c  "describeImageWithAi" paperboy-app/src/scripts/vendor/converter.js  # MUST be > 0 (AI bundled in)
grep -rn "imageBytes: Buffer\|\.toString(\"base64\")" paperboy-ai/src        # MUST be empty (Buffer removed)
npm run build     --workspaces --if-present
npm run typecheck --workspaces --if-present
npm test          --workspaces --if-present
npm run build:converter -w paperboy-app
```

### Finding 2: the app does not depend on @proticom/paperboy-ai (from 4.1)
- Severity: required
- Location: `paperboy-app/package.json` dependencies — only `@proticom/paperboy-converter` is listed.
- Problem: 4.1 extracted `describeImageWithAi` into `@proticom/paperboy-ai`, but the app can't import it
  until it's a dependency. The converter is esbuild-bundled into `src/scripts/vendor/converter.js` from
  the bare specifier `@proticom/paperboy-converter`; an AI import must be bundled the same way.
- Required fix: add `"@proticom/paperboy-ai": "*"` to `paperboy-app/package.json` dependencies, run
  `npm install`, and rebuild the vendor bundle (`npm run build:converter -w paperboy-app`, or
  `sync:vendor`) so the AI code is included.

### Finding 3 (ARCHITECTURAL — must resolve): Buffer vs Uint8Array across the browser boundary
- Severity: required (this is the gotcha that will break at build or runtime if ignored)
- Location: `paperboy-ai/src/ai.ts` — `DescribeImageParams.imageBytes: Buffer` and
  `imageBytes.toString("base64")` (lines 37, 144, 263); vs the converter callback which hands the app
  `ImageDescriptionParams.fileBytes: Uint8Array` (`paperboy-converter/src/types.ts:34-40`,
  `handlers/image.ts:158-164`).
- Problem: the desktop app runs in a Tauri **WebView (browser)** and bundles with esbuild
  `platform:"browser"` (`scripts/build-converter.mjs`). Node's `Buffer` global does NOT exist there and
  esbuild does not auto-polyfill it, so `imageBytes.toString("base64")` will throw
  (`Buffer is not defined`) — or you'd have to add a Buffer polyfill to the app bundle just to satisfy
  one call. `Buffer` is a subclass of `Uint8Array`, so passing the raw `Uint8Array` would typecheck-fail
  against `imageBytes: Buffer` AND `.toString("base64")` would not produce base64.
- Required fix (preferred — make the shared package environment-agnostic; this also keeps it browser-safe
  per the Phase-4 separation): change `DescribeImageParams.imageBytes` from `Buffer` to `Uint8Array`, and
  replace the two `imageBytes.toString("base64")` calls with an isomorphic base64 encoder. Then the CLI
  caller (which currently passes `params.fileBytes` — a `Buffer`, which IS a `Uint8Array`) keeps working,
  and the app can pass `fileBytes` directly. Re-run the paperboy-ai + cli builds/tests after this change.
  - Isomorphic base64 helper (no Buffer dependency):
    ```ts
    function bytesToBase64(bytes: Uint8Array): string {
      if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary); // available in browsers and Node >=16
    }
    ```
  - Acceptable alternative ONLY if you keep `imageBytes: Buffer`: the app must construct a Buffer
    (`Buffer.from(fileBytes)`) AND the app bundle must ship a Buffer polyfill. This is heavier and
    contradicts "AI package browser-safe"; the preferred Uint8Array fix is strongly recommended.

### Finding 4: settings.js exposes no getter for the current AI config, and apiKey must be resolved via the keychain
- Severity: required
- Location: `paperboy-app/src/scripts/settings.js` — `loadSettings()`, `PROVIDERS`, and the keychain read
  (`invoke("get_api_key", { provider })`) are all module-private; `initSettings()` returns only `{ open }`.
- Problem: `converter.js` has no way to read the saved `{ provider, baseUrl, model }` or to resolve the
  API key from the OS keychain. The describeImage callback needs both.
- Required fix: export a small reader from `settings.js`, e.g.
  `export function getAiSettings()` returning `{ provider, baseUrl, model }` from `loadSettings()`, and
  `export async function resolveApiKey(invoke, provider)` returning
  `provider needsKey ? await invoke("get_api_key", { provider }) : null`. (Provider metadata —
  `needsKey`, defaults — already lives in `settings.js`'s `PROVIDERS`; reuse it so the app does not
  duplicate the catalog. You MAY instead import `PROVIDERS`/`getProvider` from `@proticom/paperboy-ai`
  to keep one source of truth, but do not duplicate provider data inline.)

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: when AI is configured in the desktop app's Settings, image and image-only-PDF imports must run
the shared `describeImageWithAi` and produce a `## Image Description` section. Wire
`ConvertOptions.image.describeImage` into the `convertToMarkdown` call at `converter.js:52`, sourcing the
provider/model/baseUrl from `settings.js` and the API key from the OS keychain.

Files to edit:
- `paperboy-ai/src/ai.ts`: change `DescribeImageParams.imageBytes` from `Buffer` → `Uint8Array`; replace
  both `imageBytes.toString("base64")` (and `params.imageBytes.toString("base64")`) with an isomorphic
  `bytesToBase64(...)` helper (see Finding 3). Do NOT change the public function names/shape otherwise.
- `paperboy-cli/src/cli.ts`: it already passes `imageBytes: params.fileBytes` (a Buffer, which is a
  Uint8Array) — no change needed, but re-run CLI tests to confirm.
- `paperboy-app/package.json`: add `"@proticom/paperboy-ai": "*"` to `dependencies`.
- `paperboy-app/src/scripts/settings.js`: export `getAiSettings()` → `{ provider, baseUrl, model }` and
  `resolveApiKey(invoke, provider)` → keychain key (or null when the provider needs no key / is disabled).
- `paperboy-app/src/scripts/converter.js`: import `describeImageWithAi` from `@proticom/paperboy-ai` and
  `getAiSettings`/`resolveApiKey` from `./settings.js`; build `convertOptions.image.describeImage` only
  when `provider !== "disabled"`; pass it into `convertToMarkdown(path, input, convertOptions)`.
  `convertImportedFile` must accept `invoke` (or import the bound `invoke`) so it can resolve the key.
- `paperboy-app/src/scripts/bridge.js`: pass `invoke` through both `convertImportedFile(...)` call sites
  (lines ~358 and ~365), since the key resolution needs the keychain bridge.
- Rebuild the vendor bundle so the AI code is bundled into the WebView:
  `npm run build:converter -w paperboy-app` (esbuild `platform:"browser"` — that is exactly why Buffer
  must be removed from paperboy-ai).

Wiring shape (converter.js):
```js
import { convertToMarkdown, shouldReadInputAsText, SUPPORTED_EXTENSIONS } from "@proticom/paperboy-converter";
import { describeImageWithAi } from "@proticom/paperboy-ai";
import { getAiSettings, resolveApiKey } from "./settings.js";

export async function convertImportedFile({ path, text, base64, invoke }) {
  // ...existing extension/text/bytes handling...
  const convertOptions = {};
  const ai = getAiSettings();                 // { provider, baseUrl, model }
  if (ai.provider && ai.provider !== "disabled") {
    const apiKey = (await resolveApiKey(invoke, ai.provider)) ?? "";
    convertOptions.image = {
      describeImage: (params) =>
        describeImageWithAi({
          aiConfig: { mode: ai.provider, baseUrl: ai.baseUrl, model: ai.model },
          apiKey,
          imageBytes: params.fileBytes,        // Uint8Array, after Finding 3
          imageMimeType: params.imageMimeType,
          ocrText: params.ocrText,
          words: params.words,
        }),
    };
  }
  return convertToMarkdown(path, input, convertOptions);
}
```
settings.js getters:
```js
export function getAiSettings() {
  const s = loadSettings();
  return { provider: s.provider || "disabled", baseUrl: s.baseUrl || "", model: s.model || "" };
}
export async function resolveApiKey(invoke, provider) {
  const info = PROVIDERS[provider];
  if (!info?.needsKey || !invoke) return null;
  try { return (await invoke("get_api_key", { provider })) || null; } catch { return null; }
}
```

Files not to edit:
- `paperboy-converter/src` (its `describeImage`/`ImageDescriptionParams` contract is already correct;
  only consume it).

Tests to add or update:
- paperboy-ai: keep `tests/ai.test.ts` green after the Buffer→Uint8Array change; the openrouter dispatch
  test already passes `Buffer.from(...)` which is still a `Uint8Array`, so update the type expectation if
  needed and assert the base64 helper works in a non-Buffer path (you may `vi.stubGlobal` away Buffer in
  one case to exercise the `btoa` branch).
- paperboy-app: if the app has a unit test harness for `converter.js`, add a test that mocks `invoke`
  (`get_api_key`) and a stubbed `describeImage` to assert `convertOptions.image.describeImage` is built
  only when provider !== "disabled". If there is no JS test harness in paperboy-app, state that explicitly
  in the reply and rely on the build + a manual smoke note instead (4.13 covers the Playwright smoke test).

Commands to run (capture exit codes):
```
npm install
npm run build     --workspaces --if-present
npm run typecheck --workspaces --if-present
npm test          --workspaces --if-present
npm run build:converter -w paperboy-app
grep -c "describeImageWithAi" paperboy-app/src/scripts/vendor/converter.js   # MUST be > 0 (AI bundled in)
grep -n  "describeImage" paperboy-app/src/scripts/converter.js               # MUST show the wiring
grep -rn "imageBytes: Buffer\|\.toString(\"base64\")" paperboy-ai/src        # MUST be empty (Buffer removed)
```

Definition of done:
- `convertImportedFile` passes a `describeImage` callback to `convertToMarkdown` whenever a non-disabled
  provider is configured; AI description never fires when provider is "disabled".
- `@proticom/paperboy-ai` no longer references `Buffer`; it builds and bundles cleanly under esbuild
  `platform:"browser"` and is present in `paperboy-app`'s vendor converter bundle.
- The app reads provider/baseUrl/model from `settings.js` and the API key from the OS keychain via
  `invoke`; no provider catalog is duplicated inline.
- build / typecheck / test green across all workspaces; CLI still passes (its `fileBytes` Buffer is a
  valid Uint8Array).

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Base64 approach: I recommend making paperboy-ai's `imageBytes` a `Uint8Array` with an isomorphic
  base64 helper (Finding 3, preferred). If you have a strong reason to keep `Buffer` in paperboy-ai,
  reply with that rationale and your plan to polyfill Buffer in the app's browser bundle instead — but
  the Uint8Array path is cleaner and preserves the "AI package is browser-safe" property.

## Decision
send_to_builder
