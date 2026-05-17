import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { buildSync } from "esbuild";

// Use require.resolve so that the script works under npm workspaces, where
// dependencies hoist to the monorepo root node_modules instead of living
// inside ./node_modules. Resolving the package.json gives us the install
// directory regardless of where npm chose to put it.
const require = createRequire(import.meta.url);

function packageDir(pkgName) {
  return dirname(require.resolve(`${pkgName}/package.json`));
}

const targets = [
  [`${packageDir("markdown-it")}/dist/markdown-it.min.js`, "src/scripts/vendor/markdown-it.min.js"],
  [`${packageDir("markdown-it-footnote")}/dist/markdown-it-footnote.min.js`, "src/scripts/vendor/markdown-it-footnote.min.js"],
  [`${packageDir("markdown-it-deflist")}/dist/markdown-it-deflist.min.js`, "src/scripts/vendor/markdown-it-deflist.js"],
  [`${packageDir("markdown-it-mark")}/dist/markdown-it-mark.min.js`, "src/scripts/vendor/markdown-it-mark.min.js"],
  [`${packageDir("markdown-it-sub")}/dist/markdown-it-sub.min.js`, "src/scripts/vendor/markdown-it-sub.min.js"],
  [`${packageDir("markdown-it-sup")}/dist/markdown-it-sup.min.js`, "src/scripts/vendor/markdown-it-sup.min.js"],
  [`${packageDir("markdown-it-task-lists")}/dist/markdown-it-task-lists.min.js`, "src/scripts/vendor/markdown-it-task-lists.min.js"]
];

mkdirSync(resolve("src/scripts/vendor"), { recursive: true });
for (const [from, to] of targets) {
  if (!existsSync(from)) {
    console.warn(`Missing vendor source: ${from}`);
    continue;
  }
  copyFileSync(from, resolve(to));
  console.log(`Copied ${from} -> ${to}`);
}

const pretextEntry = `${packageDir("@chenglou/pretext")}/src/layout.ts`;
buildSync({
  entryPoints: [pretextEntry],
  outfile: resolve("src/scripts/vendor/pretext.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: false,
  legalComments: "none",
  logLevel: "silent",
});
console.log("Bundled @chenglou/pretext -> src/scripts/vendor/pretext.js");
