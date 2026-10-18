const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { createRequire } = require("node:module");

const converterRequire = createRequire(require.resolve("@proticom/paperboy-converter/package.json"));
const { parseHTML, DOMParser } = converterRequire("linkedom");
const source = fs.readFileSync(path.join(__dirname, "../lib/convert.mjs"), "utf8");
const baseUrl = "https://example.org/articles/current";

async function pick(html, url = baseUrl, pickedBaseUrl) {
  const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
  const templates = [];
  class RecordingDOMParser extends DOMParser {
    parseFromString(...args) {
      const document = super.parseFromString(...args);
      const createElement = document.createElement.bind(document);
      document.createElement = (tag) => {
        const element = createElement(tag);
        if (tag === "template") templates.push(element);
        return element;
      };
      return document;
    }
  }
  const payload = { html, url, baseUrl: pickedBaseUrl, fromPicker: true, title: "Picked" };
  const result = convertHtmlToMarkdown(payload, { DOMParser: RecordingDOMParser, Readability: function () {} });
  assert.equal(payload.html, html);
  return { result, templates };
}

test("picker source imports the helper and calls it before the existing turndown line", () => {
  assert.match(source, /import \{ absolutizeUrls as absolutizePickedUrls, unwrapScriptLinks \} from "@proticom\/paperboy-converter\/helpers";/);
  const branch = source.slice(source.indexOf("if (payload.fromPicker)"), source.indexOf("\n  // Readability mutates"));
  assert.match(branch, /unwrapScriptLinks\(template\.content\);[\s\S]*absolutizePickedUrls\(template\.content, payload\.baseUrl \|\| payload\.url\);[\s\S]*turndownService\.turndown\(/);
});

test("picker resolves synthetic article links and images while preserving local links", async () => {
  const html = fs.readFileSync(path.join(__dirname, "fixtures/links/picked-article.html"), "utf8");
  const { result, templates } = await pick(html);

  assert.equal(result.markdown, "# Picked\n\nSource: https://example.org/articles/current\n\n[Guide](https://example.org/guide?mode=1#start) [Next](https://example.org/next) [Manual](https://cdn.example.org/manual)\n\n![Diagram](https://example.org/articles/images/diagram.png)\n\n![Chart](https://cdn.example.org/chart.png)\n\n[Details](#details) [Email](mailto:reader@example.org)\n");
  assert.equal(templates.length, 1);
  assert.equal(templates[0].content.querySelector("img").getAttribute("srcset"),
    "https://example.org/images/small.png 1x, https://cdn.example.org/large.png 2x");
});

test("picker template round-trip preserves orphan table cells and resolves their links", async () => {
  const { result, templates } = await pick('<tr><td><a href="/cell">Cell</a></td><td>Two</td></tr>');

  assert.deepEqual(Array.from(templates[0].content.querySelectorAll("td"), (cell) => cell.textContent),
    ["Cell", "Two"]);
  assert.equal(result.markdown, "# Picked\n\nSource: https://example.org/articles/current\n\n[Cell](https://example.org/cell)Two\n");
});

test("picker without a URL processes the template and retains relative links", async () => {
  const { result, templates } = await pick('<a href="/guide">Guide</a>', "");

  assert.equal(result.markdown, "# Picked\n\n[Guide](/guide)\n");
  assert.equal(templates.length, 1);
});

test("picker resolves fixture URLs against the document base and keeps the page Source", async () => {
  const fixture = fs.readFileSync(path.join(__dirname, "fixtures/links/base-tag.html"), "utf8");
  const { document } = parseHTML(fixture);
  const { result } = await pick(document.querySelector("article").outerHTML,
    "https://example.org/deep/dir/page.html", document.querySelector("base").getAttribute("href"));

  assert.equal(result.markdown, "# Picked\n\nSource: https://example.org/deep/dir/page.html\n\n[Templates](https://example.org/assets/v2/guide/templates) [Root](https://example.org/x) [Fragment](#frag)\n\n![Diagram](https://example.org/assets/v2/img/a.png)\n");
});

test("picker respects a root base URL on a nested guide page", async () => {
  const { result } = await pick('<a href="guide/templates">Templates</a>',
    "https://example.org/guide/components", "https://example.org/");

  assert.equal(result.markdown, "# Picked\n\nSource: https://example.org/guide/components\n\n[Templates](https://example.org/guide/templates)\n");
});

test("picker finalize sends document.baseURI separately from the page URL", () => {
  const background = fs.readFileSync(path.join(__dirname, "../background.js"), "utf8");
  const finalize = background.slice(background.indexOf("  function finalize() {"),
    background.indexOf("\n  function onClick(event) {"));
  const messages = [];
  vm.runInNewContext(`${finalize}\nfinalize()`, {
    pickedElements: [{ outerHTML: '<article><a href="guide/templates">Templates</a></article>' }],
    teardown() {},
    chrome: { runtime: { sendMessage(message) { messages.push(message); } } },
    document: { title: "Picked", baseURI: "https://example.org/assets/v2/", documentElement: { lang: "en" } },
    window: { location: { href: "https://example.org/deep/dir/page.html" } },
    PICKED: "paperboy:region-picked",
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "paperboy:region-picked");
  assert.equal(messages[0].data.baseUrl, "https://example.org/assets/v2/");
  assert.equal(messages[0].data.url, "https://example.org/deep/dir/page.html");
  assert.equal(messages[0].data.html, '<article><a href="guide/templates">Templates</a></article>');
});

for (const url of [baseUrl, ""]) {
  test(`picker unwraps script links and keeps inline content with URL ${JSON.stringify(url)}`, async () => {
    const html = '<p><a href=" JaVa\tScript:alert(1)">Keep <strong>bold</strong></a> <a href="java\nscript:x">Line</a> <a href="VBScript:x"><em>Italic</em></a></p>';
    const { result } = await pick(html, url);

    assert.equal(result.markdown, `# Picked\n\n${url ? `Source: ${url}\n\n` : ""}Keep **bold** Line *Italic*\n`);
  });
}
