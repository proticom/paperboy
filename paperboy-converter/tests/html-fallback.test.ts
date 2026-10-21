import { describe, expect, it } from "vitest";

import { convertHtml } from "../src/handlers/html.js";
import { convertToMarkdown } from "../src/index.js";

describe.each([
  { name: "convertHtml", convert: convertHtml },
  { name: "convertToMarkdown", convert: convertToMarkdown },
])("$name without a document element", ({ convert }) => {
  it.each([
    { name: "empty", input: "", markdown: "" },
    { name: "whitespace", input: "   ", markdown: "" },
    { name: "plain text", input: "  Plain text body  ", markdown: "Plain text body" },
    { name: "JSON", input: '{"message":"hello"}', markdown: '{"message":"hello"}' },
    { name: "comment", input: "<!-- comment -->", markdown: "" },
    { name: "doctype", input: "<!doctype html>", markdown: "" },
    { name: "XML declaration", input: '<?xml version="1.0"?>', markdown: "" },
    { name: "processing instruction", input: "<?process value?>", markdown: "" },
    {
      name: "mixed declarations",
      input: ' \n<!-- first\ncomment -->\n<!DOCTYPE html>\n<?xml version="1.0"?>\n<?process value?> ',
      markdown: "",
    },
    {
      name: "text beside declarations",
      input: ' <!-- comment -->\n<!DOCTYPE html>\n<?xml version="1.0"?>\nPlain text body ',
      markdown: "Plain text body",
    },
    { name: "less-than text", input: "a < b", markdown: "a < b" },
    { name: "PNG bytes", input: new Uint8Array([137, 80, 78, 71]), markdown: "\uFFFDPNG" },
    { name: "control bytes", input: new Uint8Array([0, 1, 2]), markdown: "" },
    { name: "controls beside a tab", input: "A\u0000B\u0007C\tD", markdown: "ABC\tD" },
    {
      name: "all stripped controls",
      input: "A\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008\u000B\u000C\u000E\u000F\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001A\u001B\u001C\u001D\u001E\u001F\u007FB",
      markdown: "AB",
    },
    { name: "permitted whitespace", input: "A\tB\nC\rD", markdown: "A\tB\nC\rD" },
    {
      name: "Markdown link and emphasis",
      input: "MDTEXT a < b and [evil](javascript:alert(2)) **bold**",
      markdown: "MDTEXT a < b and \\[evil\\](javascript:alert(2)) \\*\\*bold\\*\\*",
    },
    {
      name: "Markdown heading, link, and image",
      input: "# INJECTED HEADING\n[click me](javascript:alert(1)) ![px](http://evil.example/p.png)",
      markdown: "\\# INJECTED HEADING\n\\[click me\\](javascript:alert(1)) !\\[px\\](http://evil.example/p.png)",
    },
    {
      name: "Markdown heading on a later line",
      input: "Introduction\n# INJECTED HEADING",
      markdown: "Introduction\n\\# INJECTED HEADING",
    },
    {
      name: "Markdown heading after a carriage return",
      input: "Introduction\r  # INJECTED HEADING",
      markdown: "Introduction\r  \\# INJECTED HEADING",
    },
  ])("converts $name with the plain-text fallback", async ({ input, markdown }) => {
    const result = await convert("path/fallback.html", input);
    expect(result).toEqual({
      markdown,
      title: "fallback",
      warnings: [],
    });
    expect(result.markdown).not.toMatch(/(^|[^\\])\[[^\]]+\]\(/);
    expect(result.markdown).not.toMatch(/^# /m);
    expect(result.markdown).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/);
  });
});
