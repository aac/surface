# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.1.3] - 2026-05-28

### Fixed
- `.codex-plugin/plugin.json` `.name` field changed from stale `"poke"` to `"surface"`; description aligned with the canonical `.claude-plugin/plugin.json` framing (multi-recipient, third-party share, copy-to-paste runbook use cases that were added during arc-rsv2 but missed in the codex manifest) (act-7d405d).

## [0.1.2] - 2026-05-28

### Added
- Boilerplate hygiene: `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, GitHub issue templates, no-telemetry line in README (act-ef97).
- CI workflow (`.github/workflows/ci.yml`): markdown lint, plugin manifest validation including three-way SKILL.md ↔ claude-plugin ↔ codex-plugin version lockstep, Go reference-server tests (act-1145).

### Fixed
- Reconciled three-way version drift across SKILL.md frontmatter, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` — all now align on `0.1.2` (act-e23c59).
- `skills/surface/go.mod` now declares a real Go toolchain version (`1.22`) instead of the non-existent `1.26.3`; CI switched to `go-version-file` (act-9dc9f4).

## [0.1.1] - 2026-05-27

### Changed
- Renamed project from `poke` to `surface`.
- Removed v0 skill bundle; v1 skill bundle (`skills/surface/`) replaces it.

## [0.1.0] - 2026-05-20

### Added
- Initial public release: skill bundle, four reference servers (Go, Python, Node, Rust), Cloudflare Worker reference, Claude and Codex packaging.
