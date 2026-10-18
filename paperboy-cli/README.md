# Paperboy CLI

`@proticom/paperboy-cli` converts files to Markdown from the command line.

It supports deterministic conversion for documents/spreadsheets and local OCR for images.

## Install

```bash
npm install -g @proticom/paperboy-cli
```

## Quick Start

```bash
# 1) Configure once
paperboy-cli setup

# 2) Convert a file
paperboy-cli convert "./input.pdf"

# 3) Check environment health
paperboy-cli doctor
```

## Commands

### `paperboy-cli setup`

Choose whether image conversion includes an OCR text-position table, then save the conversion defaults.

### `paperboy-cli convert <inputPath>`

Convert a supported file into Markdown.

Options:
- `-o, --output <path>`: write to a specific markdown path
- `--stdout`: print markdown directly to stdout
- `--no-layout-table`: skip OCR text-position table
- `--json`: emit JSON metadata

Examples:

```bash
# Basic conversion (writes next to source file)
paperboy-cli convert "./book.epub"

# Write to a specific file
paperboy-cli convert "./scan.png" -o "./out/scan.md"

# Stream to stdout for pipelines
paperboy-cli convert "./report.docx" --stdout

# JSON metadata (good for scripts)
paperboy-cli convert "./table.xlsx" --json
```

### `paperboy-cli config show`

Print the current config JSON.

### `paperboy-cli doctor`

Runs diagnostics and prints what is healthy/missing.

What it checks:
- Node version compatibility
- Config location and file presence
- Converter smoke test
- Internet reachability (skip with `--offline`)
- Proxy environment
- Output directory write access
- Platform information

Use JSON output for automation:

```bash
paperboy-cli doctor --json
```

## Supported Input Formats

- Markdown/text: `md`, `markdown`, `mdx`, `txt`
- HTML: `html`, `htm`
- Rich text: `rtf`
- Word: `docx`
- PDF: `pdf`
- Data: `csv`, `xlsx`
- Ebook: `epub`
- Image OCR: `png`, `jpg`, `jpeg`, `gif`, `bmp`, `webp`, `tif`, `tiff`

## OCR Output Shape (Images)

English OCR works fully offline, including the first run. The build copies language
data from the pinned `@tesseract.js-data/eng@1.0.0` package into `dist/lang/`, which
ships with the CLI. OCR reads this local data without downloading or writing a
language cache to the current directory.

Image conversion can produce:
- `## OCR Text`
- `## Text Positioning` table with:
  - `Text`
  - `Confidence`
  - `Left`
  - `Top`
  - `Width`
  - `Height`

## Config

Configuration is stored in `~/.config/paperboy-cli/config.json`. Set `PAPERBOY_CLI_CONFIG_DIR` to use another directory.

```json
{
  "version": 1,
  "defaults": {
    "includeLayoutTable": true
  }
}
```

## Exit Behavior

- `convert`: exits non-zero on hard failures; warnings are reported in output.
- `doctor`: exits with code `1` if any failing checks are found.

## Development

```bash
npm install
npm test
npm run test:coverage
npm run build
node dist/cli.js --help
```

Coverage reports are written to `coverage/`:
- terminal summary
- `coverage/index.html` for browser view
- `coverage/coverage-summary.json` for CI tooling
