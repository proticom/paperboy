import type { ConvertInputData } from "./types.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

export function stripFileExtension(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/");
  const baseName = normalized.slice(normalized.lastIndexOf("/") + 1);
  const extensionIndex = baseName.lastIndexOf(".");
  if (extensionIndex <= 0) {
    return baseName;
  }
  return baseName.slice(0, extensionIndex);
}

export function getExtension(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/");
  const baseName = normalized.slice(normalized.lastIndexOf("/") + 1);
  const extensionIndex = baseName.lastIndexOf(".");
  if (extensionIndex <= 0 || extensionIndex === baseName.length - 1) {
    return "";
  }
  return baseName.slice(extensionIndex + 1).toLowerCase();
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export function toWordCount(markdown: string): number {
  return normalizeLineEndings(markdown).split(/\s+/).filter(Boolean).length;
}

export function toBytes(data: ConvertInputData): Uint8Array {
  if (typeof data === "string") {
    return textEncoder.encode(data);
  }
  return data;
}

export function toText(data: ConvertInputData): string {
  if (typeof data === "string") {
    return data;
  }
  return textDecoder.decode(data);
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (!inQuotes && char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => value.length > 0));
}

export function escapeCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ");
}

export function rowsToMarkdownTable(rows: unknown[][]): string {
  if (rows.length === 0) return "";

  const columnCount = Math.max(...rows.map((cells) => cells.length), 1);
  const headerRow = rows[0];
  const bodyRows = rows.slice(1);
  const header = Array.from({ length: columnCount }, (_, index) =>
    escapeCell(headerRow[index] ?? `Column ${index + 1}`),
  );
  const divider = Array.from({ length: columnCount }, () => "---");
  const body = bodyRows.map((cells) =>
    Array.from({ length: columnCount }, (_, index) =>
      escapeCell(cells[index] ?? ""),
    ),
  );

  return [
    `| ${header.join(" | ")} |`,
    `| ${divider.join(" | ")} |`,
    ...body.map((cells) => `| ${cells.join(" | ")} |`),
  ].join("\n");
}
