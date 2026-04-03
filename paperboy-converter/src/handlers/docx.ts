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
  const result = await mammoth.convertToHtml({
    arrayBuffer: toArrayBuffer(bytes),
  });
  return {
    markdown: createTurndownService().turndown(result.value).trim(),
    title: stripFileExtension(filename),
    warnings: result.messages
      .filter((message) => message.type === "warning")
      .map((message) => message.message),
  };
}
