import { getExtension, stripFileExtension, toBytes } from "../helpers.js";
import type {
  ConvertInputData,
  ConvertOptions,
  ConvertResult,
  OcrFunction,
  OcrResult,
  OcrWord,
  OcrWordPosition,
} from "../types.js";

const MAX_POSITION_ROWS = 300;

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r\n/g, " ").replace(/\n/g, " ");
}

function toOcrWordPositions(words: OcrWord[]): OcrWordPosition[] {
  return words
    .map((word) => {
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

function collectWordsFromTesseractBlocks(rawBlocks: unknown): OcrWord[] {
  if (!Array.isArray(rawBlocks)) return [];
  const words: OcrWord[] = [];

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
        if (!Array.isArray(lineWords)) continue;

        for (const rawWord of lineWords) {
          if (!rawWord || typeof rawWord !== "object") continue;
          const word = rawWord as Partial<OcrWord> & {
            bbox?: { x0?: number; y0?: number; x1?: number; y1?: number };
          };
          const bbox: {
            x0?: number;
            y0?: number;
            x1?: number;
            y1?: number;
          } = word.bbox ?? {};
          words.push({
            text: typeof word.text === "string" ? word.text : "",
            confidence:
              typeof word.confidence === "number" ? word.confidence : 0,
            bbox: {
              x0: bbox.x0 ?? 0,
              y0: bbox.y0 ?? 0,
              x1: bbox.x1 ?? bbox.x0 ?? 0,
              y1: bbox.y1 ?? bbox.y0 ?? 0,
            },
          });
        }
      }
    }
  }

  return words;
}

// Lazy import keeps tesseract.js out of the test path when callers inject ocr.
async function defaultOcr(
  bytes: Uint8Array,
  language: string,
): Promise<OcrResult> {
  const { default: Tesseract } = await import("tesseract.js");
  const recognizeArg = bytes as unknown as Parameters<
    typeof Tesseract.recognize
  >[0];
  const result = await Tesseract.recognize(recognizeArg, language);
  return {
    text: result.data?.text ?? "",
    words: collectWordsFromTesseractBlocks(result.data?.blocks),
  };
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

  const ocr: OcrFunction = options?.image?.ocr ?? defaultOcr;
  const ocrResult = await ocr(fileBytes, "eng");
  const ocrText = (ocrResult.text ?? "").trim();
  const words = toOcrWordPositions(ocrResult.words ?? []);
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
