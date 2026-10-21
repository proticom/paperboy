# Paperboy CLI

`@proticom/paperboy-cli` converts files to Markdown from the command line.

It supports deterministic conversion for documents/spreadsheets and local OCR for images.

## Install

```bash
npm install -g @proticom/paperboy-cli
```

`paperboy` and `paperboy-dispatch` are also installed as aliases for compatibility; prefer `paperboy-cli`.

## Quick Start

```bash
# 1) Check environment health
paperboy-cli doctor

# Optional: set defaults
paperboy-cli setup

# 2) Convert a file
paperboy-cli convert "./input.pdf"
```

## Commands

### `paperboy-cli setup`

Choose whether image conversion includes an OCR text-position table, then save the conversion defaults.

### `paperboy-cli convert <inputPath>`

Convert a supported file into Markdown.

Options:
- `-o, --output <path>`: write to a specific markdown path
- `--stdout`: print markdown directly to stdout
- `--ocr-layout`: include the OCR word-position table for image conversion (off by default)
- `--no-ocr-layout`: omit the table, overriding saved config. Either off switch wins when combined with `--ocr-layout`, in any order.
- `--no-layout-table`: deprecated, hidden switch; still accepted to disable the table, including when config enables it. It takes precedence if both switches are passed.
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

### `paperboy-cli crawl <url>`

Crawl one page or a site on the same origin, convert HTML pages to Markdown, and follow links up to the depth limit. It also reads `sitemap.xml` (and nested sitemaps, up to the sitemap limit) and queues those URLs.

The crawler reads up to 500 KiB of `/robots.txt` before sitemap discovery and selects the exact `paperboy` user-agent token (case-insensitive), falling back to `*`. It checks original and normalized paths and every redirect target; disallowed URLs are skipped with a warning and omitted from `--map`. Page requests wait for the greater of `--rate-limit-ms` and `Crawl-delay`; only `Crawl-delay` is capped at 30 seconds. HTTP 4xx responses other than 429 allow crawling without robots rules. HTTP 429, 5xx, network failures, timeouts, and redirect loops stop the crawl as fully disallowed, print an error to stderr (also with `--json`), expose `robotsUnavailable` in the result, and exit with code 1 without writing an output file.

Options:
- `--max-pages <number>`: maximum pages to process (default `300`)
- `--max-depth <number>`: maximum depth from seed URLs (default `4`)
- `--include-patterns <patterns>`: comma-separated regexes; only matching URLs are kept
- `--exclude-patterns <patterns>`: comma-separated regexes for URLs to skip
- `--min-content-words <number>`: skip converted pages with fewer words (default `0`)
- `--output-mode <mode>`: `single`, `mirror`, or `jsonl` (default `single`)
- `-o, --output <path>`: output file for `single` and `jsonl`, or a directory for `mirror`
- `--map`: list discovered URLs only; do not convert pages to Markdown
- `--json`: print the crawl report as JSON
- `--rate-limit-ms <number>`: delay between requests in milliseconds (default `500`)
- `--timeout-ms <number>`: HTTP timeout in milliseconds (default `10000`)
- `--max-sitemaps <number>`: maximum sitemap files to read (default `20`)

Examples:

```bash
# One Markdown file for the crawled pages
paperboy-cli crawl "https://example.com"

# One Markdown file per page, under a directory
paperboy-cli crawl "https://example.com" --output-mode mirror -o "./out/example"

# List URLs from the seed page and sitemaps, without conversion
paperboy-cli crawl "https://example.com" --map
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

Image conversion emits text without an OCR heading. Lines with mean confidence
of at least 60 are always kept;
readable words and numeric tokens can also rescue lower-confidence lines. The
converter keeps every word in accepted lines and replaces consecutive rejected
regions with one `<!-- image omitted -->` marker.

Only prose wraps join with spaces. Lists, form labels, receipt/table rows, headings
and code keep their line breaks. Pipe-table rows and standalone identifiers also
keep their lines. Font changes and unusual line pitch separate headings and body
text. Letter-final hyphens are removed on joined lowercase prose wraps. Adjoining
code punctuation stays as read. A lone
`|` becomes `I` only when it is the sole pipe in its line and both adjacent words
start lowercase. Other spelling and punctuation remain unchanged. See the
converter README for the confidence and geometry rules.

The word-position table is off by default. Pass `--ocr-layout` to append
`## Text Positioning` with raw, unfiltered `Text`, `Confidence`, `Left`, `Top`,
`Width`, and `Height` values (up to 300 words). Existing saved configs with
`includeLayoutTable: true` still enable the table. Pass `--no-ocr-layout` to disable
it for one run. The hidden `--no-layout-table` switch remains accepted. Either off
switch takes precedence over `--ocr-layout`, regardless of flag order.

## Config

Configuration is stored in `~/.config/paperboy-cli/config.json`. Set `PAPERBOY_CLI_CONFIG_DIR` to use another directory.

```json
{
  "version": 1,
  "defaults": {
    "includeLayoutTable": false
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
