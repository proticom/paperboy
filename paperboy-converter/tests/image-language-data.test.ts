import { describe, expect, it, vi } from "vitest";

vi.mock("tesseract.js", () => ({
  default: {
    recognize: vi.fn(async () => ({ data: { text: "Local OCR", blocks: [] } })),
  },
}));

import Tesseract from "tesseract.js";
import { convertToMarkdown } from "../src/index.js";

describe("Tesseract language data options", () => {
  it("passes local language data and disables the filesystem cache", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const result = await convertToMarkdown("scan.png", bytes, {
      image: { languageDataPath: "/local/lang/" },
    });
    expect(result.markdown).toBe("## OCR Text\n\nLocal OCR");
    expect(Tesseract.recognize).toHaveBeenLastCalledWith(bytes, "eng", {
      langPath: "/local/lang/",
      gzip: true,
      cacheMethod: "none",
    });
  });

  it("preserves default Tesseract options for callers without a language data path", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const result = await convertToMarkdown("scan.png", bytes);
    expect(result.markdown).toBe("## OCR Text\n\nLocal OCR");
    expect(Tesseract.recognize).toHaveBeenLastCalledWith(bytes, "eng", undefined);
    expect(result.warnings).toEqual([
      "OCR runs locally and may take longer on large images. First run can download language data.",
    ]);
  });
});
