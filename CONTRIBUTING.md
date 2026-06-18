# Contributing

## Filing issues

Use GitHub Issues for bug reports and feature requests. Issue templates are provided.

For design proposals — changes to the skill content, core pattern, or references — open an issue to discuss first, so a direction that has already been considered and set doesn't get re-litigated. The core principles below are the bar any proposal has to clear.

## The core principles are load-bearing

[`AGENTS.md`](AGENTS.md) lists the design principles that govern this project. They are not style preferences — they encode specific failure modes observed during development. Read them before proposing changes to `skills/surface/SKILL.md` or anything under `skills/surface/references/`.

## Pull requests

- Keep changes focused. One concern per PR.
- For skill content changes: bump **all three** `version:` strings together — `skills/surface/SKILL.md`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` — **and add a matching `CHANGELOG.md` entry** (patch for tweaks, minor for new rules/references/examples/shape changes). CI enforces both halves. See [`AGENTS.md`](AGENTS.md) §Versioning for the rationale.
- Reference server changes should not require reading sibling implementations — each server is derived independently from the references.

## Code style

Go: `gofmt` and `go vet ./...` must be clean. Run `go test ./...` before submitting.

Other substrates: follow the conventions already in the file.
