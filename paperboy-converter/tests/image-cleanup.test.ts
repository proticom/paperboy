import { describe, expect, it } from "vitest";
import { convertToMarkdown, type OcrLine, type OcrParagraph, type OcrWord } from "../src/index.js";

function line(text: string, options: {
  confidence?: number; confidences?: number[]; top?: number; left?: number; width?: number;
} = {}): OcrLine {
  const { top = 0, left = 0, confidence = 96 } = options;
  const scale = (options.width ?? text.length * 10) / text.length;
  let offset = 0;
  return { words: text.split(" ").map((token, index) => {
    const x0 = left + offset * scale;
    offset += token.length + 1;
    return {
      text: token, confidence: options.confidences?.[index] ?? confidence,
      bbox: { x0, y0: top, x1: x0 + token.length * scale, y1: top + 20 },
    };
  }) };
}

async function convert(paragraphs: OcrParagraph[], includeLayoutTable = false) {
  return convertToMarkdown("scan.png", new Uint8Array([1]), {
    image: { includeLayoutTable, ocr: async () => ({
      text: "Raw text is superseded by structured words",
      words: paragraphs.flatMap(p => p.lines.flatMap(l => l.words)), paragraphs,
    }) },
  });
}

describe("image OCR cleanup", () => {
  it("reflows captions, keeps weak words in good lines, and collapses consecutive junk regions", async () => {
    const result = await convert([
      { lines: [
        line("Person: So how do | lose weight?", { confidences: [96, 95, 96, 91, 76, 95, 96], width: 930 }),
        line("Me: We have to find a way for", { top: 170, width: 840 }),
        line("you to get in fewer calories than", { top: 200, width: 960 }),
        line("you burn.", { top: 230, width: 270 }),
      ] },
      { lines: [line("r~ i SNE 3 dy CU", { confidences: [63, 38, 18, 33, 38, 23] }), line("=", { confidence: 30 })] },
      { lines: [
        line("4", { confidence: 30 }),
        line("Rta? = 0 2\\ be vi", { confidences: [36, 93, 0, 0, 46, 70] }),
        line("~~ . ol \\ 4 ea N", { confidences: [62, 25, 0, 76, 94, 49, 58] }),
        line("} Pout andi", { confidences: [0, 16, 3] }),
      ] },
      { lines: [line("All right, then. Keep'your, secrets.", { confidences: [92, 78, 85, 21, 90] })] },
    ]);
    expect(result.markdown).toBe("Person: So how do I lose weight?\n\nMe: We have to find a way for you to get in fewer calories than you burn.\n\n<!-- image omitted -->\n\nAll right, then. Keep'your, secrets.");
  });

  it("joins prose wraps that reach the right edge and keeps separate paragraphs", async () => {
    const result = await convert([
      { lines: [line("Clean text flows across", { width: 400 }), line("the page.", { top: 30, width: 150 })] },
      { lines: [line("Next paragraph.")] },
    ]);
    expect(result.markdown).toBe("Clean text flows across the page.\n\nNext paragraph.");
  });

  it("keeps heading, list, form-label and receipt line breaks", async () => {
    const receipt: OcrLine[] = ["Coffee", "Bagel", "Total"].map((text, index) => ({ words: [
      { text, confidence: 96, bbox: { x0: 0, y0: index * 30, x1: 60, y1: index * 30 + 20 } },
      { text: ["4.50", "3.25", "7.75"][index], confidence: 96, bbox: { x0: 450, y0: index * 30, x1: 500, y1: index * 30 + 20 } },
    ] }));
    const result = await convert([
      { lines: [line("Heading", { width: 100 }), line("Body text reaches the edge", { top: 30, width: 600 }), line("and wraps here.", { top: 60, width: 300 })] },
      { lines: [line("Packing"), line("• Passport", { top: 30 }), line("- Phone charger", { top: 60 }), line("1. Book hotel", { top: 90 }), line("a) Print ticket", { top: 120 }), line("[ ] Check bag", { top: 150 })] },
      { lines: [line("Name:"), line("Email:", { top: 30 }), line("Phone:", { top: 60 })] },
      { lines: receipt },
    ]);
    expect(result.markdown).toBe("Heading\nBody text reaches the edge and wraps here.\n\nPacking\n• Passport\n- Phone charger\n1. Book hotel\na) Print ticket\n[ ] Check bag\n\nName:\nEmail:\nPhone:\n\nCoffee 4.50\nBagel 3.25\nTotal 7.75");
  });

  it("does not join short, indented or sentence-final lines before uppercase text", async () => {
    const result = await convert([
      { lines: [line("Short line", { width: 100 }), line("a longer line below", { top: 30 })] },
      { lines: [line("A line that fills the width"), line("an indented line", { left: 100, top: 30 })] },
      { lines: [line("A complete sentence."), line("Another sentence.", { top: 30 })] },
    ]);
    expect(result.markdown).toBe("Short line\na longer line below\n\nA line that fills the width\nan indented line\n\nA complete sentence.\nAnother sentence.");
  });

  it("recovers prose paragraph breaks after short sentence-final lines", async () => {
    const result = await convert([{ lines: [
      line("A paragraph fills the line", { width: 500 }), line("and ends.", { top: 30, width: 150 }),
      line("The next paragraph fills it", { top: 60, width: 500 }), line("and ends too.", { top: 90, width: 200 }),
    ] }]);
    expect(result.markdown).toBe("A paragraph fills the line and ends.\n\nThe next paragraph fills it and ends too.");
  });

  it("rescues the captured low-confidence table row without changing its words", async () => {
    const words = [
      { text: "AliceMartin", confidence: 86, bbox: { x0: 48, y0: 121, x1: 136, y1: 133 } },
      { text: "Engineer", confidence: 52, bbox: { x0: 181, y0: 121, x1: 247, y1: 137 } },
      { text: "Denver", confidence: 35, bbox: { x0: 285, y0: 121, x1: 337, y1: 133 } },
      { text: "2021", confidence: 42, bbox: { x0: 379, y0: 121, x1: 411, y1: 133 } },
    ] satisfies OcrWord[];
    const result = await convert([{ lines: [{ words }] }]);
    expect(result.markdown).toBe("AliceMartin Engineer Denver 2021");
  });

  it("rescues readable amounts, times and percentages at modest confidence", async () => {
    const result = await convert([{ lines: [line("2021 3.25 $4.50 10:30 12%", { confidence: 45 })] }]);
    expect(result.markdown).toBe("2021 3.25 $4.50 10:30 12%");
  });

  it("keeps numeric page lines and all other confident lines", async () => {
    const result = await convert([
      { lines: [line("12")] }, { lines: [line("2026 10 20")] },
      { lines: [line("4"), line("="), line("~~", { top: 30 })] },
    ]);
    expect(result.markdown).toBe("12\n\n2026 10 20\n\n4\n=\n~~");
  });

  it.each([
    ["how do | lose weight?", "how do I lose weight?"],
    ["Home | Reports | Weekly | Export", "Home | Reports | Weekly | Export"],
    ["Status | Ready", "Status | Ready"],
    ["how do | lose | weight?", "how do | lose | weight?"],
    ["left | Right", "left | Right"],
    ["return left | right;", "return left | right;"],
    ["| don't edit |", "| don't edit |"],
  ])("handles pipes in %s", async (text, expected) => {
    const result = await convert([{ lines: [line(text)] }]);
    expect(result.markdown).toBe(expected);
  });

  it("keeps code lines and adjoining low-confidence closing punctuation as read", async () => {
    const text = ["function total(items) {", "return items.length;", "i", "}", ");", "]", "};", "const count = total([]);"];
    const result = await convert([{ lines: text.map((text, index) => line(text, {
      confidence: index >= 2 && index <= 6 ? 0 : 96, top: index * 30,
    })) }]);
    expect(result.markdown).toBe(text.join("\n"));
  });

  it("ignores an uncertain list prefix when rescuing readable text", async () => {
    const result = await convert([{ lines: [line("« Notebook", { confidences: [0, 96] })] }]);
    expect(result.markdown).toBe("« Notebook");
  });

  it("keeps code statements with a confident keyword and uncertain arguments", async () => {
    const result = await convert([{ lines: [line("const size = count ([1l, 21);", {
      confidences: [96, 96, 96, 0, 0, 42],
    })] }]);
    expect(result.markdown).toBe("const size = count ([1l, 21);");
  });

  it("retains adjoining closing code fragments across Tesseract paragraphs", async () => {
    const result = await convert([
      { lines: [line("return count;", { top: 0 })] },
      { lines: [line("}", { confidence: 0, top: 30 })] },
    ]);
    expect(result.markdown).toBe("return count;\n\n}");
  });

  it.each([
    "SKU-7284", "https://example.org/orders/42", "help@example.org", "v4.2.1", "2026-10-20",
    "$5", "7", "東", "京", "東 京", "INVOICE PAID", "iPhone McDonald",
  ])("keeps confident alphanumeric lines: %s", async (text) => {
    const result = await convert([{ lines: [line(text, { confidence: 95 })] }]);
    expect(result.markdown).toBe(text);
  });

  it.each([
    { text: "INVOICE PAID", confidence: 50 }, { text: "iPhone McDonald", confidence: 50 },
    { text: "élève garçon", confidence: 45 }, { text: "Straße Übung", confidence: 45 },
    { text: "v3.8.1", confidence: 57 },
  ])("rescues readable text without a case restriction: $text", async ({ text, confidence }) => {
    const result = await convert([{ lines: [line(text, { confidence })] }]);
    expect(result.markdown).toBe(text);
  });

  it("keeps an uncertain code supported by its confident label", async () => {
    const result = await convert([{ lines: [line("ID: AB12:XY99", { confidences: [92, 15] })] }]);
    expect(result.markdown).toBe("ID: AB12:XY99");
  });

  it.each([
    { text: "} Pout andi", confidences: [20, 35, 32] },
    { text: "ee the and", confidences: [31, 33, 30] },
    { text: "Ses ond", confidences: [35, 35] },
  ])("does not rescue low-mean letter-shaped junk: $text", async ({ text, confidences }) => {
    const result = await convert([{ lines: [line(text, { confidences })] }]);
    expect(result.markdown).toBe("<!-- image omitted -->");
  });

  it("keeps pipes and standalone identifiers on their own lines", async () => {
    const result = await convert([{ lines: [
      line("| name | role |"), line("| alice | staff |", { top: 30 }),
      line("| bruno | staff |", { top: 60 }), line("| chen | staff |", { top: 90 }),
    ] }]);
    expect(result.markdown).toBe("| name | role |\n| alice | staff |\n| bruno | staff |\n| chen | staff |");
    const codes = await convert([{ lines: [
      line("https://example.org/orders/42"), line("help@example.org", { top: 30 }),
    ] }]);
    expect(codes.markdown).toBe("https://example.org/orders/42\nhelp@example.org");
  });

  it("separates a full-width two-line heading from smaller body text", async () => {
    const result = await convert([{ lines: [
      line("Annual report on coastal plans", { width: 600 }),
      line("and harbour repairs this year", { top: 30, width: 580 }),
      line("This report describes the work completed by the local team.", { top: 60 }),
    ] }]);
    expect(result.markdown).toBe("Annual report on coastal plans and harbour repairs this year\n\nThis report describes the work completed by the local team.");
  });

  it("separates prose across a gap greater than the normal line pitch", async () => {
    const first = "A line fills the available width";
    const second = "and another full line continues it";
    const result = await convert([{ lines: [
      line(first), line(second, { top: 20 }), line(first, { top: 55 }), line(second, { top: 75 }),
    ] }]);
    expect(result.markdown).toBe(first + " " + second + "\n\n" + first + " " + second);
  });

  it("uses stable OCR line boxes when word boxes extend outside the line", async () => {
    const texts = ["A".repeat(100), "b".repeat(100), "c".repeat(100)];
    const lines = texts.map((text, index) => ({
      ...line(text, { top: [0, 5, 60][index] }),
      bbox: { x0: 0, y0: index * 30, x1: 1000, y1: index * 30 + 20 },
    }));
    lines[1].words[0].bbox.y1 = 50;
    const result = await convert([{ lines }]);
    expect(result.markdown).toBe(texts.join(" "));
  });

  it("removes a letter-final hyphen only on an actual lowercase prose wrap", async () => {
    const wrapped = await convert([{ lines: [line("Quick develop-"), line("ment notes.", { top: 30 })] }]);
    expect(wrapped.markdown).toBe("Quick development notes.");
    const short = await convert([{ lines: [line("Short develop-"), line("ment with many additional words.", { top: 30 })] }]);
    expect(short.markdown).toBe("Short develop-\nment with many additional words.");
  });

  it.each([
    { length: 55, separator: "\n" }, { length: 75, separator: "\n" }, { length: 90, separator: " " },
  ])("pins the 85% prose-wrap edge at $length percent", async ({ length, separator }) => {
    const first = "A".repeat(length);
    const second = "b".repeat(100);
    const result = await convert([{ lines: [line(first), line(second, { top: 30 })] }]);
    expect(result.markdown).toBe(first + separator + second);
  });

  it("keeps raw rejected words in the opt-in debugging table", async () => {
    const result = await convert([{ lines: [{ words: [{
      text: "junk", confidence: 12, bbox: { x0: 0, y0: 0, x1: 40, y1: 20 },
    }] }] }], true);
    expect(result.markdown).toBe("<!-- image omitted -->\n\n## Text Positioning\n\n| Text | Confidence | Left | Top | Width | Height |\n| --- | ---: | ---: | ---: | ---: | ---: |\n| junk | 12.0 | 0 | 0 | 40 | 20 |");
    expect(result.warnings).toContain("No readable text was detected in this image.");
  });

  it("preserves legacy injected text without line structure", async () => {
    const result = await convertToMarkdown("scan.png", new Uint8Array([1]), {
      image: { ocr: async () => ({ text: "Complete text\nwith original breaks.", words: line("Complete").words }) },
    });
    expect(result.markdown).toBe("Complete text\nwith original breaks.");
  });
});
