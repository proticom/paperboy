const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const traineddata = "lib/tesseract/lang/eng.traineddata.gz";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function sourceFiles(dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".git"].includes(entry.name)
        || file === path.join(root, "lib/tesseract")) return [];
      return sourceFiles(file);
    }
    return /\.(?:[cm]?js|tsx?|json|html|css|md)$/.test(entry.name) ? [file] : [];
  });
}

test("extension sources never select remote language data", () => {
  const oldHost = ["tessdata", "projectnaptha", "com"].join(".");
  for (const file of sourceFiles()) {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(root, file);
    assert.equal(source.includes(oldHost), false, `${relative} references the old language CDN`);
    assert.equal(/\blangPath["'`]?\s*[:=]\s*["'`](?:https?:)?\/\//i.test(source), false,
      `${relative} selects a remote langPath`);
  }
});

test("OCR worker requests local gzip data without a language cache", async () => {
  const source = read("sidepanel.js");
  const start = source.indexOf("let tesseractWorkerPromise = null;");
  const end = source.indexOf("async function fetchImageBytes", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const calls = [];
  const context = vm.createContext({
    chrome: { runtime: { getURL: (file) => `chrome-extension://test/${file}` } },
    Tesseract: { createWorker: (...args) => {
      calls.push(args);
      return Promise.resolve("local worker");
    } },
  });
  vm.runInContext(source.slice(start, end), context);
  assert.equal(await vm.runInContext("getTesseractWorker()", context), "local worker");
  assert.equal(await vm.runInContext("getTesseractWorker()", context), "local worker");
  assert.equal(calls.length, 1);
  const [language, engine, options] = calls[0];
  assert.equal(language, "eng");
  assert.equal(engine, 1);
  assert.equal(options.langPath, "chrome-extension://test/lib/tesseract/lang");
  assert.equal(options.gzip, true);
  assert.equal(options.cacheMethod, "none");
  assert.equal(options.workerBlobURL, false);
});

test("MV3 manifest allows the bundled language data and local scripts", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  const patterns = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
  assert.equal(patterns.some((pattern) => {
    const escaped = pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`^${escaped.join(".*")}$`).test(traineddata);
  }), true, "web_accessible_resources must cover the language data");
  const directives = new Map(manifest.content_security_policy.extension_pages
    .split(";").map((directive) => directive.trim().split(/\s+/))
    .filter(([name]) => name).map(([name, ...sources]) => [name, sources]));
  const scriptSources = directives.get("script-src") || directives.get("default-src");
  assert.ok(scriptSources?.length, "extension_pages must restrict scripts");
  for (const [name, sources] of directives) {
    if (name === "default-src" || name.startsWith("script-src")) {
      for (const source of sources) {
        assert.equal(["'self'", "'wasm-unsafe-eval'", "'none'"].includes(source), true,
          `${name} contains a nonlocal script source: ${source}`);
      }
    }
  }
});

test("both packaging lists include the English data", () => {
  for (const [file, name] of [["build.js", "RUNTIME_FILES"], ["package-for-store.js", "STORE_FILES"]]) {
    const match = read(file).match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`));
    assert.ok(match, `${file} must declare ${name}`);
    const files = vm.runInNewContext(match[1]);
    assert.equal(files.includes(traineddata), true, `${name} must include ${traineddata}`);
  }
});

test("built English data is a non-empty gzip file", () => {
  const file = path.join(root, traineddata);
  assert.equal(fs.existsSync(file), true, "Missing English data. Run npm install at the monorepo root, then npm run build in paperboy-ext.");
  assert.ok(fs.statSync(file).size > 0, "Bundled English data must not be empty");
  const header = Buffer.alloc(2);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, header, 0, header.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(header.toString("hex"), "1f8b", "Bundled English data must be gzip compressed");
});
