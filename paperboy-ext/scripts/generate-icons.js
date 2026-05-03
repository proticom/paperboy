/**
 * Raster icons for the Chrome extension — same look as paperboy-site/app/icon.tsx:
 * Canterbury "P" on #1A1A1A with rounded corners (proportions match the 32×32 favicon).
 */
const fs = require("fs");
const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");

const root = path.join(__dirname, "..");
const fontPath = path.join(
  root,
  "..",
  "paperboy-site",
  "app",
  "fonts",
  "Canterbury.ttf",
);

if (!fs.existsSync(fontPath)) {
  console.error(
    "Canterbury.ttf not found. Expected:",
    fontPath,
    "\nKeep paperboy-site next to paperboy-ext, or copy the font into this repo.",
  );
  process.exit(1);
}

GlobalFonts.registerFromPath(fontPath, "Canterbury");

/** Matches icon.tsx: 32×32, fontSize 26, borderRadius 4 */
const REF = 32;
const FONT_RATIO = 26 / REF;
const RADIUS_RATIO = 4 / REF;

const SIZES = [16, 48, 128];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const radius = Math.max(1, (size * RADIUS_RATIO) | 0);
  ctx.fillStyle = "#1A1A1A";
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, radius);
  ctx.fill();

  const fontSize = Math.max(8, Math.round(size * FONT_RATIO));
  ctx.fillStyle = "#F4F1EA";
  ctx.font = `${fontSize}px Canterbury`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("P", size / 2, size / 2);

  return canvas.toBuffer("image/png");
}

const iconsDir = path.join(root, "icons");
fs.mkdirSync(iconsDir, { recursive: true });

for (const size of SIZES) {
  const out = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(out, drawIcon(size));
  console.log("Wrote", out);
}
