const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { DOMParser } = require("linkedom");
const Readability = require("../lib/readability.js");

const fixture = fs.readFileSync(path.join(__dirname, "fixtures/links/page-base-tag.html"), "utf8");
const url = "https://example.org/deep/dir/page.html";

for (const conversionPath of ["readability", "fallback"]) {
  const html = conversionPath === "fallback"
    ? fixture.replace("<body>", `<body><nav role="navigation"><p>${"Navigation text ".repeat(1500)}</p></nav>`)
    : fixture;

  for (const baseUrl of ["https://example.org/assets/v2/", undefined]) {
    test(`whole-page ${conversionPath} resolves links with ${baseUrl ? "document base" : "page URL fallback"}`, async () => {
      const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
      const result = convertHtmlToMarkdown({ html, url, baseUrl }, { DOMParser, Readability });
      assert.equal(result.conversionPath, conversionPath);
      const directory = baseUrl ? "https://example.org/assets/v2/" : "https://example.org/deep/dir/";
      assert.ok(result.markdown.includes(`[Templates](${directory}guide/templates)`));
      assert.ok(result.markdown.includes(`![Diagram](${directory}img/a.png)`));
      assert.ok(result.markdown.includes("[Root](https://example.org/x)"));
      const fragment = conversionPath === "fallback" ? "#frag" : `${baseUrl || url}#frag`;
      assert.ok(result.markdown.includes(`[Fragment](${fragment})`));
      assert.ok(result.markdown.includes("Source: https://example.org/deep/dir/page.html"));
    });
  }

  test(`whole-page ${conversionPath} unwraps script links and keeps inline content`, async () => {
    const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
    const result = convertHtmlToMarkdown({ html, url }, { DOMParser, Readability });
    assert.equal(result.conversionPath, conversionPath);
    assert.ok(result.markdown.includes("\n\nKeep **bold** Line *Italic* Other\n\n"));
    assert.doesNotMatch(result.markdown, /(?:javascript|vbscript):/i);
  });
}
