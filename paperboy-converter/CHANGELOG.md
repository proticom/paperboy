# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
