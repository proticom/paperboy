const esbuild = require("esbuild");

const watchMode = process.argv.includes("--watch");

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
};

async function runBuild() {
  if (watchMode) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
    console.log("Watching extension sidepanel bundle...");
    return;
  }

  await esbuild.build(buildOptions);
  console.log("Built sidepanel.bundle.js");
}

runBuild().catch((error) => {
  console.error(error);
  process.exit(1);
});
