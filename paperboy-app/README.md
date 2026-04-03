# Paperboy App (Desktop Markdown Editor)

Paperboy App is a desktop app for writing Markdown.

It gives you:
- A plain text editor on the left
- A styled preview on the right
- Native Open, Save, and Save As dialogs from your operating system

The app is built with **Tauri v2** (Rust + web UI).

---

## 1) What You Need Installed First

You need two tools on your computer:

1. **Node.js + npm**
2. **Rust (with rustup)**

### Check if Node.js is installed

Open Terminal and run:

```bash
node -v
npm -v
```

If both commands print a version number, you are good.

### Check if Rust is installed

Open Terminal and run:

```bash
rustc -V
cargo -V
```

If both commands print a version number, you are good.

If Rust is missing, install it from [https://rustup.rs](https://rustup.rs).

---

## 2) First-Time Setup (Step by Step)

From this `paperboy-app` folder:

```bash
npm install
```

This downloads JavaScript dependencies.

Then run:

```bash
npm run sync:vendor
```

This copies markdown parser files into `src/scripts/vendor/` so the app can load them.

---

## 3) Add Required Font Files

Put these `.woff2` files in `src/assets/fonts/`:

- `CourierPrime-Regular.woff2`
- `CourierPrime-Bold.woff2`
- `CourierPrime-Italic.woff2`
- `CourierPrime-BoldItalic.woff2`
- `Inter-Regular.woff2`
- `Inter-Medium.woff2`
- `Inter-SemiBold.woff2`

If these files are missing, the app still runs, but the intended typography will not look right.

---

## 4) Run the App in Development

Use this command:

```bash
npx tauri dev
```

Important: do **not** run `npm run tauri dev` (that script does not exist as a direct npm script name in this repo).

When the app starts, you should see:
- The Paperboy window
- Editor + preview area
- Menu actions for New / Open / Save / Save As

---

## 5) How to Use the App

- **Write Markdown** in the editor pane.
- **Switch views** with the view toggle:
  - Preview only
  - Editor only
  - Split view
- **Open files** with the File menu or shortcut.
- **Save files** with Save / Save As.
- **Change theme** with the theme toggle (system, light, dark).

Toolbar buttons help insert common Markdown syntax (headings, lists, links, code blocks, tables, and more).

---

## 6) Build a Release App

When you are ready to make a release build:

```bash
npx tauri build
```

This creates installable app files in the Tauri build output folders under `src-tauri/target/`.

---

## 7) Helpful Extra Commands

If you only want to test the web UI in a browser (without Tauri window integration):

```bash
npm run dev:web
```

Then open:

`http://127.0.0.1:1420`

---

## 8) Troubleshooting

- If markdown preview looks broken, run `npm run sync:vendor` again.
- If the app will not launch, re-check Node and Rust versions.
- If fonts look wrong, verify the exact `.woff2` filenames in `src/assets/fonts/`.
