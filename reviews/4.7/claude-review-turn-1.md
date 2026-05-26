# 4.7 - Review Turn 1

## Task Context
- Task id: 4.7
- Task title: Expand file associations for converter formats
- Dashboard implementation status: todo (verified NOT started in the repo)
- Review status: in_review → waiting_for_builder
- Spec sections: plan item **4.7** — "Expand file associations for converter formats": the macOS
  bundle's `fileAssociations` should declare every format the converter accepts, so users can
  right-click → "Open With Paperboy", set Paperboy as the default editor, and double-click those
  files in Finder. Today only `.md/.markdown/.mdown/.mkd/.mdx` + `.txt` are registered, but the
  converter supports 19 extensions covering Markdown, plain text, HTML, RTF, DOCX, PDF, CSV, XLSX,
  EPUB, and 7 image formats.
- Files inspected:
  - `paperboy-app/src-tauri/tauri.conf.json` (`bundle.fileAssociations` L42-67 — only Markdown +
    Plain Text registered)
  - `paperboy-converter/src/index.ts` L23-44 (`handlers` map — 19 extensions) + L46-55
    (`textInputExtensions` — 8 entries) + L57 (`SUPPORTED_EXTENSIONS = Object.keys(handlers)`)
  - `paperboy-app/src/scripts/converter.js` L9 (`MARKDOWN_EXTENSIONS = md/markdown/mdx`) + L10-19
    (`IMAGE_EXTENSIONS` — 8 entries) + L21-30 (`OPEN_DIALOG_FILTERS` — already covers docx/pdf/epub/rtf/csv/xlsx/images)
  - `paperboy-app/src/scripts/bridge.js` L374-421 (`loadFileIntoCurrentTab` already imports any
    converter-supported file via `convertImportedFile`); L8-9 (imports `shouldReadAsText`,
    `shouldKeepOriginalPath`)
  - `paperboy-app/src-tauri/src/main.rs` (no extension filtering on the Rust side — `read_file` /
    `read_file_bytes` accept any path; the Opened deep-link path already accepts any extension)
  - `paperboy-app/src-tauri/capabilities/` (no extension restrictions)
- Commands run:
  - `jq '.bundle.fileAssociations' paperboy-app/src-tauri/tauri.conf.json` → only Markdown (md/
    markdown/mdown/mkd/mdx) + Plain Text (txt). Missing: html/htm, rtf, docx, pdf, csv, xlsx, epub,
    and 8 image formats.
  - `node -e "import('./paperboy-converter/dist/index.js').then(m => console.log(m.SUPPORTED_EXTENSIONS))"`
    equivalent via `grep` of source: 19 extensions present (md, markdown, mdx, txt, html, htm, rtf,
    docx, pdf, csv, xlsx, epub, png, jpg, jpeg, gif, bmp, webp, tif, tiff). Note: `mdown` and `mkd`
    are NOT in the converter's `handlers` map — they're declared in `tauri.conf.json` only and would
    route through the "Unsupported file format" warning path if opened by Finder.
  - `grep -rn "mdown\\|mkd" paperboy-converter/src/ paperboy-app/src/scripts/converter.js paperboy-app/src/scripts/bridge.js paperboy-app/src-tauri/src/`
    → only tauri.conf.json (mdown/mkd not handled by converter).
  - `git log --oneline -10 -- paperboy-app/src-tauri/tauri.conf.json` → no 4.7 commit yet (last
    relevant: `089fd16 feat(app): register as macOS handler for .md/.markdown and actually open files`).
- Current claim being verified: none — `reply: null` in the queue, turn 1 fresh review.
- Result: NOT started. Bundle declares only Markdown + Plain Text; users cannot right-click a .docx
  / .pdf / .rtf / .csv / .xlsx / .epub / image file in Finder and pick Paperboy (or set Paperboy
  default). However the runtime open pipeline already handles all 19 extensions — the gap is purely
  in the macOS bundle declaration.

## Findings

### Finding 1: File associations are limited to Markdown + Plain Text
- Severity: required (this is the entire 4.7 deliverable)
- Location: `paperboy-app/src-tauri/tauri.conf.json` `bundle.fileAssociations` L42-67.
- Problem: the converter accepts 19 extensions but only 6 are declared as file associations in the
  macOS bundle. As a result, the Finder Open With menu, Get Info → "Open with...", and the default
  app dropdown do not list Paperboy for .docx/.pdf/.rtf/.html/.htm/.csv/.xlsx/.epub or any image
  format — even though `loadFileIntoCurrentTab` would happily import them if the deep link fired.
  The 4.x Opened/`drainPendingOpens` path already routes any path through the converter (works for
  cold-launch double-click and "Open With"), but only registered types reach that path.
- Spec mismatch / risk: 4.7 calls for "Expand file associations for converter formats" — the bundle
  declaration must cover every extension the converter supports so the OS surfaces Paperboy.
