import Tesseract from "tesseract.js";

import { getExtension, stripFileExtension, toBytes } from "../helpers.js";
import type {
  ConvertInputData,
  ConvertOptions,
  ConvertResult,
  OcrWordPosition,
} from "../types.js";

const MAX_POSITION_ROWS = 300;

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r\n/g, " ").replace(/\n/g, " ");
}

function toOcrWords(rawWords: unknown[]): OcrWordPosition[] {
  return rawWords
    .map((rawWord) => {
      if (!rawWord || typeof rawWord !== "object") return null;
      const word = rawWord as {
        text?: string;
        confidence?: number;
        bbox?: { x0?: number; y0?: number; x1?: number; y1?: number };
      };
      const text = (word.text ?? "").trim();
      if (!text) return null;
      const x0 = word.bbox?.x0 ?? 0;
      const y0 = word.bbox?.y0 ?? 0;
      const x1 = word.bbox?.x1 ?? x0;
      const y1 = word.bbox?.y1 ?? y0;
      return {
        text,
        confidence: Number(word.confidence ?? 0),
        left: Math.round(x0),
        top: Math.round(y0),
        width: Math.max(0, Math.round(x1 - x0)),
        height: Math.max(0, Math.round(y1 - y0)),
      };
    })
    .filter((word): word is OcrWordPosition => Boolean(word));
}

function collectWordsFromBlocks(rawBlocks: unknown): unknown[] {
  if (!Array.isArray(rawBlocks)) return [];
  const words: unknown[] = [];

  for (const rawBlock of rawBlocks) {
    if (!rawBlock || typeof rawBlock !== "object") continue;
    const paragraphs = (rawBlock as { paragraphs?: unknown[] }).paragraphs;
    if (!Array.isArray(paragraphs)) continue;

    for (const rawParagraph of paragraphs) {
      if (!rawParagraph || typeof rawParagraph !== "object") continue;
      const lines = (rawParagraph as { lines?: unknown[] }).lines;
      if (!Array.isArray(lines)) continue;

      for (const rawLine of lines) {
        if (!rawLine || typeof rawLine !== "object") continue;
        const lineWords = (rawLine as { words?: unknown[] }).words;
        if (Array.isArray(lineWords)) words.push(...lineWords);
      }
    }
  }

  return words;
}

function buildLayoutTable(words: OcrWordPosition[]): string {
  const rows = words.slice(0, MAX_POSITION_ROWS);
  const header = "| Text | Confidence | Left | Top | Width | Height |";
  const divider = "| --- | ---: | ---: | ---: | ---: | ---: |";
  const body = rows.map(
    (word) =>
      `| ${escapeMarkdownCell(word.text)} | ${word.confidence.toFixed(1)} | ${word.left} | ${word.top} | ${word.width} | ${word.height} |`,
  );
  return [header, divider, ...body].join("\n");
}

function getImageMimeType(filename: string): string {
  const extension = getExtension(filename);
  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "webp":
      return "image/webp";
    case "tif":
    case "tiff":
      return "image/tiff";
    default:
      return "application/octet-stream";
  }
}

export async function convertImage(
  filename: string,
  data: ConvertInputData,
  options?: ConvertOptions,
): Promise<ConvertResult> {
  const fileBytes = toBytes(data);
  const imageMimeType = getImageMimeType(filename);
  const warnings = [
    "OCR runs locally and may take longer on large images. First run can download language data.",
  ];
  const imageSource = fileBytes as unknown as Parameters<
    typeof Tesseract.recognize
  >[0];
  const ocrResult = await Tesseract.recognize(imageSource, "eng");
  const ocrText = (ocrResult.data?.text ?? "").trim();
  const words = toOcrWords(collectWordsFromBlocks(ocrResult.data?.blocks));
  const includeLayout = options?.image?.includeLayoutTable ?? true;
  const sections: string[] = [];

  let description: string | null = null;
  if (options?.image?.describeImage) {
    try {
      description = await options.image.describeImage({
        filename,
        fileBytes,
        imageMimeType,
        ocrText,
        words,
      });
    } catch {
      warnings.push("AI image description failed, so only OCR output was included.");
    }
  }

  if (description && description.trim().length > 0) {
    sections.push(`## Image Description\n\n${description.trim()}`);
  }
  if (ocrText.length > 0) {
    sections.push(`## OCR Text\n\n${ocrText}`);
  } else {
    warnings.push("No readable text was detected in this image.");
  }
  if (includeLayout && words.length > 0) {
    if (words.length > MAX_POSITION_ROWS) {
      warnings.push(
        `Text positioning table was truncated to ${MAX_POSITION_ROWS} rows.`,
      );
    }
    sections.push(`## Text Positioning\n\n${buildLayoutTable(words)}`);
  }

  return {
    markdown: sections.join("\n\n").trim(),
    title: stripFileExtension(filename),
    warnings,
  };
}
