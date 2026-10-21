import { describe, expect, it } from "vitest";
import { convertToMarkdown, type OcrWord } from "../src/index.js";

function line(tokens: [string, number][], top = 0) {
  return { words: tokens.map(([text, confidence], index): OcrWord => ({
    text, confidence, bbox: { x0: index * 50, y0: top, x1: index * 50 + 40, y1: top + 20 },
  })) };
}

async function convert(paragraphs: { lines: { words: OcrWord[] }[] }[], includeLayoutTable = false) {
  return convertToMarkdown("scan.png", new Uint8Array([1]), {
    image: { includeLayoutTable, ocr: async () => ({
      text: "Raw text is superseded by structured words",
      words: paragraphs.flatMap(p => p.lines.flatMap(l => l.words)),
      paragraphs,
    }) },
  });
}

describe("image OCR cleanup", () => {
  it("filters whole lines, collapses omitted regions across paragraphs, and preserves weak words in good lines", async () => {
    const result = await convert([
      { lines: [
        line([["Person:", 96], ["how", 96], ["do", 91], ["|", 76], ["lose", 95], ["weight?", 96]]),
        line([["Me:", 95], ["We", 96], ["have", 96]], 70),
        line([["a", 95], ["way.", 96]], 100),
      ] },
      { lines: [line([["r~", 63], ["SNE", 18], ["dy", 38]]), line([["=", 93]])] },
      { lines: [line([["4", 94]]), line([["vi", 70], ["ol", 0]]), line([["~~", 62], ["\\", 76]])] },
      { lines: [line([["All", 92], ["right,", 78], ["then.", 85], ["Keep'your,", 21], ["secrets.", 90]])] },
    ]);
    expect(result.markdown).toBe("Person: how do I lose weight?\n\nMe: We have a way.\n\n<!-- image omitted -->\n\nAll right, then. Keep'your, secrets.");
  });

  it("joins wrapped lines and separates clean paragraphs without markers", async () => {
    const result = await convert([
      { lines: [line([["Clean", 96], ["text", 95]]), line([["wraps", 93], ["here.", 92]], 30)] },
      { lines: [line([["Next", 91], ["paragraph.", 94]])] },
    ]);
    expect(result.markdown).toBe("Clean text wraps here.\n\nNext paragraph.");
  });

  it("uses a mean of 60 inclusively and rejects lines below it", async () => {
    const result = await convert([{ lines: [
      line([["Below", 59]]), line([["Boundary", 60]]), line([["Low", 0]]), line([["Again", 10]]),
    ] }]);
    expect(result.markdown).toBe("<!-- image omitted -->\n\nBoundary\n\n<!-- image omitted -->");
  });

  it("retains short words and numbers inside readable lines", async () => {
    const result = await convert([{ lines: [line([["I", 95], ["am", 95], ["4", 94]])] }]);
    expect(result.markdown).toBe("I am 4");
  });

  it("keeps high-confidence page numbers and numeric dates", async () => {
    const result = await convert([
      { lines: [line([["12", 96]])] },
      { lines: [line([["2026", 96], ["10", 96], ["20", 96]])] },
    ]);
    expect(result.markdown).toBe("12\n\n2026 10 20");
  });

  it("still rejects isolated single digits and symbols", async () => {
    const result = await convert([{ lines: [
      line([["4", 94]]), line([["=", 93]]), line([["~~", 94], ["\\", 96]]),
    ] }]);
    expect(result.markdown).toBe("<!-- image omitted -->");
  });

  it("leaves apostrophes, pipes outside prose, and punctuation unchanged", async () => {
    const result = await convert([{ lines: [line([["|", 76], ["don't", 91], ["edit", 95], ["|", 76]])] }]);
    expect(result.markdown).toBe("| don't edit |");
  });

  it("keeps raw rejected words in the opt-in debugging table", async () => {
    const result = await convert([{ lines: [line([["junk", 12]])] }], true);
    expect(result.markdown).toBe("<!-- image omitted -->\n\n## Text Positioning\n\n| Text | Confidence | Left | Top | Width | Height |\n| --- | ---: | ---: | ---: | ---: | ---: |\n| junk | 12.0 | 0 | 0 | 40 | 20 |");
    expect(result.warnings).toContain("No readable text was detected in this image.");
  });

  it("preserves legacy injected text when line structure is unavailable", async () => {
    const result = await convertToMarkdown("scan.png", new Uint8Array([1]), {
      image: { ocr: async () => ({ text: "Complete text\nwith original breaks.", words: line([["Complete", 95]]).words }) },
    });
    expect(result.markdown).toBe("Complete text\nwith original breaks.");
  });
});
