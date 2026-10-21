export type ConvertInputData = string | Uint8Array;

export interface ConvertResult {
  markdown: string;
  title: string;
  warnings: string[];
}

export interface OcrWordPosition {
  text: string;
  confidence: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLine {
  words: OcrWord[];
}

export interface OcrParagraph {
  lines: OcrLine[];
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
  /** Enables line filtering and paragraph reflow. Without it, text is preserved verbatim. */
  paragraphs?: OcrParagraph[];
}

export type OcrFunction = (
  bytes: Uint8Array,
  language: string,
) => Promise<OcrResult>;

export interface ImageConversionOptions {
  /** Include the raw OCR word-position table. Defaults to false. */
  includeLayoutTable?: boolean;
  /** Local directory of gzipped language data. Disables the OCR disk cache. */
  languageDataPath?: string;
  /**
   * Injectable OCR backend. When omitted, the handler lazy-loads tesseract.js
   * and runs OCR locally. Tests and alternate backends pass their own.
   */
  ocr?: OcrFunction;
}

export interface ConvertOptions {
  image?: ImageConversionOptions;
}

export type ConverterHandler = (
  filename: string,
  data: ConvertInputData,
  options?: ConvertOptions,
) => Promise<ConvertResult>;
