const esbuild = require("esbuild");
const pkg = require("./package.json");

const watchMode = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: ["src/widget.js"],
  outfile: "dist/paperboy-widget.min.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: ["es2020"],
  minify: true,
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
  banner: {
    js: `/*! ${pkg.name} v${pkg.version} */`,
  },
};

async function runBuild() {
  if (watchMode) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
    console.log("Watching for changes...");
    return;
  }

  await esbuild.build(buildOptions);
  console.log(`Built dist/paperboy-widget.min.js (v${pkg.version})`);
}

runBuild().catch((error) => {
  console.error(error);
  process.exit(1);
});
