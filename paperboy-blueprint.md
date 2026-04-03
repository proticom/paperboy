# Paperboy — Complete Rebuild Blueprint

This document contains everything needed to rebuild the Paperboy project from scratch. It covers architecture, technical decisions, all source code structure, exact configurations, design system specifications, and implementation details for all four packages.

---

## 1. Project Overview

**Product:** Paperboy — an open-source web-to-markdown utility
**Domain:** paperboy.run
**Support email:** editor@paperboy.run
**Version:** 0.1.0 (all packages)
**License:** paperboy-widget is MIT; others are private

**Mission:** Extract clean markdown from cluttered web pages. The project provides four surfaces for this: a desktop editor, a marketing website, an embeddable widget, and a Chrome extension.

---

## 2. Workspace Layout

```
paperboy/                     ← NOT a git repo, no package.json at root
├── AGENTS.md                 ← Agent context for Cursor IDE
├── .gitignore                ← Only ignores .gnosys/
├── .gnosys/                  ← Gnosys persistent memory store
├── paperboy-app/             ← Tauri desktop editor (own git repo)
├── paperboy-site/            ← Next.js 16 marketing site (own git repo)
├── paperboy-widget/          ← Embeddable script (own git repo)
└── paperboy-ext/             ← Chrome extension (own git repo)
```

This is NOT an npm/pnpm workspace. Each package is independent with its own git history, node_modules, and lockfile. The only shared artifact is the root AGENTS.md. There are no shared npm packages or runtime imports between packages.

---

## 3. Design System

### 3.1 Color Palette

| Token | Light | Dark (app) | Dark (ext/widget) |
|-------|-------|------------|---------------------|
| Ink / Primary | #1A1A1A | #E0E0E0 | #F4F4F4 / #F5F5F5 |
| Paper / Background | #F4F1EA (site), #FFFFFF (app) | #1A1A1A (app), #1C1B18 (preview) | #141414 / #121212 |
| Surface / Muted | #EBE7DD (site), #F5F5F5 (app) | #252525 | #1C1C1C / #1D1D1D |
| Faded / Secondary | #595959 | #AAAAAA | #B6B6B6 |
| Border | #D0D0D0 (app), #1A1A1A (site) | #404040 | #343434 / #363636 |
| Accent (ext/widget only) | #1F4FD6 | — | #78A3FF |

The site uses a **strict monochrome** palette — ink on paper only. The app uses a slightly different gray scale. The extension and widget introduce a blue accent for interactive elements.

### 3.2 Typography

| Role | Font | Used In |
|------|------|---------|
| Headlines & Body (site) | Times New Roman, Times, Georgia, serif | paperboy-site pages |
| Preview pane (app) | Times New Roman, Times, Georgia, serif | paperboy-app preview.css |
| Editor text (app) | Courier Prime (monospace) | paperboy-app editor textarea |
| UI labels & meta | Inter (-apple-system fallback) | All packages |
| Markdown output | Courier Prime, Courier New, monospace | Extension side panel, widget overlay |

**Font files required for paperboy-app** (not committed, stored in src/assets/fonts/):
- CourierPrime-Regular.woff2, CourierPrime-Bold.woff2, CourierPrime-Italic.woff2, CourierPrime-BoldItalic.woff2
- Inter-Regular.woff2, Inter-Medium.woff2, Inter-SemiBold.woff2

**paperboy-site** uses `next/font/google` to load Courier Prime (400, 700) and Inter, exposed as CSS variables `--font-courier-prime` and `--font-inter`.

### 3.3 Design Language

- **Brutalist:** No rounded corners on the site (all radii forced to 0px). No shadows. No gradients except SVG noise texture.
- **Newspaper metaphor:** Multi-column layouts, visible column rules, drop caps, section headers in uppercase tracking-widest, ink-on-paper borders.
- **1-bit halftone imagery:** Images on the site use CSS filters (`grayscale(1) contrast(150%) brightness(1.1)`, `mix-blend-mode: multiply`) plus a radial-gradient dot overlay for a pre-digital printing effect.
- **App controls:** The Tauri app uses pill-shaped toggle groups with a sliding indicator for theme (system/light/dark) and view mode (preview/editor/split).

