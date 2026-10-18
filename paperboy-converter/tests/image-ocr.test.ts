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
        text: "Hello layout",
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

  it("requests blocks output so the positioning table is present by default", async () => {
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
    expect(result.markdown).toContain("## Text Positioning");
    expect(result.markdown).toContain("| Hello | 91.2 | 4 | 8 | 36 | 16 |");
  });
});
