const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { DOMParser, parseHTML } = require("linkedom");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("parseHtmlToDocument is exported and parses with the global DOMParser", async () => {
  const source = read("lib/convert.mjs");
  assert.match(source, /export function parseHtmlToDocument\(html, (?:url|baseUrl), DOMParser = globalThis\.DOMParser\)/);
  const previous = globalThis.DOMParser;
  globalThis.DOMParser = DOMParser;
  try {
    const { parseHtmlToDocument } = await import("../lib/convert.mjs");
    const document = parseHtmlToDocument(
      "<html><body><img src=\"https://example.org/ocr.png\" alt=\"Scan\"></body></html>",
      "https://example.org/article",
    );
    assert.equal(document.querySelector("img").getAttribute("alt"), "Scan");
    assert.equal(document.querySelector("base").getAttribute("href"), "https://example.org/article");
  } finally {
    if (previous === undefined) delete globalThis.DOMParser;
    else globalThis.DOMParser = previous;
  }
});

async function annotate(ocrData, { noImage = false, fetchOk = true, toggle = false, region = false } = {}) {
  const { document } = parseHTML(read("sidepanel.html"));
  let pageRequest = null;
  const recognizeCalls = [];
  let onMessage;
  const context = vm.createContext({
    console,
    document,
    DOMParser,
    URL,
    Blob,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    fetch: async () => ({
      ok: fetchOk,
      status: fetchOk ? 200 : 503,
      blob: async () => new Blob(["ocr-bytes"]),
    }),
    chrome: {
      runtime: {
        lastError: null,
        getURL: (file) => `chrome-extension://test/${file}`,
        onMessage: { addListener(listener) { onMessage = listener; } },
        sendMessage: (message, callback) => {
          pageRequest = message;
          callback({
            ok: true,
            data: {
              html: noImage ? "<html><body><p>Visible text for readability.</p></body></html>" : "<html><head><title>Scan page</title></head><body><article><h1>Scan page</h1><p>Visible text for readability.</p><img src=\"https://example.org/ocr.png\" alt=\"Scan\"></article></body></html>",
              url: "https://example.org/article",
              title: "Scan page",
              capturedAt: "2026-10-18T12:00:00.000Z",
            },
          });
        },
      },
      storage: {
        local: {
          get: async () => ({ "paperboy:prefs": { ocrEnabled: !toggle } }),
          set: async () => {},
        },
      },
    },
    Tesseract: {
      createWorker: async () => ({
        recognize: async (...args) => {
          recognizeCalls.push(args);
          return { data: ocrData };
        },
      }),
    },
    Readability: class {
      parse() {
        return {
          title: "Scan page",
          content: noImage ? "<p>Visible text for readability.</p>" : "<p>Visible text for readability.</p><img src=\"https://example.org/ocr.png\" alt=\"Scan\">",
          textContent: "Visible text for readability.",
          length: 32,
        };
      }
    },
  });
  context.window = context;
  context.self = context;
  vm.runInContext(read("sidepanel.bundle.js"), context);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  if (toggle) {
    document.getElementById("ocr-btn").click();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (region) {
    onMessage({ type: "paperboy:region-picked", data: {
      html: '<html><body><p>Visible text for readability.</p><img src="https://example.org/ocr.png" alt="Scan"></body></html>',
      url: "https://example.org/article", capturedAt: "2026-10-18T12:00:00.000Z",
    } });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }
  const output = document.getElementById("markdown-output").textContent;
  const status = document.getElementById("meta-text").textContent;
  return { output, status, state: document.getElementById("meta-text").dataset.state, pageRequest, recognizeCalls };
}

test("OCR annotation uses the shared cleanup and requests structured blocks", async () => {
  const { output, status, pageRequest, recognizeCalls } = await annotate({ text: "PAPERBOY OCR 4217" });
  assert.equal(recognizeCalls.length, 1);
  assert.equal(recognizeCalls[0][0] instanceof Blob, true);
  assert.deepEqual(JSON.parse(JSON.stringify(recognizeCalls[0].slice(1))), [{}, { text: true, blocks: true }]);
  const combined = `${output}\n${status}`;
  assert.equal(pageRequest.type, "paperboy:request-page-data");
  assert.equal(combined.includes("Error:"), false, combined);
  assert.equal(combined.includes("parseHtmlToDocument is not defined"), false, combined);
  assert.match(output, /!\[[^\]]*Scan[^\]]*\]\([^)]*ocr\.png[^)]*\)\n\n> OCR: PAPERBOY OCR 4217/);
});


function ocrLine(text, confidence) {
  return { words: text.split(" ").map((text, index) => ({
    text, confidence, bbox: { x0: index * 100, y0: 0, x1: index * 100 + 80, y1: 20 },
  })) };
}

test("OCR annotation filters junk and collapses its markers through the built bundle", async () => {
  const { output } = await annotate({
    text: "Raw junk must not appear",
    blocks: [{ paragraphs: [
      { lines: [ocrLine("Caption stays.", 96)] },
      { lines: [ocrLine("r~ SNE", 18), ocrLine("~~ =", 30)] },
      { lines: [ocrLine("Final caption.", 96)] },
    ] }],
  });
  assert.match(output, /> OCR: Caption stays\.\n> \n> <!-- image omitted -->\n> \n> Final caption\./);
  assert.equal(output.includes("Raw junk"), false);
});

test("OCR annotation skips images whose cleaned text contains only omission markers", async () => {
  const { output, status, state } = await annotate({
    text: "Photo junk",
    blocks: [{ paragraphs: [{ lines: [ocrLine("r~ SNE", 18)] }] }],
  });
  assert.equal(status, "No readable text in 1 image(s).");
  assert.equal(state, "idle");
  assert.equal(output.includes("> OCR:"), false);
  assert.equal(output.includes("image omitted"), false);
  assert.match(output, /!\[[^\]]*Scan[^\]]*\]\([^)]*ocr\.png[^)]*\)/);
});


for (const [label, options, expected] of [
  ["failed fetch", { fetchOk: false }, "No readable text in 1 image(s)."],
  ["no images", { noImage: true }, "No images found to OCR on this page."],
  ["OCR toggle", { toggle: true }, "No readable text in 1 image(s)."],
  ["picked region", { region: true }, "No readable text in 1 image(s)."],
]) {
  test(`OCR finishes with an idle status after ${label}`, async () => {
    const { status, state } = await annotate({ text: "" }, options);
    assert.equal(status, expected);
    assert.equal(state, "idle");
  });
}