---

## 4. paperboy-app — Tauri Desktop Editor

### 4.1 Tech Stack

- **Shell:** Tauri v2 (Rust edition 2021)
- **Frontend:** Vanilla HTML/CSS/JS with ES modules — no React, no bundler
- **Markdown engine:** markdown-it with plugins (footnote, deflist, mark, sub, sup, task-lists), loaded as vendored UMD globals
- **Dev server:** Custom Node.js static server (node:http + node:fs)
- **Package name:** paperboy-editor
- **Tauri identifier:** run.paperboy.editor

### 4.2 Tauri Configuration (tauri.conf.json)

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Paperboy",
  "version": "0.1.0",
  "identifier": "run.paperboy.editor",
  "build": {
    "beforeDevCommand": "node scripts/dev-server.mjs",
    "devUrl": "http://127.0.0.1:1420",
    "frontendDist": "../src"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [{
      "label": "main",
      "title": "Paperboy",
      "width": 1200, "height": 800,
      "minWidth": 600, "minHeight": 400,
      "resizable": true,
      "titleBarStyle": "Overlay",
      "hiddenTitle": true,
      "trafficLightPosition": { "x": 12, "y": 17 }
    }]
  },
  "bundle": { "active": true, "targets": "app", "icon": [] }
}
```

Key decisions: `frontendDist: "../src"` means no build step — the static src/ directory IS the app. `withGlobalTauri: true` exposes `window.__TAURI__` for accessing Tauri APIs without import statements.

### 4.3 Rust Backend (src-tauri/src/main.rs)

**Cargo.toml dependencies:** tauri 2, tauri-build 2, serde 1 (with derive), tauri-plugin-dialog 2.

**Data structure:**
```rust
#[derive(Serialize)]
struct FilePayload { path: String, content: String }
```

**Commands (4):**
- `open_file(app)` — opens blocking file dialog, reads file, returns FilePayload
- `read_file(path)` — reads file at given path, returns FilePayload
- `save_file(path, content)` — writes content to path
- `save_file_as(app, content)` — opens save dialog, writes, returns FilePayload

**Menus:** File (New, Open, Save, Save As, Close) + Edit (undo/redo/cut/copy/paste/select all) + View (Preview, Editor, Split, Show Full Path). macOS gets an additional app submenu with About/Services/Hide/Quit.

**Menu events emitted to webview:** menu-new, menu-open, menu-save, menu-save-as, menu-close, menu-view-preview, menu-view-editor, menu-view-split, menu-view-full-path.

**Keyboard accelerators:** Cmd/Ctrl+N (new), Cmd/Ctrl+O (open), Cmd/Ctrl+S (save), Cmd/Ctrl+Shift+S (save as), Cmd/Ctrl+W (close).

**Capabilities (default.json):** core:default, dialog:default — no explicit fs plugin; filesystem access happens inside Rust commands using std::fs.

### 4.4 Frontend Architecture

**Module graph:** index.html loads vendor scripts as globals, then bridge.js as type="module". bridge.js imports editor.js, preview.js, theme.js.

**index.html structure:**
```
<div class="app-shell">
  <header class="header-bar">
    <div class="header-drag-surface" data-window-drag />
    <div class="titlebar-drag">
      <div class="filename" data-filename hidden />
    </div>
    <div class="header-controls">
      <div class="theme-toggle">  <!-- 3 buttons: system, light, dark -->
      <div class="view-toggle">   <!-- 3 buttons: preview, editor, split -->
    </div>
  </header>
  <div class="toolbar" data-toolbar>  <!-- formatting buttons -->
  <main class="content-area" data-view-mode="editor">
    <section class="editor-pane">
      <textarea class="editor" data-editor />
    </section>
    <section class="preview-pane-wrap">
      <article class="preview-pane" data-preview />
    </section>
  </main>
  <footer class="path-footer" data-path-footer hidden>
    <div class="path-footer-text" data-filepath />
  </footer>
