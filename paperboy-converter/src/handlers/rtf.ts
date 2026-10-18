import {
  normalizeLineEndings,
  stripFileExtension,
  toText,
} from "../helpers.js";
import type { ConvertInputData, ConvertOptions, ConvertResult } from "../types.js";

function decodeRtfToText(input: string): string {
  if (!input) return "";

  return normalizeLineEndings(input)
    // Hold escaped backslashes so a later strip cannot read \\temp as \temp.
    .replace(/\\\\/g, "\u0000")
    // A backslash before a raw newline is RTF's paragraph-break control
    // symbol (TextEdit writes one per line). Escaped pairs are already held.
    .replace(/\\\n/g, "\\par ")
    // A newline ends a control word, so turn it into the space delimiter.
    .replace(/(\\[a-zA-Z]+-?\d*)\n/g, "$1 ")
    // Raw newlines in RTF source are not text.
    .replace(/\n/g, "")
    // Match whole control words only, so \pardirnatural or \partightenfactor0
    // are not read as \par, and consume the optional delimiter space so
    // the next paragraph does not start with a space.
    .replace(/\\pard(?![a-zA-Z])-?\d* ?/g, "")
    .replace(/\\par(?![a-zA-Z])-?\d* ?/g, "\n\n")
    .replace(/\\line(?![a-zA-Z])-?\d* ?/g, "\n")
    .replace(/\\tab(?![a-zA-Z])-?\d* ?/g, "\t")
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\u(-?\d+)\??/g, (_, code: string) => {
      const value = Number(code);
      if (!Number.isFinite(value)) return "";
      const normalized = value < 0 ? 65536 + value : value;
      return String.fromCharCode(normalized);
    })
    .replace(/\\([{}])/g, "$1")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\u0000/g, "\\")
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
