const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const markdownit = require("markdown-it");
const { parseHTML, DOMParser } = require(require.resolve("linkedom", {
  paths: [path.dirname(require.resolve("@proticom/paperboy-converter/package.json"))],
}));

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const remoteMarkdown = [
  '![a & " <b>](https://example.org/a.png?x=1&y=2)',
  "![relative](//example.org/b.png)",
  '<img src="https://example.org/raw.png" srcset="https://example.org/large.png 2x">',
].join("\n\n");

async function setup(overrides = {}) {
  const { createPreviewController } = await import("../lib/preview.mjs");
  const { document } = parseHTML('<html><body><button hidden disabled></button><article hidden></article></body></html>');
  const container = document.querySelector("article");
  const loadButton = document.querySelector("button");
  const calls = [];
  const created = [];
  const revoked = [];
  const md = markdownit({ html: false, linkify: true, typographer: true });
  const controller = createPreviewController({
    container,
    loadButton,
    md,
    fetch: async (url, options) => {
      calls.push([url, options]);
      return { ok: true, blob: async () => new Blob(["image"], { type: "image/png" }) };
    },
    createObjectURL: (blob) => {
      created.push(blob);
      return `blob:https://example.org/${created.length}`;
    },
    revokeObjectURL: (url) => revoked.push(url),
    ...overrides,
  });
  return { controller, container, loadButton, calls, created, revoked, md };
}

function assertOnlyLocalImages(container) {
  assert.equal(container.querySelectorAll("[srcset]").length, 0);
  for (const image of container.querySelectorAll("img")) {
    assert.match(image.getAttribute("src"), /^(?:data|blob):/i);
  }
}

test("closed preview stores the latest markdown without rendering or fetching", async () => {
  const { controller, container, loadButton, calls, md } = await setup();
  let renders = 0;
  const render = md.render.bind(md);
  md.render = (...args) => { renders += 1; return render(...args); };
  controller.setMarkdown(remoteMarkdown);
  assert.equal(container.innerHTML, "");
  assert.equal(container.querySelectorAll("img, [srcset]").length, 0);
  assert.equal(renders, 0);
  assert.deepEqual(calls, []);
  assert.equal(loadButton.hidden, true);
  assert.equal(loadButton.disabled, true);
  controller.setMarkdown("# Latest");
  controller.show();
  assert.equal(container.innerHTML, "<h1>Latest</h1>\n");
  assert.equal(renders, 1);
});

test("open preview escapes placeholders and renders only data and blob images", async () => {
  const { controller, container, loadButton, calls } = await setup();
  controller.setMarkdown(`${remoteMarkdown}\n\n![](https://example.org/empty.png)\n\n![inline](data:image/png;base64,AA==)\n\n![local](blob:https://example.org/local)`);
  controller.show();
  assertOnlyLocalImages(container);
  assert.deepEqual([...container.querySelectorAll("img")].map((img) => img.getAttribute("src")), [
    "data:image/png;base64,AA==", "blob:https://example.org/local",
  ]);
  const placeholders = [...container.querySelectorAll("[data-image-url]")];
  assert.equal(placeholders.length, 3);
  assert.equal(placeholders[0].dataset.imageAlt, 'a & " <b>');
  assert.equal(placeholders[0].textContent, 'a & " <b> https://example.org/a.png?x=1&y=2');
  assert.equal(placeholders[0].querySelector("a").getAttribute("href"), "https://example.org/a.png?x=1&y=2");
  assert.equal(placeholders[0].querySelector("b"), null);
  assert.equal(placeholders[2].textContent, "image https://example.org/empty.png");
  assert.equal(container.textContent.includes("srcset="), true);
  assert.deepEqual(calls, []);
  assert.equal(loadButton.hidden, false);
  assert.equal(loadButton.disabled, false);
});

test("visible updates render immediately; hidden updates wait for show", async () => {
  const { controller, container, loadButton } = await setup();
  controller.show();
  controller.setMarkdown("![first](https://example.org/first.png)");
  assert.equal(container.querySelector("[data-image-url]").dataset.imageAlt, "first");
  controller.hide();
  assert.equal(container.hidden, true);
  assert.equal(loadButton.hidden, true);
  assert.equal(loadButton.disabled, true);
  controller.setMarkdown("![next](https://example.org/next.png)");
  assert.equal(container.innerHTML, "");
  controller.show();
  assert.equal(container.hidden, false);
  assert.equal(container.querySelector("[data-image-url]").dataset.imageAlt, "next");
});

test("Load images is hidden for text and inline images", async () => {
  const { controller, container, loadButton } = await setup();
  controller.show();
  controller.setMarkdown("Hello\n\n![inline](data:image/png;base64,AA==)");
  assert.equal(container.querySelector("img").getAttribute("alt"), "inline");
  assert.equal(loadButton.hidden, true);
  assert.equal(loadButton.disabled, true);
});

