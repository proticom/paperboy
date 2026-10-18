const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { DOMParser } = require("linkedom");
const MarkdownIt = require("markdown-it");
const Readability = require("../lib/readability.js");
const dependencies = { DOMParser, Readability };
const fixtures = path.join(__dirname, "fixtures/code-blocks");
const read = (name) => fs.readFileSync(path.join(fixtures, `${name}.html`), "utf8");
const fences = (markdown) => new MarkdownIt().parse(markdown, {}).filter((token) => token.type === "fence");

for (const fromPicker of [false, true]) {
  test(`live MDN ${fromPicker ? "picker" : "article"} projects nested slots and removes code headers`, async () => {
    const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
    let html = read("mdn-fetch-live");
    if (fromPicker) html = new DOMParser().parseFromString(html, "text/html").querySelector("mdn-code-example").outerHTML;
    const result = convertHtmlToMarkdown({ html, fromPicker, url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch" }, dependencies);
    const blocks = fences(result.markdown);
    assert.equal(blocks.length, fromPicker ? 1 : 2);
    assert.equal(blocks[0].info, "js");
    assert.match(blocks[0].content, /^async function getData\(\) \{\n  const url = "https:\/\/example.org\/products.json";\n/);
    const stray = result.markdown.split("\n").filter((line, index) => {
      if (blocks.some((token) => index >= token.map[0] && index < token.map[1])) return false;
      return /\bCopy\b|^\s*(?:js|javascript)\s*$/i.test(line)
        && blocks.some((token) => Math.abs(index - token.map[0]) <= 2 || Math.abs(index - (token.map[1] - 1)) <= 2);
    });
    assert.deepEqual(stray, []);
  });
}

test("slots project named and default children once and retain unfilled fallback", async () => {
  const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
  const html = '<x-example><template shadowrootmode="open"><p><slot name="title">Unused</slot></p><p><slot></slot></p><p><slot name="missing"><em>Fallback</em></slot></p><p><slot name="title">Second fallback</slot></p></template><b slot="title">Title</b><x-inner><template shadowrootmode="open"><slot></slot></template>Body</x-inner><span slot="unmatched">Invisible</span></x-example>';
  assert.equal(convertHtmlToMarkdown({ html, fromPicker: true }, dependencies).markdown,
    "# Selected region\n\n**Title**\n\nBody\n\n*Fallback*\n\nSecond fallback\n");
  const nested = '<x-outer><template shadowrootmode="open"><x-inner><template shadowrootmode="open"><p><slot>Fallback</slot></p></template>Inner</x-inner></template>Outer</x-outer>';
  assert.equal(convertHtmlToMarkdown({ html: nested, fromPicker: true }, dependencies).markdown,
    "# Selected region\n\nInner\n");
});

test("comments do not fill a default slot", async () => {
  const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
  const html = '<x-example><template shadowrootmode="open"><slot>Fallback</slot></template><!-- comment --></x-example>';
  assert.equal(convertHtmlToMarkdown({ html, fromPicker: true }, dependencies).markdown,
    "# Selected region\n\nFallback\n");
});

test("blog keeps its article and omits comment code and surrounding promotions", async () => {
  const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
  const result = convertHtmlToMarkdown({ html: read("blog-comment-pre"), url: "https://blog.example/post" }, dependencies);
  assert.equal(result.conversionPath, "readability");
  assert.deepEqual(fences(result.markdown).map((block) => block.content), ["echo hello\nls -la\n"]);
  // Readability already retained this newsletter paragraph before PR 17.
  assert.match(result.markdown, /Get our weekly newsletter\. Enter your email\./);
  assert.doesNotMatch(result.markdown, /Subscribe|Related posts|Advertise|Privacy policy|Cookie settings|alias ll=/i);
});

test("style, script, noscript and template text do not change the collapse ratio", async () => {
  const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
  const payload = { html: read("blog-comment-pre"), url: "https://blog.example/post" };
  const normal = convertHtmlToMarkdown(payload, dependencies);
  const invisible = ["style", "script", "noscript", "template"].map((tag) => `<${tag}>${"invisible ".repeat(2000)}</${tag}>`).join("");
  const result = convertHtmlToMarkdown({ ...payload, html: payload.html.replace("<body>", `<body>${invisible}`) }, dependencies);
  assert.equal(result.conversionPath, "readability");
  assert.equal(result.markdown, normal.markdown);
});

test("dropped code is restored in source order without promoting neighboring chrome", async () => {
  const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
  class DroppingReadability extends Readability {
    parse() {
      this._doc.querySelectorAll("[data-drop]").forEach((node) => node.remove());
      return super.parse();
    }
  }
  const html = '<html><head><title>Examples</title></head><body><main><article><h2>First</h2><p>The first paragraph explains the API with enough detail to keep this article in the extraction result.</p><pre data-drop>one();\n  next();</pre><div class="comments"><pre data-drop>comment();</pre></div><p>The next paragraph introduces a second example and describes how to run it in a program.</p><pre data-drop>two();\n  finish();</pre><p>The last paragraph completes the article and explains the results of the examples above.</p></article></main></body></html>';
  const result = convertHtmlToMarkdown({ html }, { DOMParser, Readability: DroppingReadability });
  assert.equal(result.conversionPath, "readability+reinserted 2");
  assert.deepEqual(fences(result.markdown).map((block) => block.content), ["one();\n  next();\n", "two();\n  finish();\n"]);
  assert.match(result.markdown, /next\(\);\n```\n\nThe next paragraph/);
  assert.doesNotMatch(result.markdown, /data-paperboy-anchor|comment\(\)/);
});

test("over-collapse fallback resolves links, images and srcset without changing special URLs", async () => {
  const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
  const documents = [];
  class InspectingParser extends DOMParser {
    parseFromString(...args) {
      const document = super.parseFromString(...args);
      documents.push(document);
      return document;
    }
  }
  const html = `<html><head><title>Links</title></head><body><nav role="navigation"><p>${"Navigation text ".repeat(1500)}</p></nav><main><p>Read the <a href="guide">guide</a> and inspect the example image. This paragraph contains the readable content of the page.</p><p><a href="#part">Part</a> <a href="mailto:test@example.invalid">Email</a> <a href="tel:123">Phone</a> <a href="data:text/plain,hello">Data</a></p><img alt="Diagram" src="/diagram.png" srcset="small.png 1x, /large.png 2x"><img alt="Data" src="data:image/png;base64,AAAA" srcset="data:image/png;base64,AAAA 1x, /other.png 2x"></main></body></html>`;
  const result = convertHtmlToMarkdown({ html, url: "https://example.org/docs/page" }, { DOMParser: InspectingParser, Readability });
  assert.equal(result.conversionPath, "fallback");
  assert.match(result.markdown, /\[guide\]\(https:\/\/example.org\/docs\/guide\)/);
  const output = documents.at(-1);
  assert.deepEqual([...output.querySelectorAll("a")].map((node) => node.getAttribute("href")),
    ["https://example.org/docs/guide", "#part", "mailto:test@example.invalid", "tel:123", "data:text/plain,hello"]);
  assert.deepEqual([...output.querySelectorAll("img")].map((node) => [node.getAttribute("src"), node.getAttribute("srcset")]), [
    ["https://example.org/diagram.png", "https://example.org/docs/small.png 1x, https://example.org/large.png 2x"],
    ["data:image/png;base64,AAAA", "data:image/png;base64,AAAA 1x, https://example.org/other.png 2x"],
  ]);
});

test("reinsertion keeps an article's bounds around unrelated sibling sections", async () => {
  const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
  class ArticleReadability extends Readability {
    parse() {
      const article = this._doc.querySelector("article");
      return { content: article.outerHTML, textContent: article.textContent, length: article.textContent.length };
    }
  }
  const html = '<html><body><main><section><h2>Other tools</h2><pre>unrelatedBefore();</pre></section><article><h1>Article</h1><p>The article describes this example.</p><pre>article();\n  next();</pre></article><section><h2>Other tools</h2><pre>unrelatedAfter();</pre></section></main></body></html>';
  const result = convertHtmlToMarkdown({ html }, { DOMParser, Readability: ArticleReadability });
  assert.equal(result.conversionPath, "readability");
  assert.deepEqual(fences(result.markdown).map((block) => block.content), ["article();\n  next();\n"]);
});

for (const container of ['<main class="comments-open">', '<div role="main" class="has-share-bar">']) {
  test(`reinsertion ignores page and article classes under ${container}`, async () => {
    const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
    class DroppingReadability extends Readability {
      parse() {
        assert.equal(this._doc.querySelector("pre").textContent, "restore();\n  next();");
        this._doc.querySelector("pre").remove();
        const article = this._doc.querySelector("article");
        return { content: article.outerHTML, textContent: article.textContent, length: article.textContent.length };
      }
    }
    const closing = container.startsWith("<main") ? "</main>" : "</div>";
    const html = `<html class="comments-open"><body class="site-nav-open"><div class="layout__2-sidebars-inline">${container}<article class="has-share-bar"><h2>Article</h2><p>Read this example.</p><div class="shared-content"><pre>restore();\n  next();</pre></div><p>The example ends here.</p></article>${closing}</div></body></html>`;
    const result = convertHtmlToMarkdown({ html }, { DOMParser, Readability: DroppingReadability });
    assert.equal(result.conversionPath, "readability+reinserted 1");
    assert.deepEqual(fences(result.markdown).map((block) => block.content), ["restore();\n  next();\n"]);
  });
}

test("only token-boundary exclusions gate missing code, without stripping Readability input", async () => {
  const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
  const excluded = ["comment-thread", "comments", "related-posts", "footer-links", "newsletter-signup", "promo-box", "share-tools", "sharing-tools", "subscribe-banner", "sidebar", "navbar"];
  class DroppingReadability extends Readability {
    parse() {
      assert.equal(this._doc.querySelectorAll("pre").length, excluded.length + 1);
      this._doc.querySelectorAll("pre").forEach((node) => node.remove());
      const article = this._doc.querySelector("article");
      return { content: article.outerHTML, textContent: article.textContent, length: article.textContent.length };
    }
  }
  const html = `<html><body><article><h2>Examples</h2><p>Read this example.</p>${excluded.map((name) => `<div class="${name}"><pre>excluded();</pre></div>`).join("")}<div id="shared-content"><pre>included();\n  next();</pre></div><p>The example ends here.</p></article></body></html>`;
  const result = convertHtmlToMarkdown({ html }, { DOMParser, Readability: DroppingReadability });
  assert.equal(result.conversionPath, "readability+reinserted 1");
  assert.deepEqual(fences(result.markdown).map((block) => block.content), ["included();\n  next();\n"]);
});
