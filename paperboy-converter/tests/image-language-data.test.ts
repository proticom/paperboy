import { beforeEach, describe, expect, it, vi } from "vitest";

const worker = vi.hoisted(() => ({
  recognize: vi.fn(async () => ({ data: { text: "Local OCR", blocks: [] } })),
  terminate: vi.fn(),
}));

vi.mock("tesseract.js", () => ({
  default: {
    createWorker: vi.fn(async () => worker),
  },
}));

import Tesseract from "tesseract.js";
import { convertToMarkdown } from "../src/index.js";

describe("Tesseract language data options", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes local language data and disables the filesystem cache", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const result = await convertToMarkdown("scan.png", bytes, {
      image: { languageDataPath: "/local/lang/" },
    });
    expect(result.markdown).toBe("## OCR Text\n\nLocal OCR");
    expect(Tesseract.createWorker).toHaveBeenLastCalledWith("eng", undefined, {
      langPath: "/local/lang/",
      gzip: true,
      cacheMethod: "none",
    });
    expect(worker.recognize).toHaveBeenLastCalledWith(bytes, {}, {
      text: true,
      blocks: true,
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("preserves default Tesseract options for callers without a language data path", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const result = await convertToMarkdown("scan.png", bytes);
    expect(result.markdown).toBe("## OCR Text\n\nLocal OCR");
    expect(vi.mocked(Tesseract.createWorker).mock.lastCall).toEqual(["eng"]);
    expect(worker.recognize).toHaveBeenLastCalledWith(bytes, {}, {
      text: true,
      blocks: true,
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(result.warnings).toEqual([
      "OCR runs locally and may take longer on large images. First run can download language data.",
    ]);
  });
});
