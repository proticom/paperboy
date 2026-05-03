import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";

const targets = [
  ["node_modules/markdown-it/dist/markdown-it.min.js", "src/scripts/vendor/markdown-it.min.js"],
  ["node_modules/markdown-it-footnote/dist/markdown-it-footnote.min.js", "src/scripts/vendor/markdown-it-footnote.min.js"],
  ["node_modules/markdown-it-deflist/dist/markdown-it-deflist.min.js", "src/scripts/vendor/markdown-it-deflist.js"],
  ["node_modules/markdown-it-mark/dist/markdown-it-mark.min.js", "src/scripts/vendor/markdown-it-mark.min.js"],
  ["node_modules/markdown-it-sub/dist/markdown-it-sub.min.js", "src/scripts/vendor/markdown-it-sub.min.js"],
  ["node_modules/markdown-it-sup/dist/markdown-it-sup.min.js", "src/scripts/vendor/markdown-it-sup.min.js"],
  ["node_modules/markdown-it-task-lists/dist/markdown-it-task-lists.min.js", "src/scripts/vendor/markdown-it-task-lists.min.js"]
];

mkdirSync(resolve("src/scripts/vendor"), { recursive: true });
for (const [from, to] of targets) {
  const source = resolve(from);
  if (!existsSync(source)) {
    console.warn(`Missing vendor source: ${from}`);
    continue;
  }
  copyFileSync(source, resolve(to));
  console.log(`Copied ${from} -> ${to}`);
}

buildSync({
  entryPoints: [resolve("node_modules/@chenglou/pretext/src/layout.ts")],
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
