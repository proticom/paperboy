import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";

vi.mock("@proticom/paperboy-converter", () => ({
  convertToMarkdown: vi.fn(async () => ({ markdown: "OCR text", title: "scan", warnings: [] })),
  shouldReadInputAsText: () => false,
  SUPPORTED_EXTENSIONS: ["png"],
}));

import { convertToMarkdown } from "@proticom/paperboy-converter";
import { convertFileToMarkdown } from "../dist/converter.js";

it.each([undefined, { image: { includeLayoutTable: false } }])(
  "passes built module-relative local language data to the converter with options %j",
  async (options) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperboy-ocr-options-"));
    try {
      const image = path.join(tempDir, "scan.png");
      await fs.writeFile(image, Buffer.from([137, 80, 78, 71]));
      const result = await convertFileToMarkdown(image, options);
      expect(result.markdown).toBe("OCR text");
      const expectedPath = fileURLToPath(new URL("../dist/lang/", import.meta.url));
      expect(path.isAbsolute(expectedPath)).toBe(true);
      expect(expectedPath).not.toMatch(/^https?:/i);
      expect(convertToMarkdown).toHaveBeenLastCalledWith(image, Buffer.from([137, 80, 78, 71]), {
        image: {
          includeLayoutTable: options?.image.includeLayoutTable,
          languageDataPath: expectedPath,
        },
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  },
);
