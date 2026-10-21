import { stripFileExtension, toBytes } from "../helpers.js";
import type {
  ConvertInputData,
  ConvertOptions,
  ConvertResult,
  ImageConversionOptions,
  OcrFunction,
  OcrParagraph,
  OcrResult,
  OcrWord,
  OcrWordPosition,
} from "../types.js";

const MAX_POSITION_ROWS = 300;
const MIN_LINE_CONFIDENCE = 60;
const IMAGE_OMITTED = "<!-- image omitted -->";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function collectParagraphsFromTesseractBlocks(blocks: unknown): OcrParagraph[] {
  return objectArray(blocks).flatMap((block) =>
    objectArray(block.paragraphs).map((paragraph) => ({
      lines: objectArray(paragraph.lines).map((line) => ({
        words: objectArray(line.words).map((word): OcrWord => {
          const bbox = isRecord(word.bbox) ? word.bbox : {};
          const x0 = typeof bbox.x0 === "number" ? bbox.x0 : 0;
          const y0 = typeof bbox.y0 === "number" ? bbox.y0 : 0;
          return {
            text: typeof word.text === "string" ? word.text : "",
            confidence: typeof word.confidence === "number" ? word.confidence : 0,
            bbox: {
              x0,
              y0,
              x1: typeof bbox.x1 === "number" ? bbox.x1 : x0,
              y1: typeof bbox.y1 === "number" ? bbox.y1 : y0,
            },
          };
        }),
      })).filter((line) => line.words.length > 0),
    })).filter((paragraph) => paragraph.lines.length > 0),
  );
}

function cleanOcrText(result: OcrResult): { text: string; hasText: boolean } {
  // Legacy backends can supply partial word lists, so text remains authoritative without structure.
  if (!result.paragraphs?.length) {
    const text = result.text.trim();
    return { text, hasText: text.length > 0 };
  }

  const sections: string[] = [];
  let hasText = false;
  for (const paragraph of result.paragraphs) {
    let keptLines: string[] = [];
    let previousBounds: { top: number; bottom: number } | undefined;
    const flush = () => {
      if (keptLines.length) sections.push(keptLines.join(" "));
      keptLines = [];
      previousBounds = undefined;
    };
    for (const line of paragraph.lines) {
      const words = line.words.filter((word) => word.text.trim().length > 0);
      if (!words.length) continue;
      const mean = words.reduce((sum, word) => sum + word.confidence, 0) / words.length;
      const hasReadableWord = words.some((word) =>
        /[\p{L}\p{N}]{2}/u.test(word.text) || /^\p{L}+[.,!?;:]?$/u.test(word.text),
      );
      if (mean < MIN_LINE_CONFIDENCE || !hasReadableWord) {
        flush();
        if (sections.at(-1) !== IMAGE_OMITTED) sections.push(IMAGE_OMITTED);
        continue;
      }

      const bounds = {
        top: Math.min(...words.map((word) => word.bbox.y0)),
        bottom: Math.max(...words.map((word) => word.bbox.y1)),
      };
      // Tesseract can merge widely spaced captions into one paragraph.
      if (
        previousBounds &&
        bounds.top - previousBounds.bottom > Math.max(
          bounds.bottom - bounds.top,
          previousBounds.bottom - previousBounds.top,
        )
      ) flush();

      const tokens = words.map((word) => word.text.trim());
      keptLines.push(tokens.map((token, index) =>
        token === "|" &&
        /\p{L}/u.test(tokens[index - 1] ?? "") &&
        /\p{L}/u.test(tokens[index + 1] ?? "")
          ? "I" : token,
      ).join(" "));
      previousBounds = bounds;
      hasText = true;
    }
    flush();
  }
  return { text: sections.join("\n\n"), hasText };
}

// Lazy import keeps tesseract.js out of the test path when callers inject ocr.
async function defaultOcr(
  bytes: Uint8Array,
  language: string,
  options?: ImageConversionOptions,
): Promise<OcrResult> {
  const { default: Tesseract } = await import("tesseract.js");
  const recognizeArg = bytes as unknown as Parameters<
    typeof Tesseract.recognize
  >[0];
  const worker =
    options?.languageDataPath === undefined
      ? await Tesseract.createWorker(language)
      : await Tesseract.createWorker(language, undefined, {
          langPath: options.languageDataPath,
          gzip: true,
          cacheMethod: "none",
        });
  // Tesseract v6 requires blocks output for line confidence and paragraph structure.
  try {
    const result = await worker.recognize(recognizeArg, {}, { text: true, blocks: true });
    const paragraphs = collectParagraphsFromTesseractBlocks(result.data?.blocks);
    return {
      text: result.data?.text ?? "",
      words: paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)),
      paragraphs,
    };
  } finally {
    await worker.terminate();
  }
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

export async function convertImage(
  filename: string,
  data: ConvertInputData,
  options?: ConvertOptions,
): Promise<ConvertResult> {
  const fileBytes = toBytes(data);
  const warnings = [
    options?.image?.languageDataPath === undefined
      ? "OCR runs locally and may take longer on large images. First run can download language data."
      : "OCR runs locally and may take longer on large images.",
  ];

  const ocr: OcrFunction =
    options?.image?.ocr ??
    ((bytes, language) => defaultOcr(bytes, language, options?.image));
  const ocrResult = await ocr(fileBytes, "eng");
  const { text: ocrText, hasText } = cleanOcrText(ocrResult);
  const words = toOcrWordPositions(ocrResult.words ?? []);
  const includeLayout = options?.image?.includeLayoutTable ?? false;
  const sections: string[] = [];

  if (ocrText.length > 0) sections.push(ocrText);
  if (!hasText) warnings.push("No readable text was detected in this image.");
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
