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
        line("Person: how do | lose weight?", { confidences: [96, 96, 91, 76, 95, 96], width: 950 }),
        line("Me: We have", { top: 70, width: 850 }),
        line("a way.", { top: 100, width: 200 }),
      ] },
      { lines: [line("r~ i SNE 3 dy CU", { confidences: [63, 38, 18, 33, 38, 23] }), line("=", { confidence: 93 })] },
      { lines: [
        line("4", { confidence: 94 }),
        line("Rta? = 0 2\\ be vi", { confidences: [36, 93, 0, 0, 46, 70] }),
        line("~~ . ol \\ 4 ea N", { confidences: [62, 25, 0, 76, 94, 49, 58] }),
        line("} Pout andi", { confidences: [0, 16, 3] }),
      ] },
      { lines: [line("All right, then. Keep'your, secrets.", { confidences: [92, 78, 85, 21, 90] })] },
    ]);
    expect(result.markdown).toBe("Person: how do I lose weight?\n\nMe: We have a way.\n\n<!-- image omitted -->\n\nAll right, then. Keep'your, secrets.");
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
      { lines: [line("Short line", { width: 100 }), line("a longer line below", { top: 30, width: 500 })] },
      { lines: [line("A line that fills the width", { width: 500 }), line("an indented line", { left: 100, top: 30, width: 400 })] },
      { lines: [line("A complete sentence.", { width: 500 }), line("Another sentence.", { top: 30, width: 500 })] },
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
    const result = await convert([{ lines: [line("2021 3.25 $4.50 10:30 12%", { confidence: 35 })] }]);
    expect(result.markdown).toBe("2021 3.25 $4.50 10:30 12%");
  });

  it("keeps numeric page lines but rejects isolated single digits and symbols", async () => {
    const result = await convert([
      { lines: [line("12")] }, { lines: [line("2026 10 20")] },
      { lines: [line("4", { confidence: 94 }), line("=", { confidence: 93 }), line("~~ \\")] },
    ]);
    expect(result.markdown).toBe("12\n\n2026 10 20\n\n<!-- image omitted -->");
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
