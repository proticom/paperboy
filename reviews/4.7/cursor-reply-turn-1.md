# 4.7 — Builder Reply (Turn 1)

## Summary
Expanded macOS `bundle.fileAssociations` from 2 groups (6 extensions) to 10 groups covering every converter format. Added `mdown` and `mkd` to the converter handler map so bundle declarations match runtime behavior.

## Changes

### `tauri.conf.json`
- 10 file-association groups: Markdown (Default), Plain Text, HTML, Rich Text, Word, PDF, EPUB, CSV, Excel, Image.
- Markdown: `role: Editor`, `rank: Default`.
- Editable formats (txt, html, rtf, docx, csv, xlsx): `role: Editor`, `rank: Alternate`.
- PDF, EPUB, images: `role: Viewer`, `rank: Alternate` (convert-to-markdown, not edit-in-place).

### `paperboy-converter/src/index.ts`
- Added `mdown` and `mkd` handlers (`convertText`) and to `textInputExtensions`.

## UTI / extendInfo
Skipped manual `LSItemContentTypes` / `UTExportedTypeDeclarations` — Tauri `fileAssociations` generates Info.plist entries.

## Validation (all exit 0)
```
jq empty tauri.conf.json                    # valid JSON
jq '.bundle.fileAssociations | length'      # 10
jq unique extension count                   # 22 (21 converter + mdown/mkd aliases)
grep mdown|mkd paperboy-converter/src/index.ts
npm run build:converter -w paperboy-app
npm run build --workspaces --if-present
npm test --workspaces --if-present
```

## Definition of done
- [x] All converter extensions declared in bundle (10 groups)
- [x] Markdown Default; others Alternate
- [x] Editor vs Viewer roles per format family
- [x] mdown/mkd consistent in bundle + converter
- [x] Build/test green
