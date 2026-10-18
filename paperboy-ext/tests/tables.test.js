const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { parseHTML } = require("linkedom");
const MarkdownIt = require("markdown-it");

const background = fs.readFileSync(path.join(__dirname, "../background.js"), "utf8");
const injected = background.slice(background.indexOf("function startPickerInPage()"), background.indexOf("// Translate Chrome"));

function pick({ target, clickTarget = target, tab = false, toggle = false, html, expectedSelector = "table" }) {
  const { window, document } = parseHTML(html || '<html><body><main><p>Outside</p><table><caption>Caption</caption><colgroup><col></colgroup><thead><tr><th>Header</th></tr></thead><tbody><tr><td><span>Value</span></td></tr></tbody><tfoot><tr><td>Footer</td></tr></tfoot></table></main></body></html>');
  const messages = [];
  window.Element.prototype.getBoundingClientRect = function() {
    return { top: 10, left: 10, width: this.localName === "span" ? 30 : 500, height: this.localName === "span" ? 20 : 300 };
  };
  document.elementFromPoint = () => document.querySelector(target);
  const context = vm.createContext({ document, Node: window.Node,
    window: { location: { href: "https://example.org/" }, innerWidth: 1000, innerHeight: 800,
      getComputedStyle: () => ({ overflowY: "visible", overflowX: "visible" }),
      addEventListener() {}, removeEventListener() {},
    },
    chrome: { runtime: { sendMessage: (message) => messages.push(message) } },
  });
  vm.runInContext(injected, context);
  context.startPickerInPage();
  document.dispatchEvent(new window.Event("mousemove"));
  const hover = document.querySelectorAll("div")[1].textContent;
  if (tab) {
    const event = new window.Event("keydown", { cancelable: true });
    event.key = "Tab";
    document.dispatchEvent(event);
  }
  for (let i = 0; i < (toggle ? 2 : 1); i++) {
    document.querySelector(clickTarget).dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
  }
  const enter = new window.Event("keydown", { cancelable: true });
  enter.key = "Enter";
  document.dispatchEvent(enter);
  return { hover, messages, table: document.querySelector("table").outerHTML, main: document.querySelector("main").outerHTML, expectedHtml: document.querySelector(expectedSelector).outerHTML };
}

for (const target of ["tbody", "tr", "td", "span", "thead", "th", "tfoot", "caption", "colgroup", "col", "table"]) {
  test(`picker snaps ${target} to its enclosing table`, () => {
    const { hover, messages, table } = pick({ target });
    assert.equal(hover, "table");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].data.html, table);
    assert.equal(messages[0].data.regionCount, 1);
  });
}

test("picker leaves a target outside tables unchanged", () => {
  const { hover, messages } = pick({ target: "p" });
  assert.equal(hover, "p");
  assert.equal(messages[0].data.html, "<p>Outside</p>");
});

test("a containing frame stays selected when the target is outside its table", () => {
  const { hover, messages, main } = pick({ target: "main" });
  assert.equal(hover, "main");
  assert.equal(messages[0].data.html, main);
});

test("a click in a table supersedes a stale outside hover", () => {
  const { messages, table } = pick({ target: "main", clickTarget: "span" });
  assert.equal(messages[0].data.html, table);
});

test("Tab still expands a table to the enclosing frame", () => {
  const { messages, main } = pick({ target: "td", tab: true });
  assert.equal(messages[0].data.html, main);
});

for (const clickTarget of ["article", "span"]) {
  test(`an article inside a layout table wins on hover and ${clickTarget} click`, () => {
    const { hover, messages, expectedHtml } = pick({ target: "article", clickTarget, expectedSelector: "article",
      html: '<html><body><main><table><tbody><tr><td><article><span>Article text</span></article></td></tr></tbody></table></main></body></html>',
    });
    assert.equal(hover, "article");
    assert.equal(messages[0].data.html, expectedHtml);
  });
}

test("a data table inside an article wins over the article", () => {
  const { hover, messages, expectedHtml } = pick({ target: "span",
    html: '<html><body><main><article><table><tbody><tr><td><span>Data</span></td></tr></tbody></table></article></main></body></html>',
  });
  assert.equal(hover, "table");
  assert.equal(messages[0].data.html, expectedHtml);
});

