import { normalizeLineEndings, stripFileExtension, toText } from "../helpers.js";
import type { ConvertOptions, ConvertResult, ConvertInputData } from "../types.js";

export async function convertText(
  filename: string,
  data: ConvertInputData,
  _options?: ConvertOptions,
): Promise<ConvertResult> {
  const markdown = normalizeLineEndings(toText(data));
  return {
    markdown,
    title: stripFileExtension(filename),
    warnings: [],
  };
}
