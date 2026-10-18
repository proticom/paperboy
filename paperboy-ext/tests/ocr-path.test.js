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

test("OCR annotation uses the exported parser and inserts the blockquote", async () => {
  const { document } = parseHTML(read("sidepanel.html"));
  let pageRequest = null;
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
      ok: true,
      blob: async () => new Blob(["ocr-bytes"]),
    }),
    chrome: {
      runtime: {
        lastError: null,
        getURL: (file) => `chrome-extension://test/${file}`,
        onMessage: { addListener() {} },
        sendMessage: (message, callback) => {
          pageRequest = message;
          callback({
            ok: true,
            data: {
              html: "<html><head><title>Scan page</title></head><body><article><h1>Scan page</h1><p>Visible text for readability.</p><img src=\"https://example.org/ocr.png\" alt=\"Scan\"></article></body></html>",
              url: "https://example.org/article",
              title: "Scan page",
              capturedAt: "2026-10-18T12:00:00.000Z",
            },
          });
        },
      },
      storage: {
        local: {
          get: async () => ({ "paperboy:prefs": { ocrEnabled: true } }),
          set: async () => {},
        },
      },
    },
    Tesseract: {
      createWorker: async () => ({
        recognize: async () => ({ data: { text: "PAPERBOY OCR 4217" } }),
      }),
    },
    Readability: class {
      parse() {
        return {
          title: "Scan page",
          content: "<p>Visible text for readability.</p><img src=\"https://example.org/ocr.png\" alt=\"Scan\">",
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

  const output = document.getElementById("markdown-output").textContent;
  const status = document.getElementById("meta-text").textContent;
  const combined = `${output}\n${status}`;
  assert.equal(pageRequest.type, "paperboy:request-page-data");
  assert.equal(combined.includes("Error:"), false, combined);
  assert.equal(combined.includes("parseHtmlToDocument is not defined"), false, combined);
  assert.match(output, /!\[[^\]]*Scan[^\]]*\]\([^)]*ocr\.png[^)]*\)\n\n> OCR: PAPERBOY OCR 4217/);
});
