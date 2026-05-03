import { describe, expect, it } from "vitest";

import { reflowPdfPageText } from "../src/handlers/pdf.js";
import { createTurndownService } from "../src/turndown.js";

describe("createTurndownService", () => {
  it("converts td-only tables to pipe tables instead of raw HTML", () => {
    const html =
      "<table><tbody><tr><td>Brand</td><td>NVIDIA</td></tr><tr><td>OS</td><td>Linux</td></tr></tbody></table>";
    const md = createTurndownService().turndown(html);

    expect(md).toContain("| Brand | NVIDIA |");
    expect(md).toContain("| OS | Linux |");
    expect(md).not.toMatch(/<table/i);
  });

  it("still converts standard thead tables via GFM", () => {
    const html =
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>";
    const md = createTurndownService().turndown(html);

    expect(md).toContain("| A | B |");
    expect(md).toContain("| 1 | 2 |");
    expect(md).not.toMatch(/<table/i);
  });
});

describe("reflowPdfPageText", () => {
  it("joins soft line breaks and promotes ALL-CAPS section lines to headings", () => {
    const raw =
      "Intro line here\nKEY SECTION TITLE\nFirst line of body that was\nwrapped across many\nphysical lines.\n\nNext paragraph start.";
    const out = reflowPdfPageText(raw);

    expect(out).toContain("Intro line here");
    expect(out).toContain("## KEY SECTION TITLE");
    expect(out).toContain(
      "First line of body that was wrapped across many physical lines.",
    );
    expect(out).toContain("Next paragraph start.");
  });

  it("merges hyphenated line breaks from PDF extraction", () => {
    expect(reflowPdfPageText("some long-\nword here")).toBe("some longword here");
  });
});