test("Load images fetches HTTP(S) without credentials and inserts only blob URLs", async () => {
  const { controller, container, loadButton, calls, created } = await setup();
  controller.show();
  controller.setMarkdown("![secure](https://example.org/a.png)\n\n![relative](//example.org/b.png)\n\n![plain](http://example.org/c.png)");
  await controller.loadImages();
  assert.deepEqual(calls, [
    ["https://example.org/a.png", { credentials: "omit" }],
    ["https://example.org/b.png", { credentials: "omit" }],
    ["http://example.org/c.png", { credentials: "omit" }],
  ]);
  assert.equal(created.length, 3);
  assert.equal(created.every((blob) => blob instanceof Blob), true);
  assert.deepEqual([...container.querySelectorAll("img")].map((img) => [img.getAttribute("src"), img.getAttribute("alt")]), [
    ["blob:https://example.org/1", "secure"],
    ["blob:https://example.org/2", "relative"],
    ["blob:https://example.org/3", "plain"],
  ]);
  assertOnlyLocalImages(container);
  assert.equal(container.querySelectorAll("[data-image-url]").length, 0);
  assert.equal(loadButton.hidden, true);
  assert.equal(loadButton.disabled, true);
  controller.hide();
  controller.show();
  assert.equal(container.querySelectorAll("img").length, 3);
});

test("failed fetches stay as marked placeholders; other schemes are never fetched", async () => {
  const calls = [];
  const { controller, container, loadButton } = await setup({ fetch: async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith("throw.png")) throw new Error("offline");
    return { ok: false, status: 404 };
  } });
  controller.show();
  controller.setMarkdown("![offline](https://example.org/throw.png)\n\n![missing](https://example.org/404.png)\n\n![ftp](ftp://example.org/a.png)\n\n![relative](/a.png)\n\n![unsafe](javascript:alert%281%29)");
  await controller.loadImages();
  assert.deepEqual(calls, [
    ["https://example.org/throw.png", { credentials: "omit" }],
    ["https://example.org/404.png", { credentials: "omit" }],
  ]);
  assert.equal(container.querySelectorAll('[data-image-state="failed"]').length, 4);
  assert.equal(container.querySelectorAll("img").length, 0);
  assert.equal(loadButton.hidden, false);
  assert.equal(loadButton.disabled, false);
});

test("the button loads images and concurrent requests do not duplicate fetches", async () => {
  let finish;
  let fetches = 0;
  const { controller, container, loadButton } = await setup({ fetch: () => {
    fetches += 1;
    return new Promise((resolve) => { finish = resolve; });
  } });
  controller.setMarkdown("![test](https://example.org/test.png)");
  await controller.loadImages();
  assert.equal(fetches, 0);
  controller.show();
  loadButton.click();
  assert.equal(loadButton.disabled, true);
  await controller.loadImages();
  assert.equal(fetches, 1);
  finish({ ok: true, blob: async () => new Blob(["image"]) });
  await new Promise(setImmediate);
  assert.equal(container.querySelector("img").getAttribute("src"), "blob:https://example.org/1");
  assert.equal(loadButton.hidden, true);
});

test("new conversions and repeated reset revoke owned blob URLs and defer again", async () => {
  const { controller, container, loadButton, calls, revoked } = await setup();
  controller.show();
  controller.setMarkdown("![old](https://example.org/old.png)");
  await controller.loadImages();
  controller.setMarkdown("![new](https://example.org/new.png)");
  assert.deepEqual(revoked, ["blob:https://example.org/1"]);
  assert.equal(container.querySelectorAll("img").length, 0);
  assert.equal(container.querySelector("[data-image-url]").dataset.imageAlt, "new");
  assert.equal(calls.length, 1);
  assert.equal(loadButton.hidden, false);
  await controller.loadImages();
  controller.reset();
  controller.reset();
  assert.deepEqual(revoked, ["blob:https://example.org/1", "blob:https://example.org/2"]);
  assert.equal(container.innerHTML, "");
  assert.equal(loadButton.hidden, true);
  assert.equal(loadButton.disabled, true);
});

for (const boundary of ["response", "blob"]) {
  test(`reset during pending ${boundary} prevents stale images and blob URL leaks`, async () => {
    let finish;
    const pending = new Promise((resolve) => { finish = resolve; });
    const { controller, container, loadButton, created, revoked } = await setup({
      fetch: async () => boundary === "response" ? pending : { ok: true, blob: () => pending },
    });
    controller.show();
    controller.setMarkdown("![old](https://example.org/old.png)");
    const loading = controller.loadImages();
    await Promise.resolve();
    controller.setMarkdown("![new](https://example.org/new.png)");
    finish(boundary === "response" ? { ok: true, blob: async () => new Blob(["old"]) } : new Blob(["old"]));
    await loading;
    assert.deepEqual(created, []);
    assert.deepEqual(revoked, []);
    assert.equal(container.querySelectorAll("img").length, 0);
    assert.equal(container.querySelector("[data-image-url]").dataset.imageAlt, "new");
    assert.equal(loadButton.hidden, false);
    assert.equal(loadButton.disabled, false);
  });
}

