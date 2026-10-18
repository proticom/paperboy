import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = require.resolve(
  "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
);
const destination = new URL("../dist/lang/", import.meta.url);

await mkdir(destination, { recursive: true });
await copyFile(source, new URL("eng.traineddata.gz", destination));
