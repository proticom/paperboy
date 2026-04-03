import {
  normalizeLineEndings,
  parseCsvRows,
  rowsToMarkdownTable,
  stripFileExtension,
  toText,
} from "../helpers.js";
import type { ConvertInputData, ConvertOptions, ConvertResult } from "../types.js";

export async function convertCsv(
  filename: string,
  data: ConvertInputData,
  _options?: ConvertOptions,
): Promise<ConvertResult> {
  const text = normalizeLineEndings(toText(data));
  const rows = parseCsvRows(text);
  const warnings: string[] = [];

  if (rows.length === 0) {
    warnings.push("The CSV appears to be empty.");
  } else if (rows.length === 1) {
    warnings.push("Only one row was found; created a single-row markdown table.");
  }

  return {
    markdown: rowsToMarkdownTable(rows),
    title: stripFileExtension(filename),
    warnings,
  };
}
