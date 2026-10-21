# @proticom/paperboy-converter

Turn many common document and image formats into **Markdown** in Node.js. This package powers the [Paperboy](https://github.com/proticom/paperboy) CLI and browser extension; you can also use it directly in your own scripts and servers.

## Install

```bash
npm install @proticom/paperboy-converter
```

Requires **Node.js 20.18 or newer**.

## Quick example

```javascript
import { readFile } from "node:fs/promises";
import { convertToMarkdown } from "@proticom/paperboy-converter";

const filename = "report.docx";
const data = await readFile(filename); // Uint8Array is fine

const { markdown, title, warnings } = await convertToMarkdown(filename, data);

console.log(title);
console.log(markdown);
if (warnings.length) console.warn(warnings);
```

Use a **real filename** (with the correct extension). The library picks the converter from the extension.

## Supported formats

| Kind | Extensions |
|------|------------|
| Markdown / text | `md`, `markdown`, `mdx`, `txt` |
| HTML | `html`, `htm` |
| Rich text | `rtf` |
| Word | `docx` |
| PDF | `pdf` |
| Spreadsheets | `csv`, `xlsx` |
| E-books | `epub` |
| Images (OCR) | `png`, `jpg`, `jpeg`, `gif`, `bmp`, `webp`, `tif`, `tiff` |

## API overview

### `convertToMarkdown(filename, data, options?)`

- **`filename`**: string path or basename (extension selects the handler).
- **`data`**: `string` or `Uint8Array` file contents.
- **`options`**: optional; see **Image options** below.

Returns a **`Promise`** for:

- **`markdown`**: resulting Markdown string.
- **`title`**: a display title (usually derived from the filename).
- **`warnings`**: non-fatal messages (for example OCR notes).

### Helpers (main entry)

Also exported from the package root:

- **`SUPPORTED_EXTENSIONS`**: list of file extensions that have a handler.
- **`FILE_INPUT_ACCEPT`**: a string suitable for HTML `<input accept="...">`.
- **`shouldReadInputAsText(filename)`**: whether callers may read the file as UTF-8 text instead of binary.
- **`createTurndownService()`**: shared Turndown setup (GFM, fenced code, script/style stripping).
- **`normalizeLineEndings`**, **`stripFileExtension`**, **`toWordCount`**: small utilities.

### Subpath exports

| Import path | Purpose |
|-------------|---------|
| `@proticom/paperboy-converter` | Main API and helpers above |
| `@proticom/paperboy-converter/turndown` | `createTurndownService` only |
| `@proticom/paperboy-converter/helpers` | Low-level helpers (`getExtension`, `toBytes`, etc.) |
| `@proticom/paperboy-converter/types` | TypeScript types only |

## Image options (OCR)

Images are converted with **Tesseract.js** (local OCR). The first run may download language data; large images can be slow.

```javascript
const result = await convertToMarkdown("scan.png", buffer, {
  image: {
    // default false: opt in to the raw "## Text Positioning" word table
    includeLayoutTable: true,
  },
});
```

OCR text has no heading. A line is kept when its mean word confidence is at
least **60** and it contains a readable token, or at least **60%** of its content
tokens are readable. List prefixes do not count as content tokens. A readable
token needs confidence at least **30** and a word or number shape. Below confidence
60, alphabetic words need at least three letters and lowercase or title case;
short fragments and odd case mixtures do not rescue a line. Numeric shapes
include page numbers, decimals, currency, times and percentages. Accepted lines
keep all words, including uncertain ones. Consecutive rejected lines become one
`<!-- image omitted -->` marker.

Prose wraps join only when the previous line reaches 85% of its paragraph's width,
starts align within 1.5 average character widths, and sentence boundaries and list
prefixes allow continuation. Labels ending in `:`, code, and rows with wide column
gaps keep line breaks. Paragraphs and large vertical gaps produce blank lines.
Within prose, short sentence-final lines followed by aligned uppercase text also
start a paragraph; larger-font headings are separated in the same context.
Confident code statement keywords preserve uncertain code, and adjoining closing
punctuation or single-character misreads stay as read. A lone `|` becomes `I` only
when it is the sole pipe in its line and both adjacent words start lowercase.
Other spelling and punctuation remain unchanged.

The pure parser and cleanup functions are also available at
`@proticom/paperboy-converter/ocr-text`. The browser extension uses this same
module without importing Tesseract or Node APIs into its bundle.

`includeLayoutTable` defaults to **false**, including in web converters using
these options. When enabled, the table lists raw, unfiltered words and confidence
values, up to 300 rows, for debugging.

Injected `ocr` functions may return optional `paragraphs: { lines: { words:
OcrWord[] }[] }[]` alongside `text` and `words`. Non-empty `paragraphs` enables
filtering and reflow. Without that structure (or with an empty array), the
converter preserves trimmed `text` verbatim because legacy `words` lists can be
partial. The optional table still uses `words`.

## Command-line usage

For an interactive CLI (setup, `convert`, `doctor`), see **`@proticom/paperboy-cli`** in the same monorepo.

## Development

```bash
npm install
npm test
npm run build
```

## Publishing to npm (maintainers)

This package uses the **same Proticom / npm setup as [Gnosys](https://github.com/proticom/gnosys)** ([gnosys on npm](https://www.npmjs.com/package/gnosys), [gnosys.ai](https://gnosys.ai)): the **`@proticom`** scope and **OIDC trusted publishing** from GitHub Actions. You do **not** store an **`NPM_TOKEN`** secret for releases (see Gnosys workflow [publish.yml](https://github.com/proticom/gnosys/blob/master/.github/workflows/publish.yml)).

### One-time: Trusted Publisher on npm

In the npm package settings for **`@proticom/paperboy-converter`**, add **this repository** (`proticom/paperboy`) as a [Trusted Publisher](https://docs.npmjs.com/trusted-publishers) (same idea as for Gnosys). Until that is configured, automated publish from Actions will fail.

### Each release

1. Bump **`version`** in `paperboy-converter/package.json` (semver) and commit to `main`.
2. Create and push a **git tag** whose name matches the usual Proticom pattern: **`v` + that version** (example: version `0.2.0` → tag `v0.2.0`).

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. GitHub Actions runs **Publish to npm**: `npm ci`, `npm run build`, `npm test`, then **`npm publish --access public`** from `paperboy-converter/` (OIDC, no long-lived token).

Keep the tag name and `package.json` version in sync so releases are easy to trace.

### After the first successful publish

Point **`paperboy-cli`** at the registry instead of the monorepo path: in `paperboy-cli/package.json` set `"@proticom/paperboy-converter": "^0.1.0"` (use the range you need), run `npm install` in `paperboy-cli/`, commit the updated lockfile, then publish the CLI the same way when you add a matching workflow or tag strategy.

## License

MIT
