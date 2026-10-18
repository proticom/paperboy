import { describe, expect, it } from "vitest";
import { DOMParser } from "linkedom";
import { createTurndownService, prepareCodeBlocks } from "../src/turndown.js";

const convert = (html: string) => createTurndownService().turndown(html);

describe("code blocks", () => {
  it("fences pre without code and leaves brackets and indentation literal", () => {
    expect(convert('<pre class="example-preformatted">[if test]\n  run_cmd *arg*\n</pre>'))
      .toBe("```\n[if test]\n  run_cmd *arg*\n```");
  });

  it.each([
    ['<pre class="language-js"><code>a\nb</code></pre>', "js"],
    ['<pre class="lang-cpp"><code>a\nb</code></pre>', "cpp"],
    ['<pre data-language="python">a\nb</pre>', "python"],
    ['<pre class="brush: js notranslate"><code>a\nb</code></pre>', "js"],
    ['<pre><code class="language-sh">a\nb</code></pre>', "sh"],
  ])("retains language hints in %s", (html, language) => {
    expect(convert(html)).toBe(`\`\`\`${language}\na\nb\n\`\`\``);
  });

  it.each([
    '<div>first</div><div>  second</div>',
    '<p>first</p><p>  second</p>',
    'first<br>  second',
    '<span class="line">first</span><span class="line">  second</span>',
    '<span class="token-line">first</span><span class="token-line">  second</span>',
    '<span style="display: block">first</span><span style="display:block">  second</span>',
    '<div class="cm-line">first<br></div><div class="cm-line">  second</div>',
  ])("preserves highlighter line boundaries in %s", (lines) => {
    expect(convert(`<pre><code>${lines}</code></pre>`)).toBe("```\nfirst\n  second\n```");
  });

  it.each([
    '<div>first();</div><div></div><div>last();</div>',
    '<span class="line">first();</span><span class="line"></span><span class="line">last();</span>',
  ])("keeps empty line wrappers in %s", (lines) => {
    expect(convert(`<pre><code>${lines}</code></pre>`)).toBe("```\nfirst();\n\nlast();\n```");
  });

  it("keeps blank lines and token spans within a line", () => {
    expect(convert('<pre><code><span>const</span> x = 1;\n\n  next();\n</code></pre>'))
      .toBe("```\nconst x = 1;\n\n  next();\n```");
  });

  it("retains text before and after code children in pre", () => {
    expect(convert('<pre>$ <code>run()</code>\noutput</pre>'))
      .toBe("```\n$ run()\noutput\n```");
  });

  it("uses a fence longer than every backtick run in the code", () => {
    expect(convert('<pre><code>const text = "````";\n```js\n</code></pre>'))
      .toBe('`````\nconst text = "````";\n```js\n`````');
  });

  it("omits empty and whitespace-only pre", () => {
    expect(convert("<pre></pre>")).toBe("");
    expect(convert("<div><pre></pre></div>")).toBe("");
    expect(convert("<pre> \n\t </pre>")).toBe("");
  });

  it("omits Stack Overflow's hidden empty editor pre", () => {
    expect(convert('<pre aria-hidden="true" class="s-textarea ws-pre-wrap break-word hmx3 lh-lg v-hidden overflow-hidden svelte-ttdarg"><br></pre>'))
      .toBe("");
  });

  it("keeps real code after blank lines in pre", () => {
    expect(convert('<pre><code><br><span>  run();</span><br></code></pre>'))
      .toBe("```\n\n  run();\n```");
  });

  it("removes copy controls inside and attached to code, plus live regions", () => {
    expect(convert('<div><div><button>Copy code</button><span aria-live="polite" hidden>Copied</span></div><pre><button>Copy</button><code>a\nb</code></pre><label>Copy to clipboard</label><button>cOpIeD</button></div>'))
      .toBe("```\na\nb\n```");
  });

  it("retains Copy prose, unrelated controls and code containing Copy", () => {
    expect(convert('<article><p>Copy the text.</p><button>Copy</button><p>Continue reading.</p><div><pre>Copy\nCopied</pre></div></article>'))
      .toBe("Copy the text.\n\nCopy\n\nContinue reading.\n\n```\nCopy\nCopied\n```");
  });

  it("retains Copy controls in a separate panel", () => {
    expect(convert('<div><div><button>Copy</button><p>Ordinary paragraph.</p></div><div><pre>x();</pre></div></div>'))
      .toBe("Copy\n\nOrdinary paragraph.\n\n```\nx();\n```");
  });

  it("removes controls immediately beside a code wrapper", () => {
    expect(convert('<div><button>Copy</button><div><pre>x();</pre></div></div>'))
      .toBe("```\nx();\n```");
  });

  it("preserves inline code, README fences, headings, images and tables", () => {
    expect(convert('<h2>Usage</h2><p>Call <code>run()</code>.</p><div class="highlight highlight-source-js"><pre><code class="language-js">run();\n  next();\n</code></pre></div><img src="logo.png" alt="Logo"><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>'))
      .toBe('## Usage\n\nCall `run()`.\n\n```js\nrun();\n  next();\n```\n\n![Logo](logo.png)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
  });

  it("normalizes before article extraction and can run twice", () => {
    const document = new DOMParser().parseFromString('<html><body><div><button>Copy</button><pre class="brush: js"><code><div class="cm-line">a<br></div><div class="cm-line">  b</div></code></pre></div></body></html>', "text/html");
    prepareCodeBlocks(document);
    expect(document.body.innerHTML).toBe('<div><pre data-language="js" class="brush: js">a\n  b\n</pre></div>');
    const first = document.body.innerHTML;
    prepareCodeBlocks(document);
    expect(document.body.innerHTML).toBe(first);
  });
});
