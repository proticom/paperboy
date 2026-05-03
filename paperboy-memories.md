# Paperboy — Atomic Memories for Gnosys Import

Each `## Memory` section below is one atomic memory.

---

## Memory: Project Identity

Paperboy is an open-source web-to-markdown utility. The domain is paperboy.run. The support email is editor@paperboy.run. The project version across all packages is 0.1.0. The overall mission is extracting clean markdown from cluttered web pages.

---

## Memory: Workspace Structure

The Paperboy workspace is a multi-package folder (not an npm/pnpm workspace). Each product lives in its own directory. The four packages are: paperboy-app (Tauri desktop editor), paperboy-site (Next.js marketing site), paperboy-widget (embeddable script), and paperboy-ext (Chrome extension). Each subfolder is its own git repository. The root folder itself is not a git repo.

---

## Memory: Shared Technology Choices

All four Paperboy packages use markdown-it or Turndown for markdown processing. The font stack is Courier Prime (monospace) and Inter (UI sans-serif). The design language is brutalist, monochrome, and newspaper-inspired. The color palette is ink (#1A1A1A) on paper (#F4F1EA).

---

## Memory: paperboy-app Overview

paperboy-app is a Tauri v2 desktop markdown editor. The npm package name is paperboy-editor. The Tauri identifier is run.paperboy.editor. It provides a plain text editor pane, a styled newspaper-like preview pane, and native Open/Save/Save As dialogs. It has three view modes: editor only, preview only, and split view. It supports system/light/dark themes.

---

## Memory: paperboy-app Tech Stack

paperboy-app uses Tauri 2 (Rust backend, WebView frontend). The frontend is vanilla HTML/CSS/JS with ES modules — no React, no Vue, no bundler. Markdown rendering uses markdown-it loaded as vendored UMD scripts (not npm imports). Plugins include: footnote, deflist, mark, sub, sup, and task-lists. The dev server is a custom Node.js static file server on port 1420.

---

## Memory: paperboy-app Dev Commands

In the paperboy-app directory: `npm install` downloads JS dependencies. `npm run sync:vendor` copies markdown-it UMD builds from node_modules into src/scripts/vendor/. `npx tauri dev` launches the full desktop app. `npm run dev:web` starts the web-only dev server at http://127.0.0.1:1420. `npx tauri build` creates a release build.

---

## Memory: paperboy-app File Layout

paperboy-app source files: src/index.html is the shell that loads CSS and scripts. src/scripts/bridge.js orchestrates the app (file operations, menu listeners, state, scroll sync). src/scripts/editor.js handles the textarea, toolbar, and formatting shortcuts. src/scripts/preview.js builds the markdown-it renderer with source-line mapping for scroll sync. src/scripts/theme.js manages theme toggle and view mode. src/styles/app.css is the app chrome styling. src/styles/preview.css is the newspaper preview pane styling.

---

## Memory: paperboy-app Rust Backend

The Tauri backend is in src-tauri/. The main Rust file (src/main.rs) defines four commands: open_file, read_file, save_file, save_file_as. It creates native menus and emits events to the webview: menu-new, menu-open, menu-save, menu-save-as, menu-close, menu-view-preview, menu-view-editor, menu-view-split, menu-view-full-path. The Cargo.toml declares the package as paperboy-editor with tauri 2, serde, and tauri-plugin-dialog.

---

## Memory: paperboy-app Tauri Configuration

tauri.conf.json sets: productName "Paperboy", devUrl http://127.0.0.1:1420, frontendDist "../src" (no bundler — ships static src/ directory), withGlobalTauri true (exposes window.__TAURI__), titleBarStyle "Overlay" with hidden title on macOS, traffic light position at (12, 17), default window 1200x800, min 600x400. Capabilities allow core:default and dialog:default only.

---

## Memory: paperboy-app Vendor Sync

The sync:vendor script (scripts/sync-vendor.mjs) copies these files from node_modules into src/scripts/vendor/: markdown-it.min.js, markdown-it-footnote.min.js, markdown-it-deflist.js, markdown-it-mark.min.js, markdown-it-sub.min.js, markdown-it-sup.min.js, markdown-it-task-lists.min.js. These are loaded as global script tags in index.html rather than via import statements.

---

## Memory: paperboy-app Font Requirements

paperboy-app requires .woff2 font files in src/assets/fonts/: CourierPrime-Regular, CourierPrime-Bold, CourierPrime-Italic, CourierPrime-BoldItalic, Inter-Regular, Inter-Medium, Inter-SemiBold. These are not committed to git (only a .gitkeep exists). The app runs without them but the intended typography will look wrong.

---

## Memory: paperboy-site Overview

paperboy-site is the marketing and landing page for Paperboy.run. It is a Next.js 16 (App Router) application using React 19. It presents a brutalist, 90s-era monochrome newspaper broadsheet layout. It currently has three routes: / (front page), /classifieds (settings), and /cookies (legal/cookie policy).

---

## Memory: paperboy-site Tech Stack

paperboy-site uses: Next.js 16.2.1, React 19.2.4, Tailwind CSS v4 with @tailwindcss/postcss, the @proticom/ui design system (linked locally via file: reference), framer-motion, lucide-react, sonner for toasts, clsx + tailwind-merge for class utilities, zod for validation, react-hook-form with @hookform/resolvers, @tanstack/react-table, and recharts. TypeScript 5 is the language.

---

## Memory: paperboy-site Proticom Integration

paperboy-site depends on @proticom/ui linked locally at file:../../../../dev/projects/proticom-saas-library. The integration uses: BrandProvider wrapper in root layout, brand.ts config file mapping Paperboy colors, proticomPreset in tailwind.config.ts, and CSS variable overrides in globals.css to flatten the modern UI into brutalist monochrome (zero radii, no shadows). The transpilePackages config in next.config.ts includes @proticom/ui.

---

## Memory: paperboy-site Build Blocker

As of the handoff report, paperboy-site has module resolution errors preventing compilation. Turbopack cannot resolve @proticom/ui sub-paths: @proticom/ui/styles/tailwind-preset, @proticom/ui/components/legal, @proticom/ui/components/shared/brand-provider. The suspected cause is the library's dist files not matching its exports map. A fresh build of the proticom library may fix it.

---

## Memory: paperboy-site Brand Config

brand.ts defines the BrandConfig for @proticom/ui: name "Paperboy.run", domain "paperboy.run", primary color #1A1A1A, background #F4F1EA, muted #EBE7DD, mutedForeground #595959, fonts sans "Inter" and mono "Courier Prime", support email editor@paperboy.run, docs at https://paperboy.run/docs. Auth is configured for password only, no magic link, no passkeys, no phone.

---

## Memory: paperboy-site Design Rules

Strict design constraints for the site: monochrome/brutalist only using CSS variables --color-ink, --color-paper, --color-surface, --color-faded. Typography: Times New Roman for headers and body (font-headline, font-body), Courier Prime for mono (font-mono), Inter for UI (font-ui). Use uppercase/tracking-widest for labels. Layout uses explicit visible borders mimicking printed columns. CSS column layouts (.newspaper-cols) for text flow. Images must always use the DitherImage component or .dither-image/.dither-wrapper classes for 1-bit halftone look.

---

## Memory: paperboy-site Components

Three custom components in paperboy-site: Masthead.tsx (server component, displays newspaper masthead with title, issue number, today's date), UploadButton.tsx (client component, simulates telegraph-style loading with toast notification), DitherImage.tsx (wraps img tags with dither CSS classes for halftone effect). Utility: lib/utils.ts exports cn() combining clsx and tailwind-merge.

---

## Memory: paperboy-site Supabase Status

paperboy-site has @supabase/ssr and @supabase/supabase-js in package.json dependencies, but there are zero imports or references to Supabase in any source file. The dependencies are declared but not yet integrated into the application code.

---

## Memory: paperboy-site Unused Dependencies

Several dependencies in paperboy-site's package.json have no imports in current source files: @hookform/resolvers, react-hook-form, @tanstack/react-table, framer-motion, lucide-react, recharts, zod, class-variance-authority. These may be for planned future features or transitive requirements of @proticom/ui.

---

## Memory: paperboy-widget Overview

paperboy-widget is an embeddable script that adds a web/markdown toggle to any website. When toggled to markdown mode, it converts the page content using Turndown + GFM plugin, shows it in a full-viewport overlay with a copy button. The view preference persists in localStorage under the key "paperboy-view". It is licensed MIT.

---

## Memory: paperboy-widget Tech Stack

paperboy-widget is built with vanilla JavaScript (no framework). It uses turndown (^7.2.2) for HTML-to-markdown conversion and turndown-plugin-gfm (^1.0.2) for GitHub Flavored Markdown support. The build tool is esbuild (^0.27.4), configured to produce a single IIFE bundle at dist/paperboy-widget.min.js targeting es2020, minified, no sourcemap.

---

## Memory: paperboy-widget Build and Embed

Build commands: `npm run build` produces dist/paperboy-widget.min.js. `npm run build:watch` watches for changes. To embed: add a script tag pointing to the built file. Optional data attributes: data-selector (CSS selector for content to convert, e.g. "#main-content"), data-default-view ("md" or "web"). Double-inclusion is guarded by window.__paperboyWidgetLoaded.

---

## Memory: paperboy-widget Source Files

Three source files: src/widget.js is the entry point (UI creation, DOM targeting, view toggling, clipboard copy, localStorage persistence). src/turndown-config.js creates a configured TurndownService with GFM plugin and a custom rule to strip script/style/noscript tags. src/styles.js exports PAPERBOY_WIDGET_STYLE, a CSS string with pbw-prefixed class names, fixed positioning at z-index 2147483646, and light/dark mode via CSS variables.

---

## Memory: paperboy-widget Content Detection

When no data-selector is provided, the widget tries to find content in this order: 1) main element, 2) article element, 3) sibling elements between header and footer, 4) most document.body children as fallback. Script tags, the widget's own toggle, and overlay elements are excluded from conversion.

