import { extractText } from "unpdf";

import { stripFileExtension, toBytes } from "../helpers.js";
import type { ConvertInputData, ConvertOptions, ConvertResult } from "../types.js";

function normalizePdfText(pageText: string): string {
  return pageText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function convertPdf(
  filename: string,
  data: ConvertInputData,
  _options?: ConvertOptions,
): Promise<ConvertResult> {
  const { totalPages, text } = await extractText(toBytes(data), {
    mergePages: false,
  });
  const pages = text.map(normalizePdfText);
  const nonEmptyPages = pages.filter((page) => page.length > 0);
  const markdown = pages
    .map((page, index) => {
      if (!page) return "";
      if (totalPages <= 1) return page;
      return `## Page ${index + 1}\n\n${page}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const warnings: string[] = [];
  if (nonEmptyPages.length === 0) {
    warnings.push("No selectable text was found. This PDF may be image-based.");
  } else if (nonEmptyPages.length < totalPages) {
    warnings.push("Some pages had little or no extractable text.");
  }

  return {
    markdown,
    title: stripFileExtension(filename),
    warnings,
  };
}