</div>
```

**Toolbar buttons and their data attributes:**

| Action | data-action | data-syntax / data-before+after | Shortcut |
|--------|------------|--------------------------------|----------|
| H1 | prefix | `# ` | — |
| H2 | prefix | `## ` | — |
| H3 | prefix | `### ` | — |
| Bold | wrap | `**` / `**` | Cmd+B |
| Italic | wrap | `*` / `*` | Cmd+I |
| Strikethrough | wrap | `~~` / `~~` | Cmd+Shift+X |
| Highlight | wrap | `==` / `==` | — |
| Blockquote | prefixToggle | `> ` | — |
| HR | insert | `\n---\n` | — |
| Bullet List | prefix | `- ` | — |
| Ordered List | prefix | `1. ` | — |
| Task List | prefix | `- [ ] ` | — |
| Inline Code | wrap | `` ` `` / `` ` `` | Cmd+` |
| Code Block | blockWrap | ` ```\n ` / ` \n``` ` | Cmd+Shift+` |
| Link | link | — | Cmd+K |
| Image | image | — | Cmd+Shift+K |
| Table | insert | full table template | — |
| Footnote | footnote | auto-increments `[^N]` | — |
| Superscript | wrap | `^` / `^` | — |
| Subscript | wrap | `~` / `~` | — |