for (const article of [false, true]) {
  test(`Tab expands a nested table to the outer ${article ? "article" : "table"}`, () => {
    const frame = article ? "<article>" : "";
    const { hover, messages, expectedHtml } = pick({ target: "#inner td", tab: true, expectedSelector: article ? "article" : "#outer",
      html: `<html><body><main><table id="outer"><tbody><tr><td>${frame}<table id="inner"><tbody><tr><td>Data</td></tr></tbody></table>${article ? "</article>" : ""}</td></tr></tbody></table></main></body></html>`,
    });
    assert.equal(hover, "table#inner");
    assert.equal(messages[0].data.html, expectedHtml);
  });
}

test("clicking a snapped table twice still toggles it off", () => {
  assert.deepEqual(pick({ target: "td", toggle: true }).messages, []);
});

const sidepanel = fs.readFileSync(path.join(__dirname, "../sidepanel.js"), "utf8");
const conversion = sidepanel.slice(sidepanel.indexOf("function convertHtmlToMarkdown(payload)"), sidepanel.indexOf("function renderMarkdown("));

async function convertPickedHtml(html) {
  const { createTurndownService, wrapTableFragment } = await import("@proticom/paperboy-converter/turndown");
  const context = vm.createContext({ turndownService: createTurndownService(), wrapTableFragment });
  vm.runInContext(conversion, context);
  return context.convertHtmlToMarkdown({ fromPicker: true, html }).markdown;
}

for (const [name, rows, columns] of [["wikipedia-tallest", 7, 11], ["github-playwright", 6, 4]]) {
  for (const selector of ["tbody", "table", "td"]) {
    test(`${name}: picker converts ${selector} to one aligned table`, async () => {
      const { document } = parseHTML(fs.readFileSync(path.join(__dirname, "fixtures/tables", `${name}.html`), "utf8"));
      const markdown = await convertPickedHtml(document.querySelector(selector).outerHTML);
      const tokens = new MarkdownIt().parse(markdown, {});
      assert.equal(tokens.filter((token) => token.type === "table_open").length, 1);
      const expectedRows = selector === "td" ? 1 : selector === "tbody" ? 5 : rows;
      const expectedColumns = selector === "td" ? 1 : columns;
      assert.equal(tokens.filter((token) => token.type === "tr_open").length, expectedRows);
      const lines = markdown.split("\n").filter((line) => line.startsWith("|"));
      assert.deepEqual(lines.map((line) => line.split(/(?<!\\)\|/).length - 2), Array(expectedRows + 1).fill(expectedColumns));
      if (name === "wikipedia-tallest" && selector !== "td") {
        if (selector === "table") {
          assert.equal(lines[2], "|  |  | m | ft |  |  |  |  |  |  |  |");
          const height = tokens.find((token) => token.type === "inline" && token.content.startsWith("Height"));
          assert.equal(height.children.filter((token) => token.type === "text").map((token) => token.content).join(""), "Height [14] [15]");
        }
        assert.match(lines[selector === "table" ? 3 : 0], /^\| 1 \| .*\[Burj Khalifa\].* \| 828 \| 2,717 \| 163/);
      } else if (name === "github-playwright" && selector !== "td") {
        if (selector === "table") assert.equal(lines[0], "| Name | Name | Last commit message | Last commit date |");
        assert.equal(lines[selector === "table" ? 2 : 0], "| [.azure-pipelines](/microsoft/playwright/tree/main/.azure-pipelines) | [.azure-pipelines](/microsoft/playwright/tree/main/.azure-pipelines) | Update docs | Sep 3, 2026 |");
      }
    });
  }
}

for (const html of ["<tr><td>A</td><td>B</td></tr>", "<td>A</td><td>B</td>", "<th>A</th><th>B</th>", "<!-- region --><tbody><tr><td>A</td><td>B</td></tr></tbody>"]) {
  test(`picker converts orphan ${html.slice(1, 3)} cells`, async () => {
    assert.equal(await convertPickedHtml(html), "# Selected region\n\n| A | B |\n| --- | --- |\n");
  });
}
