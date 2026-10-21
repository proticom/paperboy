import { cleanOcrText, collectParagraphsFromTesseractBlocks } from "../ocr-text.js";
import { stripFileExtension, toBytes } from "../helpers.js";
import type {
  ConvertInputData,
  ConvertOptions,
  ConvertResult,
  ImageConversionOptions,
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
