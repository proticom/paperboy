import { beforeEach, describe, expect, it, vi } from "vitest";

const recognize = vi.fn();
const terminate = vi.fn(async () => {});
const createWorker = vi.fn(async () => ({ recognize, terminate }));
const convenienceRecognize = vi.fn();

vi.mock("tesseract.js", () => ({
  default: {
    createWorker: (...args: unknown[]) => createWorker(...args),
    recognize: (...args: unknown[]) => convenienceRecognize(...args),
  },
}));

describe("default tesseract OCR", () => {
  beforeEach(() => {
    recognize.mockReset();
    terminate.mockClear();
    createWorker.mockClear();
    convenienceRecognize.mockClear();
    recognize.mockResolvedValue({
      data: {
        text: "Hello",
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    words: [
                      {
                        text: "Hello",
                        confidence: 91.2,
                        bbox: { x0: 4, y0: 8, x1: 40, y1: 24 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it("requests blocks output for filtering even without a layout table", async () => {
    const { convertToMarkdown } = await import("../src/index.js");
    const result = await convertToMarkdown(
      "scan.png",
      new Uint8Array([137, 80, 78, 71]),
    );

    expect(convenienceRecognize).not.toHaveBeenCalled();
    expect(createWorker).toHaveBeenCalledWith("eng");
    expect(recognize).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      {},
      { text: true, blocks: true },
    );
    expect(terminate).toHaveBeenCalled();
    expect(result.markdown).toBe("Hello");
  });

  it("includes the raw table when explicitly requested", async () => {
    const { convertToMarkdown } = await import("../src/index.js");
    const result = await convertToMarkdown("scan.png", new Uint8Array([1]), {
      image: { includeLayoutTable: true },
    });
    expect(result.markdown).toBe("Hello\n\n## Text Positioning\n\n| Text | Confidence | Left | Top | Width | Height |\n| --- | ---: | ---: | ---: | ---: | ---: |\n| Hello | 91.2 | 4 | 8 | 36 | 16 |");
  });

  it("parses malformed nested blocks and supplies word and bounding-box defaults", async () => {
    recognize.mockResolvedValueOnce({
      data: {
        text: "Raw OCR",
        blocks: [null, 1, {}, { paragraphs: null }, { paragraphs: {} }, {
          paragraphs: [null, 1, {}, { lines: null }, { lines: {} }, {
            lines: [null, 1, {}, { words: null }, { words: {} }, {
              words: [null, 1, {}, { text: 123, confidence: 99 },
                { text: "Valid", confidence: 96, bbox: { x0: 4, y0: 8, x1: 40 } },
                { text: "fallback", confidence: "96", bbox: { y0: 10, y1: 20 } },
                { text: "kept", confidence: 96, bbox: null },
              ],
            }],
          }],
        }],
      },
    });
    const { convertToMarkdown } = await import("../src/index.js");
    const result = await convertToMarkdown("scan.png", new Uint8Array([1]), {
      image: { includeLayoutTable: true },
    });
    expect(result.markdown).toBe([
      "Valid fallback kept", "", "## Text Positioning", "",
      "| Text | Confidence | Left | Top | Width | Height |",
      "| --- | ---: | ---: | ---: | ---: | ---: |",
      "| Valid | 96.0 | 4 | 8 | 36 | 0 |",
      "| fallback | 0.0 | 0 | 10 | 0 | 10 |",
      "| kept | 96.0 | 0 | 0 | 0 | 0 |",
    ].join("\n"));
    expect(terminate).toHaveBeenCalledOnce();
  });

  it.each([undefined, null, {}, "invalid"])("preserves text when blocks is %j", async (blocks) => {
    recognize.mockResolvedValueOnce({ data: { text: "Raw OCR", blocks } });
    const { convertToMarkdown } = await import("../src/index.js");
    const result = await convertToMarkdown("scan.png", new Uint8Array([1]));
    expect(result.markdown).toBe("Raw OCR");
    expect(terminate).toHaveBeenCalledOnce();
  });

  it.each([undefined, null, {}])("handles missing OCR data or text in %j", async (data) => {
    recognize.mockResolvedValueOnce({ data });
    const { convertToMarkdown } = await import("../src/index.js");
    const result = await convertToMarkdown("scan.png", new Uint8Array([1]));
    expect(result.markdown).toBe("");
    expect(result.warnings).toContain("No readable text was detected in this image.");
    expect(terminate).toHaveBeenCalledOnce();
  });
});
