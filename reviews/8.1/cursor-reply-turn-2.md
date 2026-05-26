# 8.1 — Builder Reply (Turn 2)

## Summary
Replaced `node:buffer` / `Buffer.from` with dual `arrayBuffer` + `buffer` keys so mammoth works in Node (`paperboy-cli`, vitest) and browser (`paperboy-app` esbuild bundle).

## Final `docx.ts` (29 lines)

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
    buffer: bytes as unknown as Buffer,
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

(`bytes as unknown as Buffer` satisfies mammoth's Node-only TS types without importing `node:buffer`.)

## Validation

```text
cd paperboy-converter && npm test
→ 13 passed (2 files)

npm run typecheck → clean

cd paperboy-app && node scripts/build-converter.mjs
→ Bundled converter -> src/scripts/vendor/converter.js (exit 0)

grep convertDocx in vendor/converter.js
→ arrayBuffer: toArrayBuffer(bytes), buffer: bytes

grep node:buffer|Buffer.from in paperboy-converter/src/
→ only comment text mentioning Buffer.from (no imports, no runtime Buffer.from)
```

Fixtures and tests unchanged from turn 1.
