const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { parseHTML, DOMParser } = require("linkedom");
const Readability = require("../lib/readability.js");

const background = fs.readFileSync(path.join(__dirname, "../background.js"), "utf8");
const start = background.indexOf("function startPickerInPage()");
assert.notEqual(start, -1);
let depth = 0;
let end = -1;
for (let i = background.indexOf("{", start); i < background.length; i++) {
  if (background[i] === "{") depth++;
  if (background[i] === "}" && --depth === 0) {
    end = i + 1;
    break;
  }
}
assert.notEqual(end, -1);
const pickerSource = background.slice(start, end);
const fixture = fs.readFileSync(path.join(__dirname, "fixtures/nested-picks/article.html"), "utf8");

function picker(html = fixture) {
  const { window, document } = parseHTML(html);
  window.Element.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, width: 100, height: 20 });
  let target;
  document.elementFromPoint = () => target;
  const messages = [];
  const context = vm.createContext({
    document,
    // linkedom omits these browser Node constants.
    Node: { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 },
    window: {
      location: { href: "https://example.org/article" },
      innerWidth: 1000,
      innerHeight: 800,
      getComputedStyle: () => ({}),
      addEventListener() {},
      removeEventListener() {},
    },
    chrome: { runtime: { sendMessage: (message) => messages.push(message) } },
  });
  vm.runInContext(pickerSource, context);
  context.startPickerInPage();
  const badge = document.querySelector("button");
  return {
    document,
    messages,
    badge,
    installSerializer() {
      vm.runInContext(background.slice(background.indexOf("function installPaperboySerializerInPage()"), background.indexOf("async function capturePageInPage()")), context);
      context.installPaperboySerializerInPage();
    },
    hover(selector) {
      target = document.querySelector(selector);
      assert.notEqual(target, null, selector);
      document.dispatchEvent(new window.Event("mousemove"));
    },
    click() {
      target.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
    },
    key(key) {
      const event = new window.Event("keydown", { cancelable: true });
      event.key = key;
      document.dispatchEvent(event);
    },
    overlays() {
      return [...document.documentElement.children].filter((el) => el.style.zIndex === "2147483645");
    },
  };
}

function output(session, regionIds, paragraphCount) {
  session.key("Enter");
  assert.equal(session.messages.length, 1);
  const message = session.messages[0];
  assert.equal(message.type, "paperboy:region-picked");
  assert.equal(message.data.regionCount, regionIds.length);
  const { document } = parseHTML(`<html><body>${message.data.html}</body></html>`);
  assert.deepEqual([...document.body.children].map((el) => el.id), regionIds);
  const paragraphs = [...document.querySelectorAll("p")].map((el) => el.textContent.trim());
  assert.equal(paragraphs.length, paragraphCount);
  assert.equal(new Set(paragraphs).size, paragraphCount, "no repeated paragraphs");
  assert.equal(session.overlays().length, 0);
}

test("child then Tab-parent click sends only the parent", () => {
  const session = picker();
  session.hover("#child > p");
  session.click();
  session.key("Tab");
  session.click();
  assert.equal(session.overlays().length, 1);
  assert.equal(session.badge.textContent, "Done · 1 region (Enter)");
  output(session, ["parent"], 64);
});

test("parent then child click leaves the parent and badge unchanged", () => {
  const session = picker();
  session.hover("#child > p");
  session.key("Tab");
  session.click();
  const overlay = session.overlays()[0];
  session.hover("#child > p");
  session.click();
  assert.equal(session.overlays().length, 1);
  assert.equal(session.overlays()[0], overlay);
  assert.equal(session.badge.textContent, "Done · 1 region (Enter)");
  output(session, ["parent"], 64);
});

for (const order of [
  ["grandchild", "child", "parent"],
  ["grandchild", "parent", "child"],
  ["child", "grandchild", "parent"],
  ["child", "parent", "grandchild"],
  ["parent", "grandchild", "child"],
  ["parent", "child", "grandchild"],
]) {
  test(`nested picks ${order.join(" then ")} send one parent`, () => {
    const session = picker();
    for (const id of order) {
      session.hover(`#${id} > p`);
      session.click();
    }
    assert.equal(session.overlays().length, 1);
    output(session, ["parent"], 64);
  });
}

