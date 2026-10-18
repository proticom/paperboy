import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import { unwrapScriptLinks } from "../src/helpers.js";

describe("unwrapScriptLinks", () => {
  it.each([
    "javascript:alert(1)", " JaVa\tScript:alert(1)", "java\nscript:x",
    "VBScript:x", "vB\rScRiPt:x", "java script:x", "\x01java\x1fscript\x7f:x",
  ])("unwraps %j and keeps text and inline children", (href) => {
    const { document } = parseHTML('<p>Before <a>Keep <strong>bold</strong> and <em>italics</em></a> After</p>');
    document.querySelector("a")?.setAttribute("href", href);

    unwrapScriptLinks(document);

    expect(document.querySelector("p")?.innerHTML)
      .toBe("Before Keep <strong>bold</strong> and <em>italics</em> After");
    const once = document.toString();
    unwrapScriptLinks(document);
    expect(document.toString()).toBe(once);
  });

  it.each([
    "#frag", "/x", "https://example.org/x", "mailto:reader@example.org",
    "tel:+15550100", "data:text/plain,hello", "", "/javascript:x", "javascripted:x",
  ])("keeps non-script link %j unchanged", (href) => {
    const { document } = parseHTML('<p><a>Keep <strong>bold</strong></a> <a>No href</a></p>');
    document.querySelector("a")?.setAttribute("href", href);
    const before = document.toString();

    unwrapScriptLinks(document);

    expect(document.toString()).toBe(before);
  });
});
