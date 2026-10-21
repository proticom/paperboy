# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Image OCR annotations use the converter's shared cleanup module to filter junk and preserve text structure. Junk-only images are skipped.

### Fixed
- Finish OCR with an idle status when no readable text is found, including skipped or failed images, instead of leaving the loading message visible.

## [0.3.1] - 2026-10-20

### Changed
- Version aligned to 0.3.1 with the converter; the bundled converter is 0.3.1.

## [0.3.0] - Unreleased

### Added
- `npm test` in `paperboy-ext/` checks the local OCR assets, worker options, packaging lists and MV3 restrictions.

### Changed
- English OCR language data (`eng.traineddata.gz` from the pinned `@tesseract.js-data/eng@1.0.0`, `4.0.0_best_int`) is now bundled with the extension and loaded locally with gzip on and language caching off, instead of being fetched from a remote CDN at runtime; image OCR therefore needs no remote language download, including its first run (fetching images from web pages still uses the existing host permissions). The build copies the data into the unpacked build and the store zip.
- Version aligned to 0.3.0 with the converter and CLI; the bundled converter is 0.3.0.

## [0.2.2] - 2026-05-25

### Added
- `homepage_url` in manifest pointing to paperboy.run sideload docs (`dac16ad`).
- In-window drag-and-drop markdown import (`07b4551`).

### Changed
- README documents side panel capture and removes stale `content.js` references (`782dae4`).

## [0.2.1] - 2026-05-14

### Added
- Multi-region picker, auto-scroll, content heuristic, and preferences (`cbd7390`).
- Split Copy button with chevron menu and Download .md (`5b5fa90`).

## [0.2.0] - 2026-05-14

### Added
- Region picker, Chrome-aware extraction, and OCR toggle (`196aa64`).

### Fixed
- Restored `host_permissions` and skip Readability on chat sites (`d52dbdc`).
- Bundled Tesseract core for MV3 with clearer policy errors (`d39c070`).

### Changed
- Aligned all workspace package versions to 0.2.0 (`3d0bf2b`).

## [0.1.0] - 2026-04-11

### Added
- Initial Manifest V3 side panel extension with preview toggle.

[0.2.2]: https://github.com/proticom/paperboy/compare/ext-v0.2.1...ext-v0.2.2