---

## Memory: paperboy-ext Overview

paperboy-ext is a Chrome MV3 browser extension that converts the current page to markdown in a side panel. It reads the active tab's HTML, runs Mozilla Readability to extract the main article, then converts to markdown with Turndown + GFM. It has no package.json — all libraries are vendored in the lib/ folder.

---

## Memory: paperboy-ext Architecture

The extension uses three-layer message passing: sidepanel.js sends a REQUEST_PAGE_DATA message to background.js, which forwards an EXTRACT_PAGE_DATA message to the active tab's content.js. Content.js captures document.documentElement.outerHTML plus metadata (title, url, lang, capturedAt) and responds synchronously. The side panel then parses the HTML with DOMParser, runs Readability, and converts with Turndown.

---

## Memory: paperboy-ext Manifest

manifest.json: MV3, name "Paperboy Extension", version 0.1.0, minimum_chrome_version 114. Permissions: sidePanel, activeTab, tabs, storage (unused), clipboardWrite. Host permissions: <all_urls>. Service worker: background.js. Side panel default_path: sidepanel.html. Content script: content.js on all URLs at document_idle. Icons: 16/48/128 PNGs.

---

## Memory: paperboy-ext Vendored Libraries

Three vendored libraries in paperboy-ext/lib/: readability.js (Mozilla Readability, ~2786 lines, article extraction), turndown.js (TurndownService IIFE, ~976 lines, HTML-to-markdown), turndown-plugin-gfm.js (~165 lines, GFM tables/strikethrough/task lists). These are refreshed via curl from unpkg.com, not via npm.

