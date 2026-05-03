import { describe, expect, it } from "vitest";

import { convertToMarkdown } from "../src/index.js";

describe("shared converter", () => {
  it("converts plain text files", async () => {
    const result = await convertToMarkdown("note.txt", "Hello\r\nWorld");

    expect(result.title).toBe("note");
    expect(result.markdown).toBe("Hello\nWorld");
    expect(result.warnings).toEqual([]);
  });

  it("converts html files to markdown", async () => {
    const result = await convertToMarkdown(
      "sample.html",
      "<html><head><title>Sample Title</title></head><body><h1>Heading</h1><p>Body text</p></body></html>",
    );

    expect(result.title).toBe("Sample Title");
    expect(result.markdown).toContain("# Heading");
    expect(result.markdown).toContain("Body text");
  });

  it("converts rtf files to readable text", async () => {
    const result = await convertToMarkdown(
      "memo.rtf",
      "{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}\\f0\\fs24 Hello\\par World}",
    );

    expect(result.title).toBe("memo");
    expect(result.markdown).toContain("Hello");
    expect(result.markdown).toContain("World");
    expect(result.warnings).toHaveLength(0);
  });

  it("converts csv files to markdown table", async () => {
    const result = await convertToMarkdown(
      "table.csv",
      "Name,Role\nAda,Engineer\nLinus,Maintainer",
    );

    expect(result.markdown).toContain("| Name | Role |");
    expect(result.markdown).toContain("| Ada | Engineer |");
    expect(result.warnings).toHaveLength(0);
  });

  it("returns warning for unsupported extension", async () => {
    const result = await convertToMarkdown("file.xyz", "ignored");

    expect(result.markdown).toBe("");
    expect(result.warnings[0]).toContain("Unsupported file format");
  });

  it("converts image files with OCR text and layout", async () => {
    const result = await convertToMarkdown(
      "scan.png",
      new Uint8Array([137, 80, 78, 71]),
      {
        image: {
          ocr: async () => ({
            text: "Detected text",
            words: [
              {
                text: "Detected",
                confidence: 96.3,
                bbox: { x0: 10, y0: 20, x1: 80, y1: 40 },
              },
            ],
          }),
          describeImage: async () => "A scanned receipt.",
        },
      },
    );

    expect(result.markdown).toContain("## Image Description");
    expect(result.markdown).toContain("A scanned receipt.");
    expect(result.markdown).toContain("## OCR Text");
    expect(result.markdown).toContain("Detected text");
    expect(result.markdown).toContain("## Text Positioning");
    expect(result.markdown).toContain("| Detected | 96.3 | 10 | 20 | 70 | 20 |");
  });

  it("warns when OCR finds no text", async () => {
    const result = await convertToMarkdown(
      "empty.png",
      new Uint8Array([137, 80, 78, 71]),
      {
        image: {
          ocr: async () => ({ text: "", words: [] }),
        },
      },
    );

    expect(result.markdown).toBe("");
    expect(
      result.warnings.some((warning) => warning.includes("No readable text")),
    ).toBe(true);
  });
});
