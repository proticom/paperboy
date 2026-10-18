const { appendFileSync } = require("node:fs");

function blockNetwork(url) {
  appendFileSync(process.env.PAPERBOY_TEST_NETWORK_LOG, `${String(url)}\n`);
  throw new Error("Network access blocked by offline OCR test");
}

// Node preloads this file in both the CLI process and Tesseract's worker.
globalThis.fetch = blockNetwork;
for (const protocol of ["node:http", "node:https"]) {
  const client = require(protocol);
  client.request = blockNetwork;
  client.get = blockNetwork;
}
