# Paperboy CLI

`@proticom/paperboy-cli` converts files to Markdown from the command line.

It supports deterministic conversion for documents/spreadsheets and local OCR for images, with optional AI image description when configured.

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

Interactive setup for AI mode and credential storage.

Modes:
- Deterministic only (no AI)
- Local Ollama model (optional `ollama pull` during setup)
- Existing local endpoint (OpenAI-compatible API)
- OpenRouter (cloud API key + model selection)

### `paperboy-cli convert <inputPath>`

Convert a supported file into Markdown.

Options:
- `-o, --output <path>`: write to a specific markdown path
- `--stdout`: print markdown directly to stdout
- `--describe-image`: include optional AI image description section
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
- Config and dotenv locations
- Active AI mode and required dependencies
- Ollama/local endpoint connectivity (when enabled)
- OpenRouter key presence/connectivity (when enabled)
- Keychain/secret-tool availability on your platform

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

Image conversion can produce:
- `## OCR Text`
- `## Text Positioning` table with:
  - `Text`
  - `Confidence`
  - `Left`
  - `Top`
  - `Width`
  - `Height`

If AI description is enabled and available, output includes:
- `## Image Description` (prepended before OCR sections)

## Config and Credentials

Config location:
- `~/.config/paperboy-cli/config.json`

Dotenv fallback:
- `~/.config/paperboy-cli/.env`

OpenRouter key env var:
- `PAPERBOY_OPENROUTER_API_KEY`

Credential storage options during setup:
- macOS Keychain (recommended on macOS)
- GNOME Keyring via `secret-tool` (recommended on Linux when available)
- dotenv file fallback

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
