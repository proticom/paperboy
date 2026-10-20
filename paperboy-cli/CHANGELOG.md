# Changelog

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `doctor` now reports a missing config file as OK ("No config file; using defaults (run `paperboy-cli setup` to customize)") instead of a warning.
- Help, README and the publish checklist use `paperboy-cli` as the command name (`paperboy` and `paperboy-dispatch` remain as aliases).

## [0.3.1] - 2026-10-18

### Added
- `paperboy` command, matching the name `--help` has always shown. `paperboy-cli` keeps working, and `paperboy-dispatch` remains as a legacy alias.

### Changed
- The `doctor` hint for a missing config file now says `paperboy setup`.
- README uses `paperboy` as the command name and documents `crawl` and the `paperboy-cli` / `paperboy-dispatch` aliases.
- Publish checklist checks `paperboy` and the `paperboy-cli` alias.

### Fixed
- `convert -o` now creates missing parent directories for the output file instead of failing with ENOENT.
- `config show` is now a real sub-command: `paperboy config <anything else>` fails with exit code 1 instead of printing the config, and help shows `config` correctly.
- `convert --stdout` now prints conversion warnings to stderr, so piped or redirected Markdown stays clean.

## [0.3.0] - 2026-10-18

### Removed
- **Breaking:** the `--describe-image` flag on `convert`. Passing it now fails with an unknown-option error.
- AI provider, model and API-key setup from `paperboy-cli setup` (including OpenRouter model picking and `ollama pull`). `setup` now configures conversion defaults only.
- Ollama, OpenRouter, dotenv and OS key-store checks from `paperboy-cli doctor`.
- API-key storage and dotenv loading from the config module, the `DOTENV_PATH` export, and the `dotenv` and `@proticom/paperboy-ai` dependencies.

### Changed
- Older config files that still contain AI settings load without error; those keys are ignored.

## [0.2.6] - 2026-05-26

### Added
- Integration tests for the `crawl` command with loopback HTTP fixtures (`a49eb70`).

### Fixed
- Restored workspace `*` converter deps for CI builds before publish pinning (`ee64044`).
- Publish workflow builds converter and paperboy-ai before CLI publish (`38f920b`).

## [0.2.3] - 2026-05-25

### Changed
- Pinned registry dependency versions at publish time for reproducible npm installs (`8f6bdb5`, `dd5f410`).

## [0.2.2] - 2026-05-25

### Changed
- Released alongside monorepo v0.2.2 alignment (`48a0634`).

## [0.2.1] - 2026-05-25

### Changed
- Wired CLI to extracted `@proticom/paperboy-ai` package (`81b4570`).

## [0.2.0] - 2026-05-14

### Added
- Expanded AI providers: OpenAI, Anthropic, and xAI with Windows keychain support (`1e673db`).

### Changed
- Aligned all workspace package versions to 0.2.0 (`3d0bf2b`).

## [0.1.0] - 2026-05-03

### Added
- Initial CLI with `doctor`, site `crawl`, and OCR injection (`d4e484d`).

[0.2.6]: https://github.com/proticom/paperboy/compare/cli-v0.2.5...cli-v0.2.6
