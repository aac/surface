# Contributing

## Filing issues

Use GitHub Issues for bug reports and feature requests. Issue templates are provided.

For design proposals — changes to the skill content, core pattern, or references — read [`docs/decisions.md`](docs/decisions.md) first. It logs prior design choices and rejected proposals with reasoning; a proposal that has already been considered and rejected doesn't need to be re-litigated.

## The core principles are load-bearing

[`CLAUDE.md`](CLAUDE.md) lists the design principles that govern this project. They are not style preferences — they encode specific failure modes observed during development. Read them before proposing changes to `skills/surface/SKILL.md` or anything under `skills/surface/references/`.

## Pull requests

- Keep changes focused. One concern per PR.
- For skill content changes: bump both `version:` fields in `skills/surface/SKILL.md` and `.claude-plugin/plugin.json` together (patch for tweaks, minor for new rules/references/examples/shape changes).
- Reference server changes should not require reading sibling implementations — each server is derived independently from the references.

## Code style

Go: `gofmt` and `go vet ./...` must be clean. Run `go test ./...` before submitting.

Other substrates: follow the conventions already in the file.
