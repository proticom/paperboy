import * as XLSX from "xlsx";
import * as cpexcel from "xlsx/dist/cpexcel.full.mjs";

import { rowsToMarkdownTable, stripFileExtension, toArrayBuffer, toBytes } from "../helpers.js";
import type { ConvertInputData, ConvertOptions, ConvertResult } from "../types.js";

// The ESM build ships without codepage tables, and legacy BIFF text decodes wrongly without them.
XLSX.set_cptable(cpexcel);

export async function convertXlsx(
  filename: string,
  data: ConvertInputData,
  _options?: ConvertOptions,
): Promise<ConvertResult> {
  const workbook = XLSX.read(toArrayBuffer(toBytes(data)), { type: "array" });
  const warnings: string[] = [];
  const sections: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    const nonEmptyRows = rows.filter((row) =>
      row.some((cell) => String(cell ?? "").trim().length > 0),
    );

    if (nonEmptyRows.length === 0) {
      warnings.push(`Sheet "${sheetName}" is empty and was skipped.`);
      continue;
    }

    sections.push(`## ${sheetName}\n\n${rowsToMarkdownTable(nonEmptyRows)}`);
  }

  if (sections.length === 0) {
    warnings.push("No readable sheet data was found in this workbook.");
  }

  return {
    markdown: sections.join("\n\n"),
    title: stripFileExtension(filename),
    warnings,
  };
}
