import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  convertToMarkdown,
  shouldReadInputAsText,
  SUPPORTED_EXTENSIONS,
  type ConvertOptions as SharedConvertOptions,
  type ConvertResult,
  type OcrFunction,
  type OcrWordPosition,
} from "@proticom/paperboy-converter";

export type { ConvertResult, OcrFunction, OcrWordPosition };
export { SUPPORTED_EXTENSIONS };

export type ConvertOptions = SharedConvertOptions;

export async function convertFileToMarkdown(
  filePath: string,
  options?: ConvertOptions,
): Promise<ConvertResult> {
  const input = shouldReadInputAsText(filePath)
    ? await fs.readFile(filePath, "utf8")
    : await fs.readFile(filePath);

  return convertToMarkdown(filePath, input, {
    ...options,
    image: {
      ...options?.image,
      languageDataPath: fileURLToPath(new URL("./lang/", import.meta.url)),
    },
  });
}
