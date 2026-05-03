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

## Project Structure

```
paperboy-ext/
  manifest.json
  package.json
  build.js
  background.js
  content.js
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
  Handles extension-level events and requests data from the active tab.

- `content.js`  
  Runs inside the web page and captures HTML/title/url.

- `sidepanel.js`  
  Converts HTML to Markdown, renders output, and handles copy/re-extract buttons.

---

## Remaining work

These items are **not** finished or **not** polished yet. They are safe to pick up in any order unless noted.

1. **Permissions cleanup** — `manifest.json` includes the `storage` permission, but the extension code does not use `chrome.storage`. Remove `storage` from the manifest after a quick grep confirms nothing needs it, so the permission prompt stays minimal.

2. **Converter dependency** — Side panel code depends on `@proticom/paperboy-converter` via **`file:../paperboy-converter`** in this monorepo. Run `npm install` from `paperboy-ext/` after cloning; the converter package must be present alongside this folder. When the converter is published to npm, you can point the dependency at the registry version instead.

3. **Chrome Web Store** — Today the flow is **Load unpacked** only. A store release needs listing copy, screenshots, a privacy policy URL (clipboard + broad host access should be explained), versioning discipline, and a repeatable zip/build of the extension folder (without `node_modules`).

4. **Quality gates** — There are no automated tests yet. Useful additions would be small unit tests for the markdown shaping (title / Source / Byline) and/or a dry run of the message types between background, content script, and side panel.

5. **Other browsers** — The UI is built around **Chrome’s Side Panel API**. Porting to Firefox or Safari would mean different UI surfaces (popup or sidebar) and different APIs; treat as a separate effort.

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