test("disjoint siblings send two regions in DOM order despite reverse selection", () => {
  const session = picker();
  for (const id of ["sibling", "child"]) {
    session.hover(`#${id} > p`);
    session.click();
  }
  output(session, ["child", "sibling"], 56);
});

test("parent absorbs children then toggles off with zero regions or stale overlays", () => {
  const session = picker();
  for (const id of ["child", "sibling", "parent"]) {
    session.hover(`#${id} > p`);
    session.click();
  }
  session.click();
  session.key("Enter");
  assert.equal(session.messages.length, 0, "zero regions sends no capture");
  assert.equal(session.badge.style.display, "none");
  assert.equal(session.overlays().length, 0);
  session.key("Escape");
  assert.equal(session.messages[0].type, "paperboy:picker-cancelled");
});

test("finalize drops nesting created by page reparenting after disjoint picks", () => {
  const session = picker();
  for (const id of ["child", "sibling"]) {
    session.hover(`#${id} > p`);
    session.click();
  }
  assert.equal(session.overlays().length, 2);
  session.document.querySelector("#child").appendChild(session.document.querySelector("#sibling"));
  output(session, ["child"], 56);
});

test("clicking a second paragraph in the same frame still toggles it off", () => {
  const session = picker();
  session.hover("#child-1");
  session.click();
  session.hover("#child-2");
  session.click();
  session.key("Enter");
  assert.equal(session.messages.length, 0);
  assert.equal(session.badge.style.display, "none");
  assert.equal(session.overlays().length, 0);
});

for (const parentFirst of [false, true]) {
  test(`layout cell and article picks keep one region (${parentFirst ? "parent first" : "child first"})`, () => {
    const session = picker('<html><body><main><table role="presentation"><tr><td><article id="child"><p>Child prose.</p></article></td></tr></table></main></body></html>');
    session.hover("#child > p");
    if (parentFirst) session.key("Tab");
    session.click();
    if (parentFirst) session.hover("#child > p");
    else session.key("Tab");
    session.click();
    assert.equal(session.overlays().length, 1);
    assert.equal(session.badge.textContent, "Done · 1 region (Enter)");
    session.key("Enter");
    assert.equal(session.messages.length, 1);
    assert.equal(session.messages[0].data.regionCount, 1);
    assert.equal(session.messages[0].data.html, '<div><article id="child"><p>Child prose.</p></article></div>');
  });
}

test("layout cell serialization keeps shadow prose, code and the document base", async () => {
  const session = picker('<html><head><title>Layout</title></head><body><table role="presentation"><tr><td><p id="lead">Lead <a href="guide">Guide</a></p><x-layout></x-layout></td></tr></table></body></html>');
  Object.defineProperty(session.document, "baseURI", { value: "https://example.org/assets/" });
  const shadow = session.document.querySelector("x-layout").attachShadow({ mode: "open" });
  Object.defineProperty(shadow, "mode", { value: "open" });
  shadow.innerHTML = '<p>Shadow prose.</p><pre class="language-js">first();\n  second();</pre>';
  session.installSerializer();
  session.hover("#lead");
  session.click();
  session.key("Enter");
  assert.equal(session.messages.length, 1);
  const payload = session.messages[0].data;
  assert.equal(payload.regionCount, 1);
  assert.equal(payload.baseUrl, "https://example.org/assets/");
  assert.equal(payload.html, '<div><p id="lead">Lead <a href="guide">Guide</a></p><x-layout><template shadowrootmode="open"><p>Shadow prose.</p><pre class="language-js">first();\n  second();</pre></template></x-layout></div>');
  const { convertHtmlToMarkdown } = await import("../lib/convert.mjs");
  assert.equal(convertHtmlToMarkdown({ ...payload, fromPicker: true }, { DOMParser, Readability }).markdown,
    "# Layout\n\nSource: https://example.org/article\n\nLead [Guide](https://example.org/assets/guide)\n\nShadow prose.\n\n```js\nfirst();\n  second();\n```\n");
});
