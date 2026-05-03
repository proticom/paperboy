# Paperboy Widget (Embeddable Script)

Paperboy Widget adds a small **web / markdown toggle** to any website.

When users switch to Markdown view, the widget:
- Converts the page content to Markdown
- Shows it in a code-style panel
- Lets users copy it with one click

---

## Quick Start

Build the widget first:

```bash
npm install
npm run build
```

Then include `dist/paperboy-widget.min.js` on your site:

```html
<script src="/path/to/paperboy-widget.min.js"></script>
```

That is enough for basic usage.

---

## Recommended Usage (Choose Exactly What to Convert)

For best results, tell the widget which part of the page is the main content.

```html
<script src="/path/to/paperboy-widget.min.js" data-selector="#main-content"></script>
```

`data-selector` should be any valid CSS selector:
- `#main-content`
- `.article-body`
- `main`

If `data-selector` is not provided, Paperboy tries this order:
1. `main`
2. `article`
3. Elements between `header` and `footer`
4. Most body children as fallback

---

## Options

### `data-selector`

Defines exactly which DOM element to convert.

Example:

```html
<script src="/path/to/paperboy-widget.min.js" data-selector="main"></script>
```

### `data-default-view`

Optional default view mode:
- `web`
- `md`

Example:

```html
<script
  src="/path/to/paperboy-widget.min.js"
  data-selector="#main-content"
  data-default-view="md"
></script>
```

---

## Features

- **Web / Markdown toggle** with animated pill indicator
- **One-click copy** with 2-second "Copied" feedback
- **Light and dark theme** via `prefers-color-scheme`
- **Minimize / restore** — users can collapse the toggle to a small button
- **Keyboard accessible** — Escape closes the overlay, focus is trapped while open
- **Mobile friendly** — tap targets meet 36px minimum, layout adjusts for small screens
- **View persistence** — chosen view and collapsed state saved in `localStorage`
- **No host page conflicts** — CSS variables scoped to widget elements only

---

## Build From Source

Install dependencies:

```bash
npm install
```

Build once:

```bash
npm run build
```

Build in watch mode while developing:

```bash
npm run build:watch
```

Output file:

`dist/paperboy-widget.min.js`

---

## Tests

Run tests:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

---

## How It Works

1. Widget injects a small toggle pill in the bottom-right corner.
2. User picks **Web** or **Markdown**.
3. In Markdown mode, widget converts selected HTML to Markdown using Turndown + GFM plugin.
4. Widget shows a centered `<pre>` block with a **Copy** button.
5. View choice is remembered in `localStorage` (`paperboy-view`).
6. The toggle can be minimized to a small restore button (also remembered).

---

## Project Structure

```
paperboy-widget/
  src/
    widget.js          Entry point, UI, DOM, event handling
    turndown-config.js Turndown setup with shared conventions
    styles.js          Scoped CSS for all widget elements
  tests/
    turndown-config.test.js
  dist/
    paperboy-widget.min.js
  build.js             esbuild bundler script
  vitest.config.js     Test configuration
  package.json
```
