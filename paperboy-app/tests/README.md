# Desktop import smoke tests

These tests exercise `convertImportedFile` in `src/scripts/converter.js` — the single chokepoint every desktop import path uses (File → Open, drag-and-drop, double-click, Open Recent).

## What is covered

- Markdown passthrough, HTML/CSV conversion, PNG import with AI disabled, unsupported-extension fallback, and AI `describeImage` wiring (mocked `@proticom/paperboy-ai`).
- Runs with **vitest** (node environment) and a small `localStorage` polyfill in `setup.js` so `getAiSettings()` works without a Tauri shell. PNG paths use real OCR via tesseract.js (same as production).
- Uses synthetic string/base64 inputs only — no committed PDF/DOCX/PNG fixtures.

## What is deferred

A full **Tauri / Playwright / tauri-driver** E2E (launch the app, click menus, assert preview DOM) is intentionally out of scope here. That belongs in plan task **7.3** (end-to-end smoke pass). The JS-gateway suite stays as the fast, deterministic regression net; E2E would complement it later.

## How to run

```bash
cd paperboy-app && npm test
```

From the monorepo root (all workspace test scripts):

```bash
npm test --workspaces --if-present
```
