#!/usr/bin/env node
/**
 * Rewrite workspace "*" deps to registry semver ranges before npm publish.
 * Keeps monorepo npm ci on symlinks; published tarball gets ^X.Y.Z deps.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function readVersion(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), "utf8")).version;
}

function pinPkg(pkgPath, pins) {
  const abs = resolve(ROOT, pkgPath);
  const pkg = JSON.parse(readFileSync(abs, "utf8"));
  for (const [name, versionFile] of Object.entries(pins)) {
    const version = readVersion(versionFile);
    pkg.dependencies[name] = `^${version}`;
    console.log(`  ${name}: ^${version}`);
  }
  writeFileSync(abs, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

const target = process.argv[2];
if (target === "cli") {
  console.log("Pinning @proticom/paperboy-cli registry deps:");
  pinPkg("paperboy-cli/package.json", {
    "@proticom/paperboy-converter": "paperboy-converter/package.json",
  });
} else {
  console.error("Usage: node scripts/pin-registry-deps.mjs cli");
  process.exit(1);
}
