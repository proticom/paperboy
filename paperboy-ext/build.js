const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const watchMode = process.argv.includes("--watch");
const rootDir = __dirname;

// Files Chrome actually needs at runtime. Mirrors STORE_FILES in package-for-store.js.
const RUNTIME_FILES = [
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

function prepareTesseractAssets() {
  const tesseractDistDir = path.join(
    rootDir,
    "node_modules",
    "tesseract.js",
    "dist",
  );
  const destDir = path.join(rootDir, "lib", "tesseract");
  fs.mkdirSync(destDir, { recursive: true });

  for (const asset of ["tesseract.min.js", "worker.min.js"]) {
    const src = path.join(tesseractDistDir, asset);
    if (!fs.existsSync(src)) {
      throw new Error(
        `Missing tesseract asset: ${src}. Run npm install in paperboy-ext.`,
      );
    }
    fs.copyFileSync(src, path.join(destDir, asset));
  }
}

function readConverterVersion() {
  const pkgPath = path.join(
    rootDir,
    "node_modules",
    "@proticom",
    "paperboy-converter",
    "package.json",
  );
  if (!fs.existsSync(pkgPath)) {
    throw new Error(
      `Missing installed converter at ${pkgPath}. Run npm install in paperboy-ext.`,
    );
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const version = pkg.version;
  if (!version || typeof version !== "string") {
    throw new Error(
      `@proticom/paperboy-converter package.json has no valid "version" field.`,
    );
  }
  return version;
}

/** Keep extension manifest (and npm package) aligned with the bundled converter. */
function syncExtensionVersions(converterVersion) {
  const manifestPath = path.join(rootDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = converterVersion;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const extPkgPath = path.join(rootDir, "package.json");
  const extPkg = JSON.parse(fs.readFileSync(extPkgPath, "utf8"));
  extPkg.version = converterVersion;
  fs.writeFileSync(extPkgPath, `${JSON.stringify(extPkg, null, 2)}\n`);
}

const converterVersion = readConverterVersion();
syncExtensionVersions(converterVersion);

const buildOptions = {
  entryPoints: ["sidepanel.js"],
  outfile: "sidepanel.bundle.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: ["es2020"],
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
  // Plain identifier; esbuild does not reliably substitute names with leading/trailing "__".
  banner: {
    js: `var PAPERBOY_CONVERTER_VERSION = ${JSON.stringify(converterVersion)};\n`,
  },
};

function copyRuntimeToUnpacked() {
  const unpackedDir = path.join(rootDir, "dist", "unpacked");
  fs.rmSync(unpackedDir, { recursive: true, force: true });
  fs.mkdirSync(unpackedDir, { recursive: true });

  for (const rel of RUNTIME_FILES) {
    const src = path.join(rootDir, rel);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing runtime file: ${rel}`);
    }
    const dest = path.join(unpackedDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  console.log(`Copied ${RUNTIME_FILES.length} files -> dist/unpacked/`);
}

async function runBuild() {
  console.log(
    `Extension ${converterVersion} (converter @proticom/paperboy-converter@${converterVersion})`,
  );

  prepareTesseractAssets();

  if (watchMode) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
    console.log("Watching extension sidepanel bundle...");
    return;
  }

  await esbuild.build(buildOptions);
  console.log("Built sidepanel.bundle.js");

  copyRuntimeToUnpacked();
}

runBuild().catch((error) => {
  console.error(error);
  process.exit(1);
});