- Required fix: add fileAssociation entries for every converter handler, grouped by document
  family. Use `role: "Editor"` for editable formats (Markdown stays "Default"; the rest are
  "Alternate" so we don't hijack the system default for binary formats users may already associate
  with Word/Preview/Numbers). Use `role: "Viewer"` for PDF/EPUB/images (we open them by converting
  to Markdown — not edit-in-place). Pick standard mimeTypes. Add the missing `htm` to the HTML
  group. Decide what to do with `mdown`/`mkd`: either ADD them to the converter's handler map (so
  the runtime path doesn't bail with "Unsupported file format"), or REMOVE them from
  `fileAssociations` to stay consistent. Adding to the converter map is the lighter touch — they're
  trivially text/Markdown aliases.
- Code sample / exact change:
```jsonc
// paperboy-app/src-tauri/tauri.conf.json — bundle.fileAssociations
[
  {
    "ext": ["md", "markdown", "mdown", "mkd", "mdx"],
    "name": "Markdown",
    "description": "Markdown document",
    "role": "Editor",
    "rank": "Default",
    "mimeType": "text/markdown"
  },
  {
    "ext": ["txt"],
    "name": "Plain Text",
    "description": "Plain text document",
    "role": "Editor",
    "rank": "Alternate",
    "mimeType": "text/plain"
  },
  {
    "ext": ["html", "htm"],
    "name": "HTML",
    "description": "HTML document",
    "role": "Editor",
    "rank": "Alternate",
    "mimeType": "text/html"
  },
  {
    "ext": ["rtf"],
    "name": "Rich Text",
    "description": "Rich Text Format document",
    "role": "Editor",
    "rank": "Alternate",
    "mimeType": "application/rtf"
  },
  {
    "ext": ["docx"],
    "name": "Word Document",
    "description": "Microsoft Word document",
    "role": "Editor",
    "rank": "Alternate",
    "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  },
  {
    "ext": ["pdf"],
    "name": "PDF",
    "description": "PDF document",
    "role": "Viewer",
    "rank": "Alternate",
    "mimeType": "application/pdf"
  },
  {
    "ext": ["epub"],
    "name": "EPUB",
    "description": "EPUB book",
    "role": "Viewer",
    "rank": "Alternate",
    "mimeType": "application/epub+zip"
  },
  {
    "ext": ["csv"],
    "name": "CSV",
    "description": "Comma-separated values",
    "role": "Editor",
    "rank": "Alternate",
    "mimeType": "text/csv"
  },
  {
    "ext": ["xlsx"],
    "name": "Excel Spreadsheet",
    "description": "Microsoft Excel spreadsheet",
    "role": "Editor",
    "rank": "Alternate",
    "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  },
  {
    "ext": ["png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff"],
    "name": "Image",
    "description": "Image file",
    "role": "Viewer",
    "rank": "Alternate",
    "mimeType": "image/*"
  }
]
```
And — pick one of these for `mdown`/`mkd` consistency:
```ts
// Option A (preferred — lighter, runtime-correct): paperboy-converter/src/index.ts L23-44
const handlers: Record<string, ConverterHandler> = {
  md: convertText,
  markdown: convertText,
  mdown: convertText,   // add
  mkd: convertText,     // add
  mdx: convertText,
  // ... rest unchanged
};
```
or
```jsonc
// Option B: remove "mdown" and "mkd" from tauri.conf.json fileAssociations Markdown ext list
```
- Validation:
```text
jq '.bundle.fileAssociations | length'                paperboy-app/src-tauri/tauri.conf.json  # 10 groups (was 2)
jq '[.bundle.fileAssociations[].ext] | flatten | unique | length' paperboy-app/src-tauri/tauri.conf.json  # 19 unique exts (matches converter)
jq -r '.bundle.fileAssociations[] | "\(.name)\t\(.ext|join(","))\t\(.role)\t\(.rank)"' paperboy-app/src-tauri/tauri.conf.json
# (Option A) grep -n "mdown\\|mkd" paperboy-converter/src/index.ts        # both present
npm run build:converter -w paperboy-app                                   # exit 0
npm run build  --workspaces --if-present                                  # exit 0
npm test       --workspaces --if-present                                  # exit 0
# Tauri config is JSON-only here — no Rust source touched, so the Cargo build doesn't change.
# Optional sanity: jq empty paperboy-app/src-tauri/tauri.conf.json        # valid JSON, exit 0
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: Expand the macOS bundle's `fileAssociations` so every extension the converter supports is
declared. After this change, a user can right-click a .docx / .pdf / .rtf / .html / .csv / .xlsx /
.epub / image file in Finder, see Paperboy in Open With, and optionally set it as the default
viewer/editor. The runtime open pipeline (`loadFileIntoCurrentTab` → `convertImportedFile`) already
handles all of these — this task is purely the macOS bundle declaration plus a minor consistency
fix for the `mdown`/`mkd` aliases.

Files to edit:
- `paperboy-app/src-tauri/tauri.conf.json` — replace `bundle.fileAssociations` with 10 entries
  covering all 19 converter extensions (see exact JSON in Finding 1). Keep Markdown as `rank:
  "Default"` (so Paperboy can be the default `.md` editor); all other groups use `rank: "Alternate"`
  (so we don't hijack the system default for .docx/.pdf/etc. — those should still default to Word/
  Preview/etc. unless the user explicitly opts in). Use `role: "Editor"` for formats that round-trip
  to text we can edit (md, txt, html, rtf, docx, csv, xlsx) and `role: "Viewer"` for read-only
  conversions (pdf, epub, images).
- One of:
  - **(Preferred) `paperboy-converter/src/index.ts`** — add `mdown: convertText` and `mkd:
    convertText` to the `handlers` map (alongside the existing `md`, `markdown`, `mdx` entries) so
    those aliases are consistent between the bundle declaration and the runtime converter. This is
    a 2-line patch.
  - OR remove `"mdown"` and `"mkd"` from the Markdown extension list in `tauri.conf.json`. (Less
    desirable — those are real-world Markdown aliases.)

Files not to edit:
- `paperboy-app/src-tauri/src/main.rs` — no Rust changes required; the Opened/`drainPendingOpens`
  path already accepts any extension.
- `paperboy-app/src/scripts/converter.js` `OPEN_DIALOG_FILTERS` — already covers the right groups
  for the menu File→Open dialog; leave it.
- `paperboy-app/src/scripts/bridge.js` `loadFileIntoCurrentTab` — already imports any
  converter-supported file; leave it.
- `paperboy-app/src-tauri/capabilities/` — no capability changes required.

Exact changes: see the JSON sketch in Finding 1.

Data shapes / CLI examples:
- Tauri 2 schema for a fileAssociation entry:
  `{ ext: string[], name?: string, description?: string, role: "Editor"|"Viewer"|"Shell"|"None", rank: "Default"|"Owner"|"Alternate"|"None", mimeType?: string }`.
- `role: "Editor"` ≈ macOS LSHandlerRank/LSItemContentTypes editor role (we modify the doc).
- `role: "Viewer"` ≈ we only display (we convert PDF/EPUB/images to markdown for preview).
- `rank: "Default"` requests to be the default; `"Alternate"` says "we can handle this but don't
  claim the default" — appropriate for everything except Markdown.

Tests to add or update:
- No JS unit harness for the bundle config; the change is pure JSON. Verify by:
  (a) running `jq` to count groups (10) and unique extensions (19, matching the converter);
  (b) re-running `npm run build:converter -w paperboy-app`, `npm run build --workspaces --if-present`,
      and `npm test --workspaces --if-present` (all exit 0);
  (c) for Option A (preferred), `grep -n "mdown\\|mkd" paperboy-converter/src/index.ts` shows both
      handler entries.
- Runtime smoke (build the .app via `/cargo-build`, right-click a .docx in Finder → "Open With"
  shows Paperboy; set Paperboy as default for .md and verify double-click opens) is covered by the
  app-smoke task family — not required here.

Commands to run (capture exit codes):
```text
jq empty paperboy-app/src-tauri/tauri.conf.json                                                       # valid JSON
jq '.bundle.fileAssociations | length' paperboy-app/src-tauri/tauri.conf.json                         # 10
jq '[.bundle.fileAssociations[].ext] | flatten | unique | length' paperboy-app/src-tauri/tauri.conf.json  # 19
jq -r '.bundle.fileAssociations[] | "\(.name)\t\(.ext|join(","))\t\(.role)\t\(.rank)"' paperboy-app/src-tauri/tauri.conf.json
# (Option A) grep -n "mdown\\|mkd" paperboy-converter/src/index.ts                                    # mdown + mkd present
npm run build:converter -w paperboy-app                                                               # exit 0
npm run build --workspaces --if-present                                                               # exit 0
npm test  --workspaces --if-present                                                                   # exit 0
```

Definition of done:
- `bundle.fileAssociations` declares all 19 converter extensions across 10 groups (Markdown,
  Plain Text, HTML, Rich Text, Word, PDF, EPUB, CSV, Excel, Image).
- Markdown stays `rank: "Default"`; everything else is `rank: "Alternate"`.
- `role: "Editor"` for editable text formats; `role: "Viewer"` for PDF/EPUB/images.
- `mdown` and `mkd` are either added to the converter's handler map (preferred) or removed from the
  bundle declaration — pick one and apply consistently.
- All workspace builds + tests stay green; tauri.conf.json is still valid JSON.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Should we also wire UTI declarations (`extendInfo` keys like `LSItemContentTypes` /
  `UTExportedTypeDeclarations`) for the binary formats? Tauri's `fileAssociations` auto-generates
  the Info.plist entries for us, so this is optional. State your choice in the reply.
- `role: "Viewer"` vs `role: "Editor"` for PDF/EPUB/images: I chose Viewer because Paperboy converts
  them to Markdown rather than edit-in-place. Builder may override if there's a UX reason to claim
  Editor (e.g. so we appear in the "Edit With" submenu).

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
Blocker: `bundle.fileAssociations` declares only Markdown + Plain Text (6 exts). Converter handles 19. Builder must add 8 entries (HTML/RTF/DOCX/PDF/EPUB/CSV/XLSX/Image) with `rank:"Alternate"`, Viewer role for PDF/EPUB/images, Editor for the rest; reconcile `mdown`/`mkd` (prefer: add to converter handlers). Exact JSON in Finding 1.
