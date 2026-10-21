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

OCR text has no heading. Lines with mean word confidence below **60** are omitted
as a whole. Accepted lines keep every word, including uncertain words supported
by their neighbors. A line must also contain a token with at least two consecutive
letters/digits, or a letter-only word with optional trailing punctuation. This
keeps page numbers such as `12` and dates such as `2026 10 20`, while rejecting
lines made only of isolated digits or symbols such as `4`, `=`, or `~~ \`.
Each consecutive omitted region becomes `<!-- image omitted -->`.
Wrapped lines in a Tesseract paragraph join with spaces; paragraphs and large
vertical gaps produce blank lines. A standalone `|` between words containing
letters becomes `I`. Other spelling and punctuation remain unchanged.

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
