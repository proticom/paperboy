import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { convertFileToMarkdown } from "../src/converter.ts";

let tempDir = "";

describe("converter", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperboy-cli-convert-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("converts plain text files", async () => {
    const filePath = path.join(tempDir, "note.txt");
    await fs.writeFile(filePath, "Hello\r\nWorld", "utf8");

    const result = await convertFileToMarkdown(filePath);

    expect(result.title).toBe("note");
    expect(result.markdown).toBe("Hello\nWorld");
    expect(result.warnings).toHaveLength(0);
  });

  it("converts html files to markdown", async () => {
    const filePath = path.join(tempDir, "sample.html");
    await fs.writeFile(
      filePath,
      "<html><head><title>Sample Title</title></head><body><h1>Heading</h1><p>Body text</p></body></html>",
      "utf8",
    );

    const result = await convertFileToMarkdown(filePath);

    expect(result.title).toBe("Sample Title");
    expect(result.markdown).toContain("# Heading");
    expect(result.markdown).toContain("Body text");
  });

  it("converts rtf files to plain markdown text", async () => {
    const filePath = path.join(tempDir, "memo.rtf");
    await fs.writeFile(
      filePath,
      "{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}\\f0\\fs24 Hello\\par World}",
      "utf8",
    );

    const result = await convertFileToMarkdown(filePath);

    expect(result.title).toBe("memo");
    expect(result.markdown).toContain("Hello");
    expect(result.markdown).toContain("World");
    expect(result.warnings).toHaveLength(0);
  });

  it("converts csv files to markdown table", async () => {
    const filePath = path.join(tempDir, "table.csv");
    await fs.writeFile(filePath, "Name,Role\nAda,Engineer\nLinus,Maintainer", "utf8");

    const result = await convertFileToMarkdown(filePath);

    expect(result.markdown).toContain("| Name | Role |");
    expect(result.markdown).toContain("| Ada | Engineer |");
    expect(result.warnings).toHaveLength(0);
  });

  it("returns warning for unsupported extension", async () => {
    const filePath = path.join(tempDir, "file.xyz");
    await fs.writeFile(filePath, "ignored", "utf8");

    const result = await convertFileToMarkdown(filePath);

    expect(result.markdown).toBe("");
    expect(result.warnings[0]).toContain("Unsupported file format");
  });

  it("converts image files with OCR text and layout", async () => {
    const filePath = path.join(tempDir, "scan.png");
    await fs.writeFile(filePath, Buffer.from([137, 80, 78, 71]));

    const result = await convertFileToMarkdown(filePath, {
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
    });

    expect(result.markdown).toContain("## Image Description");
    expect(result.markdown).toContain("A scanned receipt.");
    expect(result.markdown).toContain("## OCR Text");
    expect(result.markdown).toContain("Detected text");
    expect(result.markdown).toContain("## Text Positioning");
    expect(result.markdown).toContain("| Detected | 96.3 | 10 | 20 | 70 | 20 |");
  });

  it("warns when OCR finds no text", async () => {
    const filePath = path.join(tempDir, "empty.png");
    await fs.writeFile(filePath, Buffer.from([137, 80, 78, 71]));

    const result = await convertFileToMarkdown(filePath, {
      image: {
        ocr: async () => ({ text: "", words: [] }),
      },
    });

    expect(result.markdown).toBe("");
    expect(result.warnings.some((warning) => warning.includes("No readable text"))).toBe(
      true,
    );
  });
});
