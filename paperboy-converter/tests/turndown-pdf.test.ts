import { describe, expect, it } from "vitest";

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

