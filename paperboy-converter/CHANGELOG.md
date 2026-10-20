# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Segment PDF columns before detecting tables, including narrow gutters and tables within columns. Preserve short verse lines and monospace code.
- Keep multi-column PDF prose in reading order when lines contain inline font changes.
- Preserve untagged table rows and hard hyphens. Limit letter-spacing and list detection to matching layouts, place multipage titles before page headings, and avoid retrying fatal PDF errors.
- Preserve PDF reading order, headings, lists, tables, and paragraphs using document tags or page layout. Rejoin wrapped text and spaced letters and symbols, and mark omitted tagged figures without decoding images.

## [0.3.0] - Unreleased

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