Additional keyboard shortcuts: Tab/Shift+Tab for indent/outdent (2 spaces), Cmd+] and Cmd+[ for indent/outdent.

### 4.5 bridge.js — App Orchestration

**State object:**
```javascript
{ currentFile: null, content: "", savedContent: "", isDirty: false, showFullPath: false, viewMode: "editor", theme: "system" }
```

**Tauri API access pattern:** Extracts from `window.__TAURI__` — core.invoke, window.getCurrentWindow (or webviewWindow.getCurrentWebviewWindow), event.listen, dialog.ask/open/save. All are optional-chained so the app degrades gracefully in a browser without Tauri.

**File operations:**
- `openFile()` — shows file dialog (filters: .md, .markdown), invokes `read_file`, calls `setDocument()`, switches to preview mode
- `newFile()` — calls `setDocument(null, "", true)`, switches to editor mode
- `saveCurrent()` — if no currentFile, delegates to saveAsCurrent(); otherwise invokes `save_file`
- `saveAsCurrent()` — shows save dialog (default: untitled.md), invokes `save_file`
- `maybeProceed(action)` — dirty check with two-step dialog: "Save?" then "Discard?"

**Scroll sync (split mode):** Uses a `lockScroll` mechanism with a 90ms debounce to prevent feedback loops. Editor scroll position maps to preview position via source-line data attributes, and vice versa.

**Window drag:** Elements with `[data-window-drag]` attribute trigger `currentWindow.startDragging()` on pointerdown (excluding interactive children).

### 4.6 editor.js — Textarea + Toolbar

**Exports:** `initEditor(textarea, toolbar)` returns `{ getContent, getLineCount, getTopSourceLine, onChange, onScroll, scrollToSourceLine, setContent }`.

**formatAction(textarea, actionType, options)** — dispatches to:
- `wrapSelection` — wraps selected text or inserts placeholder with markers
- `prefixLines` — prepends prefix to selected lines
- `indentLines` — adds/removes leading spaces
- `replaceRange` — inserts snippet at cursor
- `insertFootnote` — auto-increments footnote IDs by scanning existing `[^N]` references
- `appendHeadingId` — appends `{#custom-id}` to heading line

**Line height calculation:** `parseFloat(computedStyle.lineHeight) || parseFloat(computedStyle.fontSize) * 1.6 || 22`

### 4.7 preview.js — Markdown Rendering + Scroll Mapping

**markdown-it configuration:**
```javascript
markdownit({ html: false, linkify: true, typographer: true })
  .use(markdownitFootnote).use(markdownitDeflist).use(markdownitMark)
  .use(markdownitSub).use(markdownitSup)
  .use(markdownitTaskLists, { enabled: true })
```

**Source line mapping:** A custom core ruler `source_line_attrs` adds `data-source-line` and `data-source-end-line` attributes to opening tokens that have a `.map` property. This enables scroll sync between editor and preview.

**Scroll position math:** `lineToScrollTop` and `scrollTopToLine` use a snapshot of all `[data-source-line]` elements, interpolating between block positions for smooth mapping.

### 4.8 theme.js — Theme + View Mode State

**Theme toggle:** Three states: system, light, dark. Stored in `localStorage` as `paperboy-theme`. Applied via `data-theme` attribute on `<html>`.

**View mode toggle:** Three states: preview, editor, split. Applied via `data-view-mode` attribute on `.content-area`. Toolbar hidden in preview mode.

**Pill animation:** CSS `transform: translateX(calc(var(--active-index) * var(--toggle-width)))` with 160ms ease transition.

### 4.9 CSS Design Tokens (app.css)

**Light theme:** bg-primary #FFFFFF, bg-secondary #F5F5F5, bg-tertiary #E8E8E8, text-primary #1A1A1A, text-secondary #555555, text-muted #888888, border-color #D0D0D0, border-strong #999999, accent #333333, toolbar-bg #FAFAFA, editor-bg #FFFFFF, selection #D0D0FF.

**Dark theme:** bg-primary #1A1A1A, bg-secondary #252525, bg-tertiary #333333, text-primary #E0E0E0, text-secondary #AAAAAA, text-muted #777777, border-color #404040, border-strong #666666, accent #CCCCCC, toolbar-bg #222222, editor-bg #1E1E1E, selection #3A3A5A.

**Layout:** titlebar-height 34px, traffic-lights-space 78px, toggle-width 24px, toggle-height 20px. Header uses 3-column grid. Content area uses CSS grid switching between `1fr` and `1fr 1fr` for split mode. On narrow screens (<900px), split view stacks vertically.

### 4.10 Preview CSS (preview.css)

**Preview pane:** Background #F4F1EB (warm off-white), ink #1A1A1A, font Times New Roman serif, line-height 1.65, padding 3rem 2.5rem, max-width 72ch per element.

**Dark preview:** Background #1C1B18, ink #D4CFC5, faded #8A8578, rules #3A3830.

**Heading styles:** H1 has 2px bottom border, uppercase, letter-spacing 0.05em. H2 has 1px bottom border. Table headers are uppercase with letter-spacing.

### 4.11 Dev Server (scripts/dev-server.mjs)

Minimal Node.js static server: listens on 127.0.0.1:1420, serves files from `src/`, handles MIME types for .css, .html, .js, .json, .svg, .woff2. Path traversal protection via normalize + startsWith check.

### 4.12 Vendor Sync (scripts/sync-vendor.mjs)

Copies 7 files from node_modules dist directories into src/scripts/vendor/. Note: markdown-it-deflist output is named `.js` (not `.min.js`) while the source is the `.min.js` build.

---

## 5. paperboy-site — Next.js Marketing Site

### 5.1 Tech Stack

- **Framework:** Next.js 16.2.1 (App Router)
- **React:** 19.2.4
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS v4 with @tailwindcss/postcss
- **Design system:** @proticom/ui (local file: dependency)
- **Toasts:** sonner
- **Utilities:** clsx + tailwind-merge (cn function)
- **Declared but unused:** react-hook-form, @hookform/resolvers, @tanstack/react-table, framer-motion, lucide-react, recharts, zod, class-variance-authority, @supabase/ssr, @supabase/supabase-js

### 5.2 Configuration Files

**next.config.ts:**
```typescript
const nextConfig: NextConfig = { transpilePackages: ["@proticom/ui"] };
```

**tailwind.config.ts:**
```typescript
import { proticomPreset } from "@proticom/ui/styles/tailwind-preset";
const config: Config = {
  presets: [proticomPreset],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}", "./node_modules/@proticom/ui/dist/**/*.{js,mjs}"]
};
```

**tsconfig.json:** Target ES2017, module esnext, moduleResolution bundler, path alias `@/*` maps to project root.

**postcss.config.mjs:** Single plugin `@tailwindcss/postcss`.

### 5.3 Proticom UI Integration

The @proticom/ui library is linked locally via `file:../../../../dev/projects/proticom-saas-library`. Integration points:

1. **BrandProvider** wraps the app in layout.tsx
2. **brand.ts** defines BrandConfig with Paperboy colors, fonts, auth settings
3. **tailwind.config.ts** uses proticomPreset
4. **globals.css** imports `@proticom/ui/styles` and overrides all brand CSS variables to force monochrome/brutalist appearance
5. **CookiePolicyPage** from `@proticom/ui/components/legal` is used on /cookies

**Known build blocker:** Turbopack cannot resolve @proticom/ui sub-paths. Likely needs a fresh build of the proticom library.

### 5.4 Global CSS (globals.css)

**Tailwind v4 setup:**
```css
@import "tailwindcss";
@config "../tailwind.config.ts";
@source "./**/*.{ts,tsx}";
@source "../components/**/*.{ts,tsx}";
@source "../lib/**/*.{ts,tsx}";
@source "../../node_modules/@proticom/ui/dist/**/*.{js,mjs}";
@import "@proticom/ui/styles";
```

**Custom theme tokens:** --color-ink (#1A1A1A), --color-paper (#F4F1EA), --color-surface (#EBE7DD), --color-faded (#595959). Font families: --font-headline and --font-body (Times New Roman), --font-mono (Courier Prime), --font-ui (Inter).

**Proticom variable overrides:** Maps all --brand-color-* variables to ink/paper values. Forces all radii to 0px and shadows to none.

**Body background:** SVG noise texture via inline data URI (fractalNoise filter, opacity 0.04) for newsprint effect.

**Newspaper columns:** `.newspaper-cols` uses CSS columns (3 at desktop, 2 at 1024px, 1 at 640px) with 2rem gap and ink column-rule.

**Drop cap:** `.drop-cap::first-letter` floats left at 64px, font-weight 900, headline font.

**Dither effect:** `.dither-image` applies grayscale + high contrast + brightness CSS filters with multiply blend mode. `.dither-wrapper` has white background and a ::after pseudo-element with radial-gradient dot pattern (4px grid) at overlay blend mode.

### 5.5 Root Layout (app/layout.tsx)

Loads Courier Prime (400, 700) and Inter as next/font/google with CSS variable output. Wraps children in BrandProvider with brand config. Includes Sonner Toaster positioned bottom-right with newspaper-styled toast classes (font-ui, uppercase, tracking-widest, ink background, paper text, no rounded corners).

**Metadata:** title "Paperboy.run | Open Source Markdown Utility", description about web-to-markdown.

### 5.6 Routes

**/ (app/page.tsx) — Front Page:**
3-column responsive grid (3/6/3 on md+). Left column: UploadButton, Sections nav (links to /, /classifieds, /cookies with hover invert effect), weather blurb. Center column: Hero headline "THE PAPERBOY COMETH", byline, DitherImage of printing press (Unsplash), newspaper-columns body text with drop cap. Right column: Two article teasers with "PAGE A2"/"PAGE A3" references, classifieds notice.

**Content tone:** The site copy is written in-character as a newspaper. Headlines are ALL CAPS. Bylines read "BY THE EDITORIAL BOARD". Teasers reference page numbers. The weather section is atmospheric ("Foggy. Overcast. High of 52°. Visibility low.").

**/classifieds (app/classifieds/page.tsx) — Settings:**
Client component with three toggle states: darkRoom (CSS invert filter on entire page), largePrint (increases font size to 1.125rem), dither (toggle for image processing — declared but not wired to visuals). Uses CSS columns (1-4 responsive). Each setting is presented as a ClassifiedAd with a text-based checkbox (`[X]` / `[ ]`). Also includes flavor classified entries (Help Wanted, For Sale, Public Notice, Personal, Lost & Found, Services) written in newspaper voice.

**ClassifiedAd component** (local): Bordered box with uppercase bold title and body text.
**Checkbox component** (local): Button with monospace `[X]`/`[ ]` label, hover inverts ink/paper.

**/cookies (app/cookies/page.tsx):**
Renders CookiePolicyPage from @proticom/ui with Paperboy branding. Page label "Lifestyle & Leisure", policy title "THE NINE FAMILY FAVORITES", humorous policy message about cookies. Back link to front page.

### 5.7 Components

**Masthead.tsx** (server component):
Formats current date in uppercase US long format. Renders "THE PAPERBOY" in massive headline font (6xl-[7rem] responsive), followed by a bordered info bar with "ISSUE NO. 1", "DEDICATED TO THE FUNKY DITTY" (hidden on mobile), and the date.

**UploadButton.tsx** (client component):
Three states: idle (solid ink button "Open Local File"), loading (pulsing "RECEIVING TELEGRAPH..." in mono), error ("ERR: PRESS STOPPED" in heavy border). Loading simulates a 2s delay then shows a sonner toast "Dispatch loaded successfully."

**DitherImage.tsx** (server component):
Wraps an `<img>` in a `.dither-wrapper` div and applies `.dither-image` class. Accepts all standard img attributes plus containerClassName.

**lib/utils.ts:**
```typescript
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
```

### 5.8 Brand Configuration (brand.ts)

```typescript
export const brand: BrandConfig = {
  name: "Paperboy.run",
  domain: "paperboy.run",
  logo: "", logomark: "", favicon: "/favicon.ico",
  colors: {
    primary: "#1A1A1A", primaryForeground: "#F4F1EA",
    background: "#F4F1EA", foreground: "#1A1A1A",
    muted: "#EBE7DD", mutedForeground: "#595959",
    destructive: "#1A1A1A", border: "#1A1A1A"
  },
  fonts: { sans: "Inter", mono: "Courier Prime" },
  social: { twitter: null, github: null, linkedin: null },
  support: { email: "editor@paperboy.run", docs: "https://paperboy.run/docs" },
  auth: {
    providers: [],
    methods: { password: true, magicLink: false, passkeys: false, phone: false },
    enableWaitlist: false, enableInviteOnly: false
  }
};
```

---

## 6. paperboy-widget — Embeddable Script

### 6.1 Tech Stack

- **Language:** Vanilla JavaScript (no framework)
- **Bundler:** esbuild (IIFE, es2020, minified)
- **Dependencies:** turndown ^7.2.2, turndown-plugin-gfm ^1.0.2
- **Output:** dist/paperboy-widget.min.js (single file, ~self-contained)
- **Module type:** CommonJS (package.json `type: "commonjs"`)

### 6.2 Build Configuration (build.js)

```javascript
{
  entryPoints: ["src/widget.js"],
  outfile: "dist/paperboy-widget.min.js",
  bundle: true, platform: "browser", format: "iife",
  target: ["es2020"], minify: true, sourcemap: false, legalComments: "none",
  banner: { js: "/*! paperboy-widget v0.1.0 */" }
}
```

Watch mode: `node build.js --watch` uses `esbuild.context().watch()`.

### 6.3 Embedding API

```html
<script src="/path/to/paperboy-widget.min.js"></script>
<!-- With options: -->
<script src="/path/to/paperboy-widget.min.js" data-selector="#main-content" data-default-view="md"></script>
```

**data-selector:** CSS selector for the content element to convert. Without it, the widget auto-detects: tries `main`, then `article`, then elements between `header` and `footer`, then most body children.

**data-default-view:** "md" to start in markdown mode, otherwise starts in web mode (or uses localStorage preference).

**Double-load guard:** `window.__paperboyWidgetLoaded` prevents reinitialization.

### 6.4 Turndown Configuration (turndown-config.js)

```javascript
new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" })
  .use(gfm)
  .addRule("removeScriptLikeTags", { filter: SCRIPT|STYLE|NOSCRIPT, replacement: "" })
```

### 6.5 Widget UI (widget.js)

**DOM structure created:** A fixed-position toggle pill (bottom-right, z-index 2147483646) with Web and Markdown icon buttons, plus a full-viewport overlay (z-index 2147483645) containing a status message bar, a pre element for markdown output, and a copy button.

**View switching:** Markdown mode: converts target nodes' outerHTML via Turndown, hides original nodes (saves display values in a Map), shows overlay. Web mode: restores nodes, hides overlay.

**Generated markdown format:**
```
# {document.title}

Source: {window.location.href}

{converted body}
```

**Clipboard:** Uses navigator.clipboard.writeText. Shows "Copied" with check icon for 2 seconds.

**localStorage:** Saves view preference under key `paperboy-view`.

### 6.6 Widget CSS (styles.js)

All classes prefixed with `pbw-`. CSS variables on :root with dark mode media query override. Toggle pill uses 24x24px buttons with SVG icons. Overlay has 98% opacity background, 1000px max-width panel, Courier Prime monospace output at 12px/1.55 line-height. Light: warm off-white (#F5F5F3), dark: near-black (#121212).

---

## 7. paperboy-ext — Chrome Extension

### 7.1 Architecture

Chrome Manifest V3 side panel extension. No package.json — all third-party code is vendored in lib/.

**Message flow:**
1. sidepanel.js sends `paperboy:request-page-data` to background.js
2. background.js forwards `paperboy:extract-page-data` to content.js in the active tab
3. content.js captures `document.documentElement.outerHTML` + metadata and responds synchronously
4. Side panel parses HTML with DOMParser, runs Readability, converts with Turndown

### 7.2 Manifest (manifest.json)

```json
{
  "manifest_version": 3,
  "name": "Paperboy Extension",
  "version": "0.1.0",
  "minimum_chrome_version": "114",
  "permissions": ["sidePanel", "activeTab", "tabs", "storage", "clipboardWrite"],
  "host_permissions": ["<all_urls>"],
  "action": { "default_title": "Open Paperboy side panel" },
  "background": { "service_worker": "background.js" },
  "side_panel": { "default_path": "sidepanel.html" },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle" }],
  "icons": { "16": "icons/icon-16.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" }
}
```

Note: `storage` permission is declared but unused in current code.

### 7.3 background.js

Configures side panel to open on action click. Handles `paperboy:request-page-data` messages: gets active tab, forwards `paperboy:extract-page-data` to it, relays response back to side panel. Returns `true` from onMessage to keep async channel open.

### 7.4 content.js

Listens for `paperboy:extract-page-data`. Returns `{ ok: true, data: { html, title, url, lang, capturedAt } }` synchronously (returns `false` from onMessage).

### 7.5 sidepanel.js

**Readability config:** `charThreshold: 40, keepClasses: false, nbTopCandidates: 5`. Falls back to body.innerHTML if Readability finds no content.

**Turndown config:** Same as widget — atx headings, fenced code, dash bullets, asterisk emphasis, GFM plugin (optional-chained), removeScriptLikeTags rule.

**Generated markdown format:**
```
# {title}

Source: {url}

Byline: {byline}    ← only if present

{converted body}
```

**UI:** Header with title "Paperboy" + subtitle "Web page to markdown". Two action buttons (Re-extract, Copy) with SVG icons. Status bar with data-state coloring (idle, loading, success, error). Scrollable pre element for output.

**Auto-extract:** `extractCurrentPage()` runs on load — the side panel automatically processes the current tab when opened.

### 7.6 sidepanel.html

Loads scripts in order: lib/readability.js, lib/turndown.js, lib/turndown-plugin-gfm.js, sidepanel.js. No build step.

### 7.7 Vendored Libraries (lib/)

Updated via curl from unpkg.com:
```bash
curl -L "https://unpkg.com/turndown/dist/turndown.js" -o "lib/turndown.js"
curl -L "https://unpkg.com/turndown-plugin-gfm/dist/turndown-plugin-gfm.js" -o "lib/turndown-plugin-gfm.js"
curl -L "https://unpkg.com/@mozilla/readability/Readability.js" -o "lib/readability.js"
```

### 7.8 Extension CSS (styles.css)

CSS variables prefixed with `--pb-`. Light: bg #F7F7F5, surface #FFFFFF, ink #101010, accent #1F4FD6. Dark: bg #141414, surface #1C1C1C, ink #F5F5F5, accent #78A3FF. Inter font stack. Action buttons have accent-colored hover states. Error state uses red (#C93F3F). Markdown output uses Courier Prime at 12px/1.55.

---

## 8. Shared Patterns Across Packages

### 8.1 Turndown Configuration

All packages using Turndown share identical config: `headingStyle: "atx"`, `codeBlockStyle: "fenced"`, `bulletListMarker: "-"`, `emDelimiter: "*"`. All apply the GFM plugin. All add the `removeScriptLikeTags` rule that filters SCRIPT, STYLE, and NOSCRIPT elements.

### 8.2 Markdown Output Format

Both widget and extension generate markdown with: `# {title}`, blank line, `Source: {url}`, blank line, body. The extension additionally includes `Byline: {byline}` when available from Readability.

### 8.3 Icon Convention

All packages use inline SVG icons (stroke-based, viewBox 0 0 24 24, stroke-width 2, round linecap/linejoin). No icon library is imported — all SVGs are inlined in HTML or JS template strings. The site is the exception: it uses no SVG icons in its current pages (the Unsplash image is the only external asset).

### 8.4 Clipboard Pattern

All packages that copy markdown use `navigator.clipboard.writeText()` with a 2-second "Copied" feedback state that swaps the copy icon for a check icon, then reverts.

---

## 9. Development Commands Reference

| Package | Command | What it does |
|---------|---------|-------------|
| paperboy-app | `npm install` | Install JS dependencies |
| paperboy-app | `npm run sync:vendor` | Copy markdown-it UMD builds to src/scripts/vendor/ |
| paperboy-app | `npm run dev:web` | Start dev server at http://127.0.0.1:1420 |
| paperboy-app | `npx tauri dev` | Start full desktop app (runs dev server + opens WebView) |
| paperboy-app | `npx tauri build` | Create release build (.app bundle) |
| paperboy-site | `npm run dev` | Start Next.js dev server at http://localhost:3000 |
| paperboy-site | `npm run build` | Production build |
| paperboy-site | `npm run start` | Serve production build |
| paperboy-site | `npm run lint` | Run ESLint |
| paperboy-widget | `npm install` | Install dependencies |
| paperboy-widget | `npm run build` | Build dist/paperboy-widget.min.js |
| paperboy-widget | `npm run build:watch` | Watch mode build |
| paperboy-ext | — | No build step. Load unpacked in chrome://extensions |

---

## 10. Known Issues and Status

1. **paperboy-site build blocker:** Turbopack cannot resolve @proticom/ui sub-paths. Suspected fix: rebuild the proticom library so its dist matches its exports map.
2. **paperboy-ext storage permission:** Declared in manifest but unused by any code — could be removed or is reserved for future features.
3. **paperboy-app fonts not committed:** The .woff2 files needed for Courier Prime and Inter are not in git. The app works without them but uses fallback fonts.
4. **Unused site dependencies:** Multiple npm packages declared but not imported anywhere in source code.
5. **No cross-package shared code:** Each package vendors its own copy of Turndown/markdown-it. A shared package could reduce duplication but would add coupling.
