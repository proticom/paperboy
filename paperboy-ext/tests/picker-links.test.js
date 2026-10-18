const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { createRequire } = require("node:module");

const converterRequire = createRequire(require.resolve("@proticom/paperboy-converter/package.json"));
const { parseHTML } = converterRequire("linkedom");
const source = fs.readFileSync(path.join(__dirname, "../sidepanel.js"), "utf8");
const conversion = source.slice(source.indexOf("function convertHtmlToMarkdown("),
  source.indexOf("\nfunction renderMarkdown("));
const baseUrl = "https://example.org/articles/current";

async function pick(html, url = baseUrl) {
  const { absolutizeUrls } = await import("@proticom/paperboy-converter/helpers");
  const { createTurndownService } = await import("@proticom/paperboy-converter/turndown");
  const { document } = parseHTML("");
  const templates = [];
  const payload = { html, url, fromPicker: true, title: "Picked" };
  const result = vm.runInNewContext(`${conversion}\nconvertHtmlToMarkdown(payload)`, {
    payload, absolutizeUrls, turndownService: createTurndownService(),
    document: { createElement(tag) {
      assert.equal(tag, "template");
      const template = document.createElement(tag);
      templates.push(template);
      return {
        set innerHTML(value) { template.innerHTML = value; },
        get innerHTML() {
          // Linkedom does not serialize content mutations through template.innerHTML.
          const wrapper = document.createElement("div");
          wrapper.append(template.content.cloneNode(true));
          return wrapper.innerHTML;
        },
        get content() { return template.content; },
      };
    } },
  });
  assert.equal(payload.html, html);
  return { result, templates };
}

test("picker source imports the helper and calls it before the existing turndown line", () => {
  assert.match(source, /import \{ absolutizeUrls \} from "@proticom\/paperboy-converter\/helpers";/);
  const branch = conversion.slice(0, conversion.indexOf("\n  // Readability mutates"));
  assert.match(branch, /absolutizeUrls\(template\.content, payload\.url\);[\s\S]*const markdownBody = turndownService\.turndown\(payload\.html \?\? ""\)\.trim\(\);/);
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

test("picker without a URL skips the template and retains relative links", async () => {
  const { result, templates } = await pick('<a href="/guide">Guide</a>', "");

  assert.equal(result.markdown, "# Picked\n\n[Guide](/guide)\n");
  assert.equal(templates.length, 0);
});