test("manifest adds only the image CSP directive and keeps permissions unchanged", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.content_security_policy.extension_pages,
    "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' data: blob:;");
  assert.deepEqual(manifest.permissions, ["sidePanel", "activeTab", "scripting", "storage"]);
  assert.deepEqual(manifest.host_permissions, ["http://*/*", "https://*/*"]);
});

test("sidepanel render, view switching and errors use the controller", () => {
  const source = read("sidepanel.js");
  const render = source.slice(source.indexOf("function renderMarkdown("), source.indexOf("// Collect every <img>"));
  const view = source.slice(source.indexOf("function setViewMode("), source.indexOf("async function extractCurrentPage("));
  const error = source.slice(source.indexOf("function renderError("), source.indexOf("function setViewMode("));
  assert.equal(render.includes("innerHTML"), false);
  assert.equal(render.includes("md.render"), false);
  assert.match(render, /preview\.setMarkdown\(markdownResult\.markdown\)/);
  assert.match(view, /if \(showSource\) preview\.hide\(\);\s*else preview\.show\(\);/);
  assert.match(error, /preview\.reset\(\)/);
  assert.match(source, /createPreviewController\(\{\s*container: dom\.preview,\s*loadButton: dom\.loadImagesButton,/);
  assert.match(source, /if \(prefs\.view === "preview"\) setViewMode\("preview", \{ persist: false \}\)/);
  const { document } = parseHTML(read("sidepanel.html"));
  const button = document.getElementById("load-images-btn");
  assert.equal(button.textContent, "Load images");
  assert.equal(document.getElementById("preview-output").contains(button), false);
  assert.equal(button.hidden, true);
  assert.equal(button.hasAttribute("disabled"), true);
});

for (const view of ["source", "preview"]) {
  test(`built sidepanel stays deferred with persisted ${view} view, then loads and resets`, async () => {
    const { window, document } = parseHTML(read("sidepanel.html"));
    window.DOMParser = DOMParser;
    const calls = [];
    const revoked = [];
    let failConversion = false;
    const context = vm.createContext({
      window, document, DOMParser, Blob, Date,
      URL: class extends URL {
        static createObjectURL() { return "blob:https://example.org/loaded"; }
        static revokeObjectURL(url) { revoked.push(url); }
      },
      fetch: async (url, options) => {
        calls.push([url, options.credentials]);
        return { ok: true, blob: async () => new Blob(["image"]) };
      },
      chrome: {
        storage: { local: { get: async () => ({ "paperboy:prefs": { view } }), set: async () => {} } },
        runtime: {
          onMessage: { addListener() {} },
          sendMessage: (message, callback) => callback(failConversion ? { ok: false, error: "test failure" } : {
            ok: true,
            data: {
              html: '<html><body><main><p>Test.</p><img alt="remote" src="https://example.org/pixel.png"></main></body></html>',
              title: "Test", url: "https://example.org/", capturedAt: 0,
            },
          }),
        },
      },
    });
    vm.runInContext(read("lib/readability.js"), context);
    vm.runInContext(read("sidepanel.bundle.js"), context);
    await new Promise(setImmediate);
    const container = document.getElementById("preview-output");
    const loadButton = document.getElementById("load-images-btn");
    assert.equal(document.getElementById("markdown-output").textContent,
      "# Test\n\nSource: https://example.org/\n\nTest.\n\n![remote](https://example.org/pixel.png)\n");
    assert.deepEqual(calls, []);
    assert.equal(container.querySelectorAll("img").length, 0);
    if (view === "source") {
      assert.equal(container.innerHTML, "");
      document.querySelector('[data-view="preview"]').click();
    }
    assert.equal(container.querySelector("[data-image-url]").dataset.imageAlt, "remote");
    assert.equal(loadButton.hidden, false);
    assert.deepEqual(calls, []);
    loadButton.click();
    await new Promise(setImmediate);
    assert.deepEqual(calls, [["https://example.org/pixel.png", "omit"]]);
    assert.equal(container.querySelector("img").getAttribute("src"), "blob:https://example.org/loaded");
    assert.equal(container.querySelector("img").getAttribute("alt"), "remote");
    document.getElementById("refresh-btn").click();
    await new Promise(setImmediate);
    assert.deepEqual(revoked, ["blob:https://example.org/loaded"]);
    assert.equal(container.querySelectorAll("img").length, 0);
    assert.equal(container.querySelector("[data-image-url]").dataset.imageAlt, "remote");
    loadButton.click();
    await new Promise(setImmediate);
    failConversion = true;
    document.getElementById("refresh-btn").click();
    await new Promise(setImmediate);
    assert.equal(container.innerHTML, "");
    assert.equal(document.getElementById("markdown-output").textContent, "Error: test failure");
    assert.equal(loadButton.hidden, true);
    assert.equal(loadButton.disabled, true);
    assert.deepEqual(revoked, ["blob:https://example.org/loaded", "blob:https://example.org/loaded"]);
  });
}
