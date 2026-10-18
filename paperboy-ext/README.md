# Paperboy Extension (Chrome Side Panel)

Paperboy Extension turns the page you are currently viewing into Markdown.

It opens in Chrome's **side panel** (right side of the browser), so it does not replace your page content or interrupt your layout.

---

## What This Extension Does

1. Reads the active browser tab.
2. Uses Mozilla **Readability** to find the main article/content.
3. Converts that content to Markdown with **Turndown** (+ GFM plugin).
4. Shows the Markdown in a code-style panel with a **Copy** button.

---

## Install in Chrome (Developer Mode)

This project is for developer use, so you load it manually.

### Step 1: Open Chrome Extensions Page

In Chrome, go to:

`chrome://extensions`

### Step 2: Turn on Developer Mode

Toggle **Developer mode** in the top-right corner.

### Step 3: Load the Folder

Click **Load unpacked** and select the `paperboy-ext` folder.

### Step 4: Pin the Extension (optional but helpful)

Click the puzzle icon in Chrome toolbar and pin **Paperboy Extension**.

---

## How to Use It

1. Open any normal website page.
2. Click the Paperboy extension icon.
3. Chrome opens the side panel.
4. Paperboy extracts and converts the page automatically.
5. Click **Copy** to copy Markdown to clipboard.
6. Click **Re-extract** if the page changed and you want a fresh conversion.

---

## Pages That Will Not Work

Some Chrome internal pages block extension content scripts.

Examples:
- `chrome://...` pages
- Chrome Web Store pages

On those pages, Paperboy will show an error message in the side panel.

---

## OCR and network use

English image OCR runs locally, including its first run. The build bundles the
Tesseract worker, WASM engine, and `eng.traineddata.gz` from
`@tesseract.js-data/eng@1.0.0` in `lib/tesseract/`. The package provides
`4.0.0_best_int`, which supports the LSTM engine used here; it does not publish
the previous fast variant.

Language data loads from the extension with gzip enabled and language caching
disabled. OCR needs no remote language downloads. Fetching images from web pages
still needs network access and the existing HTTP/HTTPS host permissions. Once
image bytes are available locally, recognition works offline.

Run `npm install` at the monorepo root, then `npm run build` in `paperboy-ext/`.
The build regenerates `lib/tesseract/` and copies the language data into
`dist/unpacked/`. `npm run package:store` includes the same data in the store zip.
No traineddata binary is committed.

---

## Project Structure

```
paperboy-ext/
  manifest.json
  package.json
  build.js
  background.js
  sidepanel.html
  sidepanel.js
  sidepanel.bundle.js
  styles.css
  lib/
    readability.js
  icons/
```

### File roles (simple explanation)

- `background.js`  
  Handles extension-level events and captures page HTML/title/url by injecting a function into the active tab with `chrome.scripting.executeScript` (the modern replacement for a static content script).

- `sidepanel.js`  
  Converts HTML to Markdown, renders output, persists side-panel prefs via `chrome.storage.local`, and handles copy/re-extract buttons.

---

## Remaining work

These items are **not** finished or **not** polished yet. They are safe to pick up in any order unless noted.

1. **Converter dependency** — Side panel code depends on `@proticom/paperboy-converter` via **`file:../paperboy-converter`** in this monorepo. Run `npm install` from `paperboy-ext/` after cloning; the converter package must be present alongside this folder. When the converter is published to npm, you can point the dependency at the registry version instead.

2. **Chrome Web Store** — Today the flow is **Load unpacked** only. A store release needs listing copy, screenshots, a privacy policy URL (clipboard + broad host access should be explained), versioning discipline, and a repeatable zip/build of the extension folder (without `node_modules`).

3. **Quality gates** — Run `npm test` in `paperboy-ext/` after building to validate local OCR assets, worker options, packaging lists, and MV3 restrictions. Further tests could cover markdown shaping (title / Source / Byline) and messages between the background script and side panel.

4. **Other browsers** — The UI is built around **Chrome’s Side Panel API**. Porting to Firefox or Safari would mean different UI surfaces (popup or sidebar) and different APIs; treat as a separate effort.

---

## Updating Vendored Libraries

Only `lib/readability.js` is vendored. Turndown config now comes from
`@proticom/paperboy-converter` and is bundled into `sidepanel.bundle.js`.

To refresh Readability:

```bash
curl -L "https://unpkg.com/@mozilla/readability/Readability.js" -o "lib/readability.js"
```

When extension code changes, rebuild the side panel bundle:

```bash
npm install
npm run build
```

Then reload the extension in `chrome://extensions`.
