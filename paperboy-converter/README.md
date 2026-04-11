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

The scope **`@proticom`** must exist on npm and your account needs **publish** rights for it.

1. Bump **`version`** in `paperboy-converter/package.json` (semver) and commit to `main`.
2. In the GitHub repo, add secret **`NPM_TOKEN`** (an npm automation token with publish access to `@proticom`).
3. Run the workflow **Publish @proticom/paperboy-converter** (Actions → workflow → Run workflow), or trigger it from a **GitHub Release** publish event.

The workflow runs tests, then **`npm publish --access public`** from `paperboy-converter/`.

**After the first successful publish**, point **`paperboy-cli`** at the registry instead of the monorepo path: in `paperboy-cli/package.json` set `"@proticom/paperboy-converter": "^0.1.0"` (match the version you published), run `npm install` in `paperboy-cli/`, and commit the updated lockfile before publishing the CLI.

## License

MIT
