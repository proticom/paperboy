# Paperboy — agent notes

This folder is a **multi-package workspace**. Most packages share **one Git repository** at the workspace root. The marketing site is a **nested repository** (private) in `paperboy-site/`.

## Repositories

| Remote | What it tracks |
|--------|----------------|
| [github.com/proticom/paperboy](https://github.com/proticom/paperboy) | **Public** monorepo: root `AGENTS.md`, `paperboy-app/`, `paperboy-cli/`, `paperboy-converter/`, `paperboy-ext/`, `paperboy-widget/`, and shared assets. `paperboy-site/` is **not** part of this repo (see `.gitignore`). |
| [github.com/proticom/paperboy-site](https://github.com/proticom/paperboy-site) | **Private** Next.js site only. Work inside `paperboy-site/` and push from that directory. |

Clone both into the same parent if you want the historical layout: check out `paperboy`, then clone `paperboy-site` into `paperboy/paperboy-site` (replacing or merging with an existing folder).

## Packages

| Directory | Role |
|-----------|------|
| `paperboy-app/` | Tauri desktop app (package name `paperboy-editor`). Dev: `npm run dev:web` from that folder; Tauri via `npm run tauri`. |
| `paperboy-site/` | Next.js 16 site (separate Git repo). Dev: `npm run dev` from that folder. |
| `paperboy-widget/` | Embeddable markdown/web widget; build with `npm run build`. |
| `paperboy-ext/` | Browser extension (manifest, background, side panel). Build: `npm run build`. |
| `paperboy-cli/` | CLI (`paperboy-cli`). See package `README.md`. |
| `paperboy-converter/` | Shared `@proticom/paperboy-converter` library used by app, site, widget, ext, and CLI. |

## Conventions

- Prefer changing only the package that owns the feature; avoid drive-by edits across unrelated folders.
- Respect each subproject’s existing stack (Next vs Tauri vs plain JS in the extension).

## Cursor

- Project-specific AI rules belong in `.cursor/rules/` as `.mdc` files.
- This file (`AGENTS.md`) is high-level context for agents working anywhere in the repo.
