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
    { name: "control bytes", input: new Uint8Array([0, 1, 2]), markdown: "\u0000\u0001\u0002" },
  ])("converts $name with the plain-text fallback", async ({ input, markdown }) => {
    expect(await convert("path/fallback.html", input)).toEqual({
      markdown,
      title: "fallback",
      warnings: [],
    });
  });
});