---

## Memory: paperboy-ext Readability Config

The side panel's Readability configuration: charThreshold 40, keepClasses false, nbTopCandidates 5. If Readability returns no content, the extension falls back to using document.body.innerHTML. The generated markdown includes a title heading, source URL, optional byline, then the article body.

---

## Memory: paperboy-ext Limitations

The extension cannot read chrome:// pages, Chrome Web Store pages, or other restricted URLs where content scripts are blocked. On those pages, chrome.runtime.lastError triggers and the side panel shows an error message. The storage permission is declared in the manifest but not used by any current code.

---

## Memory: Cross-Package Relationships

The four Paperboy packages share the product name and mission (web-to-markdown) but have no shared npm packages or runtime imports between them. paperboy-app and paperboy-widget both use markdown-it/Turndown for conversion but bundle them independently. paperboy-ext also uses Turndown independently with vendored copies. The connection between packages is conceptual (same product family) not technical (no shared code).

---

## Memory: paperboy-ext and paperboy-widget Differences

paperboy-ext (Chrome extension) uses Readability for article extraction before conversion, while paperboy-widget (embeddable script) converts raw DOM content directly with CSS selector targeting. The extension works on any page the user visits; the widget is embedded by the site owner. Both use Turndown + GFM with the same configuration: headingStyle "atx", codeBlockStyle "fenced", bulletListMarker "-", emDelimiter "*", and a custom rule to strip script/style/noscript tags.

---

## Memory: Shared Turndown Configuration

All packages that use Turndown (paperboy-widget, paperboy-ext) share the same configuration pattern: headingStyle "atx" (# style headings), codeBlockStyle "fenced" (triple backtick code blocks), bulletListMarker "-" (dash for unordered lists), emDelimiter "*" (asterisk for emphasis). All apply the GFM plugin and a custom rule called removeScriptLikeTags that strips SCRIPT, STYLE, and NOSCRIPT elements.

---

## Memory: Git Repository Layout

Each of the four packages (paperboy-app, paperboy-site, paperboy-widget, paperboy-ext) has its own .git directory and is a standalone git repository. The root paperboy/ directory is NOT a git repo. The root .gitignore only ignores .gnosys/ (the Gnosys memory store). Each subproject has its own .gitignore.

---

## Memory: Development Tooling

Cursor IDE is configured with MCP servers including Gnosys (persistent memory), GitHub, Docker, Notion, Vercel, and Cloudflare. The Gnosys MCP server runs via `gnosys serve`. The project has .gnosys/gnosys.json initialized with projectId and projectName "paperboy". The agentRulesTarget in gnosys.json is null (not configured to write Cursor rules yet).

---

## Memory: Gnosys Setup Status

Gnosys is initialized in the paperboy root (.gnosys/gnosys.json exists with projectId 96a3b444-5e77-49ad-a6b8-82bb8a3f4752). However, agentRulesTarget is null, meaning gnosys sync cannot inject rules into .cursor/rules/ yet. There is no .cursor/rules/ directory in the project. The gnosys CLI is available on the PATH and supports commands: init, add, search, discover, list, recall, sync, and many more.

---

## Memory: Cursor IDE Setup Status

The paperboy root has an AGENTS.md file for high-level agent context. There is no .cursor/ directory or .cursor/rules/ in the project yet. Global Cursor config lives at ~/.cursor/ which has mcp.json, plugins, skills-cursor, and projects directories but no global rules/ folder. Project-specific rules need to be created at paperboy/.cursor/rules/ as .mdc files.
