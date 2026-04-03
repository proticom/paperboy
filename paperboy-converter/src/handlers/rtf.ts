import {
  normalizeLineEndings,
  stripFileExtension,
  toText,
} from "../helpers.js";
import type { ConvertInputData, ConvertOptions, ConvertResult } from "../types.js";

function decodeRtfToText(input: string): string {
  if (!input) return "";

  return normalizeLineEndings(input)
    .replace(/\\par[d]?/g, "\n\n")
    .replace(/\\line/g, "\n")
    .replace(/\\tab/g, "\t")
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\u(-?\d+)\??/g, (_, code: string) => {
      const value = Number(code);
      if (!Number.isFinite(value)) return "";
      const normalized = value < 0 ? 65536 + value : value;
      return String.fromCharCode(normalized);
    })
    .replace(/\\([{}\\])/g, "$1")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function convertRtf(
  filename: string,
  data: ConvertInputData,
  _options?: ConvertOptions,
): Promise<ConvertResult> {
  const markdown = decodeRtfToText(toText(data));
  const warnings: string[] = [];
  if (!markdown) {
    warnings.push("No readable text was extracted from this RTF file.");
  }

  return {
    markdown,
    title: stripFileExtension(filename),
    warnings,
  };
}
