# @proticom/paperboy-converter

Turn many common document and image formats into **Markdown** in Node.js. This package powers the [Paperboy](https://github.com/proticom/paperboy) CLI, desktop app, browser extension, and widget; you can also use it directly in your own scripts and servers.

## Install

```bash
npm install @proticom/paperboy-converter
```

Requires **Node.js 20 or newer**.

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

## Image options (OCR and optional description)

Images are converted with **Tesseract.js** (local OCR). The first run may download language data; large images can be slow.

```javascript
const result = await convertToMarkdown("scan.png", buffer, {
  image: {
    // default true: adds a "## Text Positioning" markdown table
    includeLayoutTable: true,

    // Optional: you call your own vision/LLM API and return a string (or null to skip)
    describeImage: async ({
      filename,
      fileBytes,
      imageMimeType,
      ocrText,
      words,
    }) => {
      // Example: return null to skip AI entirely
      return null;
    },
  },
});
```

The library does **not** bundle OpenAI, Ollama, or other remote models. If you pass **`describeImage`**, you implement it (your API keys, your network policy).

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
