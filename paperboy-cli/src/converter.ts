import fs from "node:fs/promises";
import {
  convertToMarkdown,
  shouldReadInputAsText,
  SUPPORTED_EXTENSIONS,
  type ConvertOptions as SharedConvertOptions,
  type ConvertResult,
  type ImageDescriptionParams as SharedImageDescriptionParams,
  type OcrWordPosition,
} from "@proticom/paperboy-converter";

export type { ConvertResult, OcrWordPosition };
export { SUPPORTED_EXTENSIONS };

export interface ImageDescriptionParams {
  filePath: string;
  fileBytes: Buffer;
  imageMimeType: string;
  ocrText: string;
  words: OcrWordPosition[];
}

export interface ConvertOptions {
  image?: {
    includeLayoutTable?: boolean;
    describeImage?: (params: ImageDescriptionParams) => Promise<string | null>;
  };
}

function toSharedOptions(
  filePath: string,
  options?: ConvertOptions,
): SharedConvertOptions | undefined {
  if (!options?.image) {
    return undefined;
  }

  const sharedImageOptions: SharedConvertOptions["image"] = {
    includeLayoutTable: options.image.includeLayoutTable,
  };

  if (options.image.describeImage) {
    sharedImageOptions.describeImage = async (
      params: SharedImageDescriptionParams,
    ) =>
      options.image?.describeImage?.({
        filePath,
        fileBytes: Buffer.from(params.fileBytes),
        imageMimeType: params.imageMimeType,
        ocrText: params.ocrText,
        words: params.words,
      }) ?? null;
  }

  return { image: sharedImageOptions };
}

export async function convertFileToMarkdown(
  filePath: string,
  options?: ConvertOptions,
): Promise<ConvertResult> {
  const input = shouldReadInputAsText(filePath)
    ? await fs.readFile(filePath, "utf8")
    : await fs.readFile(filePath);

  return convertToMarkdown(filePath, input, toSharedOptions(filePath, options));
}
