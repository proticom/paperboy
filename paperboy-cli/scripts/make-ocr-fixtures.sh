#!/bin/sh
set -eu

# Fonts: Arial for document text, Courier-New for code. Requires ImageMagick 7.
ocr_fixtures=$(CDPATH= cd -- "$(dirname -- "$0")/../tests/fixtures" && pwd)
ocr_magick=${OCR_MAGICK:-magick}

"$ocr_magick" -size 700x700 xc:white -font Arial -pointsize 24 -fill black \
  -gravity NorthWest -interline-spacing 10 \
  -annotate +35+25 'Supply list

• Notebook
• Water bottle
• Spare cable

Name:
Email:

Receipt' \
  -annotate +35+460 'Tea
Bread
Total' \
  -annotate +350+460 '2.50
3.25
5.75' \
  -colorspace Gray -depth 8 -strip -define png:color-type=0 \
  -define png:exclude-chunks=all "$ocr_fixtures/ocr-lists.png"

"$ocr_magick" -size 760x410 xc:white -font Courier-New -pointsize 24 -fill black \
  -gravity NorthWest -interline-spacing 8 -annotate +35+25 'function count(items) {
  let total = 0;
  for (const item of items) {
    total += item;
  }
  return total;
}

const size = count(items);' \
  -colorspace Gray -depth 8 -strip -define png:color-type=0 \
  -define png:exclude-chunks=all "$ocr_fixtures/ocr-code.png"

"$ocr_magick" -size 900x260 xc:white -font Arial -pointsize 24 -fill black \
  -gravity NorthWest -interline-spacing 18 \
  -annotate +35+30 'Name
Eva Stone
Milan Reed' \
  -annotate +270+30 'Role
Operator
Analyst' \
  -annotate +500+30 'City
Dublin
Bergen' \
  -annotate +730+30 'Start
2024
2020' \
  -colorspace Gray -depth 8 -strip -define png:color-type=0 \
  -define png:exclude-chunks=all "$ocr_fixtures/ocr-table.png"
