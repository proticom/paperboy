import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { convertToMarkdown } from "../src/index.js";

// TextEdit (macOS) writes \pardirnatural / \partightenfactor0 in the
// paragraph header and ends every line with a backslash before the newline.
const TEXTEDIT_BODY = [
  "{\\rtf1\\ansi\\ansicpg1252\\cocoartf2822",
  "\\pard\\tx720\\tx1440\\pardirnatural\\partightenfactor0",
  "",
  "\\f0\\fs24 \\cf0 First body line ALPHA.\\",
  "Second body line BRAVO.\\",
  "\\",
  "Third paragraph CHARLIE.}",
  "",
].join("\n");

function bodyLines(markdown: string): string[] {
  return markdown.split("\n").filter((line) => line.trim() !== "");
}

describe("TextEdit-style RTF", () => {
  it("decodes a TextEdit body without control-word or line-break residue", async () => {
    const result = await convertToMarkdown("note.rtf", TEXTEDIT_BODY);

    expect(result.markdown).toBe(
      "First body line ALPHA.\n\nSecond body line BRAVO.\n\nThird paragraph CHARLIE.",
    );
    expect(result.warnings).toHaveLength(0);
  });

  it("handles CRLF line endings the same way", async () => {
    const result = await convertToMarkdown(
      "note.rtf",
      TEXTEDIT_BODY.replace(/\n/g, "\r\n"),
    );

    expect(result.markdown).toBe(
      "First body line ALPHA.\n\nSecond body line BRAVO.\n\nThird paragraph CHARLIE.",
    );
  });

  it("converts a full TextEdit document fixture", async () => {
    const url = new URL("./fixtures/textedit-sample.rtf", import.meta.url);
    const result = await convertToMarkdown(
      "textedit-sample.rtf",
      new Uint8Array(readFileSync(url)),
    );
    const lines = bodyLines(result.markdown);

    // \pardirnatural and \partightenfactor0 must not be read as \par.
    expect(result.markdown).not.toMatch(/irnatural|tightenfactor/);
    // Each line-ending backslash is a paragraph break, not literal text, and
    // later paragraphs do not start with the control word's delimiter space.
    // (Header-group text such as the font table is handled separately.)
    expect(result.markdown).toMatch(
      /First body line ALPHA\.\n\nSecond body line BRAVO\.\n\nThird paragraph CHARLIE with a literal \\ backslash\.$/,
    );
    for (const line of lines) {
      expect(line).toBe(line.trimStart());
      expect(line.endsWith("\\")).toBe(false);
    }
  });

  it("keeps \\par, \\line and \\tab behaviour for plain RTF", async () => {
    const result = await convertToMarkdown(
      "memo.rtf",
      "{\\rtf1\\ansi Alpha\\par Beta\\line Gamma\\tab Delta}",
    );

    expect(result.markdown).toBe("Alpha\n\nBeta\nGamma\tDelta");
  });

  it("keeps the word after \\\\par followed by CRLF", async () => {
    const result = await convertToMarkdown(
      "memo.rtf",
      "{\\rtf1\\ansi First MIKE\\par\r\nSecond NOVEMBER\\par\r\nThird OSCAR\\par\r\n}",
    );

    expect(result.markdown).toBe(
      "First MIKE\n\nSecond NOVEMBER\n\nThird OSCAR",
    );
  });

  it("keeps the word after \\\\b and \\\\i followed by LF", async () => {
    const result = await convertToMarkdown(
      "memo.rtf",
      "{\\rtf1\\ansi \\b\nBold ROMEO\\b0\\par\n\\i\nItalic SIERRA}",
    );

    expect(result.markdown).toBe("Bold ROMEO\n\nItalic SIERRA");
  });

  it("keeps text after an escaped backslash", async () => {
    const result = await convertToMarkdown(
      "memo.rtf",
      "{\\rtf1\\ansi Path C:\\\\temp\\par Next XRAY}",
    );

    expect(result.markdown).toBe("Path C:\\temp\n\nNext XRAY");
  });
});
