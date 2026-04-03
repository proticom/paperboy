import { parseHtml } from "../dom.js";
import { stripFileExtension, toText } from "../helpers.js";
import { createTurndownService } from "../turndown.js";
import type { ConvertInputData, ConvertOptions, ConvertResult } from "../types.js";

export async function convertHtml(
  filename: string,
  data: ConvertInputData,
  _options?: ConvertOptions,
): Promise<ConvertResult> {
  const rawHtml = toText(data);
  const documentNode = parseHtml(rawHtml);
  const source =
    documentNode.body && documentNode.body.innerHTML.trim()
      ? documentNode.body.innerHTML
      : rawHtml;
  const markdown = createTurndownService().turndown(source).trim();

  return {
    markdown,
    title:
      documentNode.querySelector("title")?.textContent?.trim() ||
      stripFileExtension(filename),
    warnings: [],
  };
}
