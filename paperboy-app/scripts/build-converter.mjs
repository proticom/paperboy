import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";

mkdirSync(resolve("src/scripts/vendor"), { recursive: true });

buildSync({
  entryPoints: [resolve("src/scripts/converter.js")],
  outfile: resolve("src/scripts/vendor/converter.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: false,
  legalComments: "none",
  logLevel: "silent",
});

console.log("Bundled converter -> src/scripts/vendor/converter.js");
