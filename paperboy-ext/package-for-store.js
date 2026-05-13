/**
 * Builds a Chrome Web Store upload zip: only runtime files, no node_modules or sources.
 * Run: npm run package:store (runs build first).
 */
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const root = __dirname;

const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const version = manifest.version;

/** Paths inside the extension folder, preserved in the zip. */
const STORE_FILES = [
  "manifest.json",
  "background.js",
  "sidepanel.html",
  "sidepanel.bundle.js",
  "styles.css",
  "lib/readability.js",
  "lib/tesseract/tesseract.min.js",
  "lib/tesseract/worker.min.js",
  "icons/icon-16.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];

const missing = STORE_FILES.filter((rel) => !fs.existsSync(path.join(root, rel)));
if (missing.length) {
  console.error("Missing files (run npm run build if sidepanel.bundle.js is absent):");
  missing.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

const distDir = path.join(root, "dist");
fs.mkdirSync(distDir, { recursive: true });

const outName = `paperboy-extension-${version}.zip`;
const outPath = path.join(distDir, outName);

const zip = new AdmZip();
for (const rel of STORE_FILES) {
  const abs = path.join(root, rel);
  const dir = path.dirname(rel);
  // adm-zip: second arg is the parent path *inside the zip*; the file basename is appended.
  if (dir === ".") {
    zip.addLocalFile(abs);
  } else {
    zip.addLocalFile(abs, dir);
  }
}

zip.writeZip(outPath);
console.log(`Wrote ${outPath} (${STORE_FILES.length} files)`);
