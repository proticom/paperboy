import {
  normalizeLineEndings,
  stripFileExtension,
  toText,
} from "../helpers.js";
import type { ConvertInputData, ConvertOptions, ConvertResult } from "../types.js";

const SKIPPED_RTF_DESTINATIONS = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
]);

function isEscaped(input: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && input[i] === "\\"; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function endOfRtfGroup(input: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < input.length; i += 1) {
    if (input[i] === "\\") {
      i += 1;
      continue;
    }
    if (input[i] === "{") depth += 1;
    else if (input[i] === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return input.length;
}

function isSkippableRtfGroup(input: string, openIndex: number): boolean {
  let i = openIndex + 1;
  while (i < input.length && (input[i] === " " || input[i] === "\n" || input[i] === "\r" || input[i] === "\t")) {
    i += 1;
  }
  if (input[i] !== "\\") return false;
  i += 1;
  // {\*\destination ...} groups are optional destinations (generator, etc.).
  if (input[i] === "*") return true;
  let word = "";
  while (i < input.length && /[a-zA-Z]/.test(input[i])) {
    word += input[i];
    i += 1;
  }
  return SKIPPED_RTF_DESTINATIONS.has(word);
}

/** Drop header destinations whose literal text would otherwise leak into the body. */
function stripRtfHeaderGroups(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === "{" && !isEscaped(input, i) && isSkippableRtfGroup(input, i)) {
      // `{` ended the previous control word. Keep a delimiter so `\ansi{...}Hello`
      // does not become the single control word `\ansiHello`.
      if (out.length > 0 && /[a-zA-Z0-9]/.test(out[out.length - 1]!)) out += " ";
      i = endOfRtfGroup(input, i) - 1;
      continue;
    }
    out += input[i];
  }
  return out;
}

function decodeRtfToText(input: string): string {
  if (!input) return "";

  return normalizeLineEndings(stripRtfHeaderGroups(input))
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
