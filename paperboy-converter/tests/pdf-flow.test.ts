import { describe, expect, it } from "vitest";

import { renderPdfPage, type PdfTextItem } from "../src/handlers/pdf-structure.js";

function line(text: string, x: number, y: number, width = 200, fontName = "Helvetica"): PdfTextItem {
  return { text, x, y, width, height: 12, fontName };
}

const opening = [
  line("PARA-01 a long paragraph begins", 40, 700),
  line("and fills the printed column", 40, 686),
  line("before continuing without a stop", 40, 672),
];

const continuation = [
  line("across the next printed column", 300, 700),
  line("with another complete body line", 300, 686),
  line("and ends here.", 300, 672, 90),
];

const openingText = "PARA-01 a long paragraph begins and fills the printed column before continuing without a stop";
const continuationText = "across the next printed column with another complete body line and ends here.";

describe("PDF paragraph flow between regions", () => {
  it("reflows ordinary ragged paragraphs relative to their narrow column", () => {
    expect(renderPdfPage([
      line("A full width paragraph supplies", 40, 700),
      line("the normal printed line length", 40, 686),
      line("and closes before the next paragraph.", 40, 672),
      line("PARA-02 bravo echo november", 40, 650, 155),
      line("juliet golf november charlie", 40, 636, 155),
      line("golf hotel alpha lima", 40, 622, 155),
      line("and ends here.", 40, 608, 85),
      ...continuation,
    ])).toBe(
      "A full width paragraph supplies the normal printed line length and closes before the next paragraph.\n\n"
      + "PARA-02 bravo echo november juliet golf november charlie golf hotel alpha lima and ends here.\n\n"
      + continuationText,
    );
  });

  it("preserves short verse when the column has full-width prose for comparison", () => {
    expect(renderPdfPage([
      line("A full width paragraph supplies", 40, 700),
      line("the normal printed line length", 40, 686),
      line("and closes before the verse.", 40, 672),
      line("Rain on glass", 40, 650, 75),
      line("Light on leaves", 40, 636, 80),
      line("The garden waits.", 40, 622, 90),
      ...continuation,
    ])).toBe(
      "A full width paragraph supplies the normal printed line length and closes before the verse.\n\n"
      + "Rain on glass\nLight on leaves\nThe garden waits.\n\n"
      + continuationText,
    );
  });

  it("joins a full-width unfinished paragraph across a column boundary", () => {
    expect(renderPdfPage([...opening, ...continuation])).toBe(`${openingText} ${continuationText}`);
  });

  it("joins a full-width unfinished paragraph across a horizontal band boundary", () => {
    expect(renderPdfPage([
      ...opening,
      ...continuation.map((item) => ({ ...item, x: 40, y: item.y - 100 })),
    ])).toBe(`${openingText} ${continuationText}`);
  });

  it("keeps separate columns when the page supplies no paragraph punctuation evidence", () => {
    expect(renderPdfPage([
      ...opening,
      ...continuation.slice(0, 2),
      line("and stops without punctuation", 300, 672, 90),
    ])).toBe(
      openingText + "\n\nacross the next printed column with another complete body line and stops without punctuation",
    );
  });

  it("keeps a paragraph boundary after terminal punctuation", () => {
    expect(renderPdfPage([
      ...opening.slice(0, 2),
      line("before stopping here.", 40, 672),
      ...continuation,
    ])).toBe(
      "PARA-01 a long paragraph begins and fills the printed column before stopping here.\n\n" + continuationText,
    );
  });

  it("keeps a paragraph boundary after a short final line", () => {
    expect(renderPdfPage([
      ...opening.slice(0, 2),
      line("a short ending", 40, 672, 75),
      ...continuation,
    ])).toBe(
      "PARA-01 a long paragraph begins and fills the printed column a short ending\n\n" + continuationText,
    );
  });

  it("does not join a column's body paragraph to the next column's heading", () => {
    expect(renderPdfPage([
      ...opening,
      line("A separate heading", 300, 700, 200, "Helvetica-Bold"),
      ...continuation.slice(1),
    ])).toBe(
      openingText + "\n\n### A separate heading\n\nwith another complete body line and ends here.",
    );
  });

  it("does not join a column's body paragraph to the next column's list", () => {
    expect(renderPdfPage([
      ...opening,
      line("- Read the first note.", 300, 700),
      line("- Read the next note.", 300, 686),
      line("- Read the final note.", 300, 672),
    ])).toBe(
      openingText + "\n\n- Read the first note.\n- Read the next note.\n- Read the final note.",
    );
  });

  it("does not join a column's body paragraph to the next column's table", () => {
    expect(renderPdfPage([
      ...opening,
      line("Key", 300, 700, 20), line("Count", 370, 700, 30), line("Total", 440, 700, 30),
      line("A", 300, 686, 10), line("2", 370, 686, 10), line("4", 440, 686, 10),
      line("B", 300, 672, 10), line("3", 370, 672, 10), line("6", 440, 672, 10),
      line("A separate paragraph follows the table", 300, 650),
      line("with another complete printed line", 300, 636),
      line("and ends here.", 300, 622, 90),
    ])).toBe(
      openingText + "\n\n| Key | Count | Total |\n| --- | --- | --- |\n| A | 2 | 4 |\n| B | 3 | 6 |\n\n"
      + "A separate paragraph follows the table with another complete printed line and ends here.",
    );
  });
});
