import { parentPort } from "node:worker_threads";
import { convertToMarkdown, type ConvertResult } from "@proticom/paperboy-converter";

export interface ConversionRequest {
  id: number;
  filename: string;
  body: string;
}

export type ConversionResponse =
  | { id: number; result: ConvertResult }
  | { id: number; error: string };

parentPort?.on("message", async ({ id, filename, body }: ConversionRequest) => {
  let response: ConversionResponse;
  try {
    response = { id, result: await convertToMarkdown(filename, body) };
  } catch (error) {
    response = { id, error: error instanceof Error ? error.message : String(error) };
  }
  parentPort?.postMessage(response);
});
