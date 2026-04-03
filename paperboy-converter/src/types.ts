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

export interface ImageDescriptionParams {
  filename: string;
  fileBytes: Uint8Array;
  imageMimeType: string;
  ocrText: string;
  words: OcrWordPosition[];
}

export interface ImageConversionOptions {
  includeLayoutTable?: boolean;
  describeImage?: (params: ImageDescriptionParams) => Promise<string | null>;
}

export interface ConvertOptions {
  image?: ImageConversionOptions;
}

export type ConverterHandler = (
  filename: string,
  data: ConvertInputData,
  options?: ConvertOptions,
) => Promise<ConvertResult>;
