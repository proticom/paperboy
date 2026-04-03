import { convertCsv } from "./handlers/csv.js";
import { convertDocx } from "./handlers/docx.js";
import { convertEpub } from "./handlers/epub.js";
import { convertHtml } from "./handlers/html.js";
import { convertImage } from "./handlers/image.js";
import { convertPdf } from "./handlers/pdf.js";
import { convertRtf } from "./handlers/rtf.js";
import { convertText } from "./handlers/text.js";
import { convertXlsx } from "./handlers/xlsx.js";
import { getExtension, stripFileExtension } from "./helpers.js";
import type {
  ConvertInputData,
  ConvertOptions,
  ConvertResult,
  ConverterHandler,
  ImageDescriptionParams,
  OcrWordPosition,
} from "./types.js";

const handlers: Record<string, ConverterHandler> = {
  md: convertText,
  markdown: convertText,
  mdx: convertText,
  txt: convertText,
  html: convertHtml,
  htm: convertHtml,
  rtf: convertRtf,
  docx: convertDocx,
  pdf: convertPdf,
  csv: convertCsv,
  xlsx: convertXlsx,
  epub: convertEpub,
  png: convertImage,
  jpg: convertImage,
  jpeg: convertImage,
  gif: convertImage,
  bmp: convertImage,
  webp: convertImage,
  tif: convertImage,
  tiff: convertImage,
};

const textInputExtensions = new Set([
  "md",
  "markdown",
  "mdx",
  "txt",
  "html",
  "htm",
  "rtf",
  "csv",
]);

export const SUPPORTED_EXTENSIONS = Object.keys(handlers);
export const FILE_INPUT_ACCEPT = [
  ...SUPPORTED_EXTENSIONS.map((extension) => `.${extension}`),
  "image/*",
].join(",");

export function shouldReadInputAsText(filename: string): boolean {
  return textInputExtensions.has(getExtension(filename));
}

export async function convertToMarkdown(
  filename: string,
  data: ConvertInputData,
  options?: ConvertOptions,
): Promise<ConvertResult> {
  const extension = getExtension(filename);
  const handler = handlers[extension];

  if (!handler) {
    return {
      markdown: "",
      title: stripFileExtension(filename),
      warnings: [`Unsupported file format: .${extension || "unknown"}`],
    };
  }

  return handler(filename, data, options);
}

export type {
  ConvertInputData,
  ConvertOptions,
  ConvertResult,
  ImageDescriptionParams,
  OcrWordPosition,
};

export { createTurndownService } from "./turndown.js";
export { normalizeLineEndings, stripFileExtension, toWordCount } from "./helpers.js";
