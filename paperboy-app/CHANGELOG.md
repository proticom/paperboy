# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-05-25

### Added
- Desktop import-flow smoke tests (`4afc983`).
- Find/Replace overlay (Cmd+F) (`6841ff5`).
- Status bar with word count and cursor position (`8e22e86`).
- Export submenu for HTML and PDF (`2ae64a2`).
- macOS signing and notarization configuration (`f01cbe1`).
- Linux maintainer metadata and AppImage/deb bundle config (`e6bfbec`).
- Tauri auto-updater plugin and `latest.json` endpoint (`056bf35`).
- Platform icon sizes for installers (`6f2dbe1`).

### Changed
- Bundle targets include dmg, nsis, deb, and appimage (`9e1b31f`).
- Expanded file associations for converter formats (`717ac7a`).
- Vendored converter bundle includes isomorphic docx handler fix (`b86b45f`).

### Fixed
- Replaced `alert()` with toast notifications (`04649dc`).
- Wired or removed unused `headingId` editor action (`9711597`).

## [0.2.1] - 2026-05-14

### Changed
- Aligned version with monorepo consumers.

## [0.2.0] - 2026-05-14

### Changed
- Aligned all workspace package versions to 0.2.0 (`3d0bf2b`).

## [0.1.0] - 2026-04-11

### Added
- Initial Tauri desktop editor (paperboy-editor).

[0.2.2]: https://github.com/proticom/paperboy/compare/app-v0.2.1...app-v0.2.2
