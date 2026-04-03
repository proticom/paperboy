# Paperboy — agent notes

This folder is a **multi-package workspace**. Each product lives in its own directory; several subfolders are separate git repositories.

## Packages

| Directory | Role |
|-----------|------|
| `paperboy-app/` | Tauri desktop app (package name `paperboy-editor`). Dev: `npm run dev:web` from that folder; Tauri via `npm run tauri`. |
| `paperboy-site/` | Next.js 16 site. Dev: `npm run dev` from that folder. |
| `paperboy-widget/` | Embeddable markdown/web widget; build with `npm run build`. |
| `paperboy-ext/` | Browser extension (manifest, background, side panel). Build: `npm run build`. |

## Conventions

- Prefer changing only the package that owns the feature; avoid drive-by edits across unrelated folders.
- Respect each subproject’s existing stack (Next vs Tauri vs plain JS in the extension).

## Cursor

- Project-specific AI rules belong in `.cursor/rules/` as `.mdc` files.
- This file (`AGENTS.md`) is high-level context for agents working anywhere in the repo.
