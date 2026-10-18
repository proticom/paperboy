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
  // browser builds (esbuild platform=browser). JSZip accepts
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
