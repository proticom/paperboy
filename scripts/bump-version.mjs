#!/usr/bin/env node
/**
 * Align every workspace package in the monorepo to the same version.
 *
 * Usage:
 *   node scripts/bump-version.mjs <version>   # e.g. 0.2.0
 *   node scripts/bump-version.mjs --check     # verify all aligned, no writes
 *
 * After bumping you still need to:
 *   1. cd paperboy-converter && npm run sync:all
 *      (rebuilds, repacks the tarball with the new name, propagates the
 *       file:.../proticom-paperboy-converter-X.Y.Z.tgz reference to every
 *       consumer, runs npm install in each)
 *   2. Verify each consumer builds (npm run build in cli/ext/widget)
 *   3. Commit + push: chore: align all packages to vX.Y.Z
 *
 * The paperboy-site repo is intentionally NOT touched — it's a separate
 * private repo with its own version cadence.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// JSON files with a top-level "version" key.
const JSON_TARGETS = [
  "paperboy-converter/package.json",
  "paperboy-cli/package.json",
  "paperboy-ext/package.json",
  "paperboy-ext/manifest.json",
  "paperboy-widget/package.json",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, obj) {
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

function getCurrent() {
  const rows = [];
  for (const rel of JSON_TARGETS) {
    const obj = readJson(resolve(ROOT, rel));
    rows.push({ path: rel, version: obj.version ?? "?" });
  }
  return rows;
}

function bumpAll(version) {
  for (const rel of JSON_TARGETS) {
    const path = resolve(ROOT, rel);
    const obj = readJson(path);
    const prev = obj.version;
    obj.version = version;
    writeJson(path, obj);
    console.log(`  ${rel}: ${prev} -> ${version}`);
  }
}

const arg = process.argv[2];

if (!arg || arg === "--help" || arg === "-h") {
  console.error("Usage:");
  console.error("  node scripts/bump-version.mjs <version>");
  console.error("  node scripts/bump-version.mjs --check");
  process.exit(arg ? 0 : 1);
}

if (arg === "--check") {
  const rows = getCurrent();
  const unique = new Set(rows.map((r) => r.version));
  for (const r of rows) {
    console.log(`  ${r.version.padEnd(10)} ${r.path}`);
  }
  if (unique.size === 1) {
    console.log(`\nAligned at ${[...unique][0]}.`);
    process.exit(0);
  }
  console.log(`\nNOT aligned: ${unique.size} distinct versions present.`);
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i.test(arg)) {
  console.error(`Invalid version: ${arg}`);
  console.error("Expected semver like 0.2.0 or 1.0.0-rc.1");
  process.exit(1);
}

console.log(`Bumping all workspace packages to ${arg}:\n`);
bumpAll(arg);
console.log(`\nNext steps:`);
console.log(`  1. cd paperboy-converter && npm run sync:all`);
console.log(`  2. Smoke-test: npm run build in each consumer`);
console.log(`  3. git commit -m "chore: align all packages to v${arg}"`);
