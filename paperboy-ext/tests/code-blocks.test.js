const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { DOMParser } = require("linkedom");
const MarkdownIt = require("markdown-it");
const Readability = require("../lib/readability.js");

const fixtures = path.join(__dirname, "fixtures/code-blocks");
const dependencies = { DOMParser, Readability };
const cases = [
  {
    name: "mdn-fetch", count: 1, language: "js", selector: "mdn-code-example",
    code: 'const response = await fetch("https://example.org/post", {\n  method: "POST",\n  // …\n});\n',
  },
  {
    name: "react-learn", count: 1, language: "", selector: ".sandpack",
    code: "function MyButton() {\n  return (\n    <button>I'm a button</button>\n  );\n}\n",
  },
  {
    name: "stackoverflow-sorted", count: 2, language: "cpp", selector: "article",
    code: "#include <algorithm>\n#include <ctime>\n#include <iostream>\n\nint main()\n{\n    // Generate data\n    const unsigned arraySize = 32768;\n    int data[arraySize];\n",
  },
  {
    name: "bash-manual", count: 2, language: "", selector: "article",
    code: "if test-commands; then\n  consequent-commands;\n[elif more-test-commands; then\n  more-consequents;]\n[else alternate-consequents;]\nfi\n",
  },
];

for (const fixture of cases) {
  for (const fromPicker of [false, true]) {
    test(`${fixture.name}: ${fromPicker ? "picker" : "whole page"} preserves code`, async () => {
      const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
      let html = fs.readFileSync(path.join(fixtures, `${fixture.name}.html`), "utf8");
      if (fromPicker) html = new DOMParser().parseFromString(html, "text/html").querySelector(fixture.selector).outerHTML;
      const { markdown } = convertHtmlToMarkdown({ html, title: "Code examples", fromPicker }, dependencies);
      const fences = new MarkdownIt().parse(markdown, {}).filter((token) => token.type === "fence");
      assert.equal(fences.length, fixture.count);
      assert.equal(fences[0].content, fixture.code);
      assert.equal(fences[0].info, fixture.language);
      assert.equal(/^(Copy|Copied|Copy code|Copy to clipboard)$/mi.test(markdown), false);
      if (fixture.name === "bash-manual") assert.equal(markdown.includes("\\["), false);
      if (fixture.name === "stackoverflow-sorted") assert.match(markdown, /The word Copy in this paragraph is ordinary prose\./);
      if (fixture.name === "mdn-fetch" && !fromPicker) assert.match(markdown, /`fetch\(url\)`/);
    });
  }
}

test("whole-page extraction retains code in a header sibling of the article", async () => {
  const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
  const html = '<html><body><main><div class="layout__header"><h1>Examples</h1><pre>header();\n  next();</pre></div><article><h2>Details</h2><p>These examples describe how to call the API and handle the response. The header includes the first complete program. Read the code before trying the next example.</p><pre>article();\n  finish();</pre></article></main></body></html>';
  const { markdown } = convertHtmlToMarkdown({ html }, dependencies);
  const fences = new MarkdownIt().parse(markdown, {}).filter((token) => token.type === "fence");
  assert.deepEqual(fences.map((token) => token.content), ["header();\n  next();\n", "article();\n  finish();\n"]);
});

test("nested open templates flatten while closed templates stay private", async () => {
  const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
  const { markdown } = convertHtmlToMarkdown({ fromPicker: true, html: '<x-example><template shadowrootmode="open"><x-code><template shadowrootmode="open"><pre>open();\n  next();</pre></template></x-code><x-private><template shadowrootmode="closed"><pre>private();</pre></template></x-private></template></x-example>' }, dependencies);
  assert.equal(markdown, "# Selected region\n\n```\nopen();\n  next();\n```\n");
});

for (const [file, selector, lines] of [["mdn-fetch", "mdn-code-example", 4], ["react-learn", "pre", 5]]) {
  test(`measurement script runs the ${file} picker pipeline`, () => {
    const { execFileSync } = require("node:child_process");
    const output = execFileSync(process.execPath, [
      path.join(__dirname, "../scripts/measure-output.mjs"),
      path.join(fixtures, `${file}.html`), "https://example.org/", "--pick", selector,
    ], { encoding: "utf8" });
    const { outputLength, ...counts } = JSON.parse(output);
    assert.deepEqual(counts, { inputPreCount: 1, fencedBlockCount: 1, linesInsideFences: lines, copyLines: 0, collapsedBlocks: 0 });
  });
}
