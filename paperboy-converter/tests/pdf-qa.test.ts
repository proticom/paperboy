import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { convertToMarkdown } from "../src/index.js";
import { collapseLetterSpacing, reflowLines, renderPdfPage, type PdfTextItem } from "../src/handlers/pdf-structure.js";

const boundary = vi.hoisted(() => ({ document: vi.fn(), extract: vi.fn() }));

vi.mock("unpdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("unpdf")>();
  return {
    ...actual,
    getDocumentProxy: boundary.document.mockImplementation(actual.getDocumentProxy),
    extractText: boundary.extract.mockImplementation(actual.extractText),
  };
});

function item(text: string, x: number, y: number, height = 12): PdfTextItem {
  return { text, x, y, height, width: text.length * 6, fontName: "Helvetica" };
}

describe("PDF layout regressions", () => {
  it("preserves ragged table rows instead of reading them as columns", () => {
    expect(renderPdfPage([
      item("Name", 40, 700), item("Count", 200, 700), item("Unit", 300, 700),
      item("Alpha", 40, 680), item("2", 200, 680), item("kg", 300, 680),
      item("Beta", 40, 660), item("3", 200, 660),
      item("Gamma", 40, 640), item("4", 200, 640), item("kg", 300, 640),
    ])).toBe("Name Count Unit\nAlpha 2 kg\nBeta 3\nGamma 4 kg");
  });

  it("keeps genuine prose columns in column order", () => {
    expect(renderPdfPage([
      item("The left column begins with a", 40, 700),
      item("The right column contains a", 330, 700),
      item("short paragraph that wraps over", 40, 684),
      item("second paragraph that also uses", 330, 684),
      item("three printed lines.", 40, 668),
      item("three printed lines.", 330, 668),
    ])).toBe("The left column begins with a short paragraph that wraps over three printed lines.\n\nThe right column contains a second paragraph that also uses three printed lines.");
  });

  it.each([
    ["well-", "known", "well-known"],
    ["self-", "contained", "self-contained"],
    ["state-of-the-", "art", "state-of-the-art"],
    ["informa\u00ad", "tion", "information"],
  ])("joins %s and %s without damaging compound spelling", (first, second, expected) => {
    expect(reflowLines([first, second])).toBe(expected);
  });

  it.each([
    "Operative trials used axes x y z in a longer sentence.",
    "N A S A funded a longer sentence.",
  ])("keeps mixed prose unchanged and does not infer a heading for %j", (text) => {
    expect(collapseLetterSpacing(text)).toBe(text);
    expect(renderPdfPage([item(text, 40, 700)])).toBe(text);
  });

  it("joins a geometrically tracked acronym without turning its sentence into a heading", () => {
    expect(renderPdfPage([
      { ...item("F", 40, 700), width: 5 },
      { ...item("B", 46, 700), width: 5 },
      { ...item("I", 52, 700), width: 3 },
      item("agents reviewed the logs.", 61, 700),
    ])).toBe("FBI agents reviewed the logs.");
  });

  it("keeps a spaced acronym attached to prose across a wide same-line gap", () => {
    expect(renderPdfPage([
      { ...item("N A S A", 40, 700), width: 48 },
      item("funded the second phase.", 120, 700),
    ])).toBe("N A S A funded the second phase.");
  });

  it.each(["€ £ ¥ —", "≤ ≥ → ∑ ∞", "a / b", "/ /"])("keeps symbol spacing in %j", (text) => {
    expect(collapseLetterSpacing(text)).toBe(text);
    expect(renderPdfPage([item(text, 40, 700)])).toBe(text);
  });

  it("collapses repeated slash punctuation only inside a letter-spaced heading", () => {
    expect(collapseLetterSpacing("/ / W H E R E  W E  G O")).toBe("// WHERE WE GO");
  });

  it("reflows a wrapped line beginning with a number without inventing a list", () => {
    expect(renderPdfPage([
      item("The number fell from four to", 40, 700),
      item("2. Analysts reviewed the result.", 40, 684),
    ])).toBe("The number fell from four to 2. Analysts reviewed the result.");
  });

  it("keeps a year at the start of prose out of an ordered list", () => {
    expect(renderPdfPage([
      item("The archive was updated in", 40, 700),
      item("2026. The year brought more records.", 40, 684),
    ])).toBe("The archive was updated in 2026. The year brought more records.");
  });

  it("escapes a standalone year so Markdown renders prose instead of a list", () => {
    expect(renderPdfPage([
      item("2026. The year brought more records.", 40, 700),
    ])).toBe("2026\\. The year brought more records.");
  });

  it("escapes a rejected closing-parenthesis marker at the start of prose", () => {
    expect(renderPdfPage([
      item("2) Analysts reviewed the result.", 40, 700),
    ])).toBe("2\\) Analysts reviewed the result.");
  });

  it("keeps sequential numbered items as a list", () => {
    expect(renderPdfPage([
      item("1. Read the page.", 40, 700),
      item("2. Save the note.", 40, 680),
    ])).toBe("1. Read the page.\n2. Save the note.");
  });

  it("recognizes an isolated numbered item from its hanging continuation", () => {
    expect(renderPdfPage([
      item("3. A wrapped numbered", 40, 700),
      item("list item continues.", 58, 684),
    ])).toBe("3. A wrapped numbered list item continues.");
  });
});

describe("PDF handler regressions", () => {
  it("emits a multipage document title before the first page marker", async () => {
    const pages = [
      [item("A document title", 40, 720, 30), item("A longer body paragraph appears on the first page.", 40, 680)],
      [item("A paragraph appears on the second page.", 40, 720)],
    ];
    boundary.document.mockResolvedValueOnce({
      numPages: pages.length,
      getPage: async (number: number) => ({
        getStructTree: async () => null,
        getTextContent: async () => ({
          styles: { Helvetica: { fontFamily: "Helvetica" } },
          items: pages[number - 1].map((text) => ({
            str: text.text, transform: [text.height, 0, 0, text.height, text.x, text.y],
            width: text.width, height: text.height, fontName: text.fontName,
          })),
        }),
      }),
      destroy: async () => undefined,
    });
    const bytes = new Uint8Array(readFileSync(new URL("./fixtures/sample.pdf", import.meta.url)));
    const result = await convertToMarkdown("multipage.pdf", bytes);

    expect(result.markdown).toBe("# A document title\n\n## Page 1\n\nA longer body paragraph appears on the first page.\n\n## Page 2\n\nA paragraph appears on the second page.");
    expect(result.title).toBe("multipage");
    expect(result.warnings).toEqual([]);
  });

  it.each(["InvalidPDFException", "PasswordException", "MissingPDFException"])(
    "rethrows %s without parsing the same PDF again",
    async (name) => {
      const error = Object.assign(new Error("A fatal PDF input error"), { name });
      boundary.document.mockRejectedValueOnce(error);
      const before = boundary.extract.mock.calls.length;
      const bytes = new Uint8Array(readFileSync(new URL("./fixtures/sample.pdf", import.meta.url)));

      await expect(convertToMarkdown("fatal.pdf", bytes)).rejects.toBe(error);
      expect(boundary.extract.mock.calls.length).toBe(before);
    },
  );
});
