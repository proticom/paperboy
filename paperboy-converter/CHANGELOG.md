# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Breaking for 0.x consumers:** image OCR removes the `## OCR Text` heading and defaults `image.includeLayoutTable` to false. Release this output change with a MINOR version bump. Versions remain unchanged in this patch.
- The optional positioning table retains raw, unfiltered words for debugging.

### Added
- Pure OCR parsing and cleanup at `@proticom/paperboy-converter/ocr-text`, shared with the browser extension.

### Fixed
- Keep every OCR line with mean confidence at least 60, including standalone codes, URLs, emails, dates, prices and CJK characters. Lower-confidence rescue accepts uppercase/mixed-case words, weights readable support by confidence, and requires a line mean of at least 40.
- Preserve pipe-table and standalone identifier lines. Separate heading/body wraps at font changes and unusual line pitch, using Tesseract line boxes when available.
- Remove letter-final hyphens without spaces only on joined lowercase prose wraps.
- Rescue readable low-confidence text and numeric table rows instead of dropping them solely by line mean. Ignore list prefixes when measuring readable content.
- Join only prose wraps. Preserve list, label, receipt/table and code line breaks; recover prose paragraph boundaries in degraded scans.
- Collapse consecutive rejected regions into one `<!-- image omitted -->` marker and split widely spaced captions into paragraphs.
- Parse malformed Tesseract structures defensively with defaults for word fields and partial bounding boxes.
- Restrict `|` to `I` cleanup to a single pipe flanked by lowercase words. Keep real pipe separators.
- Keep code statements with confident keywords and adjoining closing punctuation or single-character misreads.

## [0.3.1] - 2026-10-20

### Changed
- Minimum Node.js is now 20.18 (`engines.node` `>=20.18`): the pdf.js build bundled with unpdf 1.7 uses `process.getBuiltinModule` and `URL.parse` (#29).

### Fixed
- Upgrade `unpdf` to 1.7.x to remove its transitive `canvas` dependency and npm deprecation warnings (#29).
- PDF extraction is now structure-aware (#31). Tagged PDFs follow their structure tree. Untagged pages are split into columns (including narrow gutters) before tables are detected, so headings, lists, tables and paragraphs come out in reading order; inline font changes no longer break multi-column prose.
- PDF text cleanup (#31): wrapped lines are reflowed, letter-spaced headings rejoined and hard hyphens kept; verse and monospace code keep their line breaks; untagged table rows are kept; multipage titles come before page headings; dropped tagged figures are marked `<!-- image omitted -->`. Heuristic headings are capped at H2 unless first and largest. Fatal PDF errors are not retried, and other structure failures fall back to the previous extraction.

## [0.3.0] - 2026-10-18

### Removed
- **Breaking:** the `image.describeImage` conversion hook and the `ImageDescriptionParams` type. Image conversion now returns OCR output only; callers that passed `describeImage` must drop it.

## [0.2.2] - 2026-05-25

### Added
- Unit tests for docx, pdf, epub, and xlsx conversion (`b86b45f`).

### Fixed
- Docx handler passes both `arrayBuffer` and `buffer` to mammoth so Node and browser bundles work (`b86b45f`).

### Changed
- Expanded file-association coverage for converter formats in the desktop app (`717ac7a`).

## [0.2.1] - 2026-05-14

### Changed
- Aligned version with monorepo consumers during Phase 1 wrap.

## [0.2.0] - 2026-05-14

### Changed
- Aligned all workspace package versions to 0.2.0 (`3d0bf2b`).

## [0.1.2] - 2026-05-03

### Added
- Heading anchors in markdown output.
- Improved table conversion.
- OCR text injection hooks for image conversion (`5e2282d`).

## [0.1.1] - 2026-04-11

### Changed
- Propagated converter improvements to npm consumers.

## [0.1.0] - 2026-04-11

### Added
- Initial `@proticom/paperboy-converter` release with multi-format conversion and npm publish workflow (`4c6419d`).

[0.2.2]: https://github.com/proticom/paperboy/compare/v0.2.1...v0.2.2
