# poke — Session Handoff (v0 COMPLETE)

**Date:** 2026-05-16
**Branch:** main
**Status:** v0 shipped. All 10 tasks closed and merged. Skill installed and verified active.

## v0 deliverable

The poke skill bundle is live at `~/.claude/skills/poke` (symlink → `~/Workspace/poke`). It loads as `poke` in available-skills lists, with the refined trigger description from Task 9.

On main:
- `SKILL.md` — 80-line entry point, YAML frontmatter + 8 sections per design
- `references/{pattern,wire-example,lifecycle,security}.md` — coherent after Task 7 reconciliation
- `examples/server.go` + `examples/server_test.go` — stdlib-only Go reference, 3 tests pass
- `README.md`, `LICENSE`, `.gitignore`, `go.mod`
- `docs/{brief,plan,session-handoff}.md`, `CLAUDE.md`
- `.act/` (tracker), `.githooks/commit-msg`, `.act/hooks/close`

End-to-end smoke verified live this session:
- `go run ./examples/server.go --state /tmp/poke-test.json --html /tmp/poke-test.html --port 5173`
- `curl -X POST -H 'Content-Type: application/json' -d '{"id":"abc","payload":null}' http://127.0.0.1:5173/submit` → 200
- Server stdout: `SUBMIT abc null` (matches shared contract exactly)
- State file appended with RFC3339Nano timestamp

## Task ledger (all closed)

| Task | Act ID | Group | Closing commit |
|---|---|---|---|
| 1 — Repo hygiene | act-45d8 | A | `7cfed9d chore: gitignore and license (act-45d8)` |
| 2 — pattern.md | act-1a65 | A | `c86b980 docs: references/pattern.md (act-1a65)` |
| 3 — wire-example.md | act-56b2 | A | `a764c74 docs: references/wire-example.md (act-56b2)` |
| 4 — lifecycle.md | act-0ba0 | A | `4320efb docs: references/lifecycle.md (act-0ba0)` |
| 5 — security.md | act-9271 | A | `da2dba2 docs: references/security.md (act-9271)` |
| 6 — server.go + tests | act-8e1b | A | `8b76634 feat(server): multipart upload path (act-8e1b)` |
| 7 — coherence pass | act-0cd3 | B | `e4c7a69 docs: coherence pass on references and server (act-0cd3)` |
| 8 — README.md | act-6937 | C | `08dec3f docs: human-facing README (act-6937)` |
| 9 — SKILL.md | act-3887 | C | `02a7c87 feat: SKILL.md entry point with 8 sections (act-3887)` |
| 10 — smoke test | act-e7f1 | D | (orchestrator-only; closed via reason, no work-commit) |

## Notable choices made during implementation

- **Reference server defaults:** port 5173, bind 127.0.0.1, startup stderr line `poke: serving <html> on http://<bind>:<port>/ (state=<state>)`, multipart files at `<TempDir>/poke-uploads/<8-byte-hex>-<sanitized-basename>`, compact JSON state writes with atomic tmp+rename under a `sync.Mutex` that also guards stdout `SUBMIT` emission.
- **Coherence pass (Task 7) fixed two real drifts:** (1) server emitted `"files":null` for no-file multipart submissions, doc said `[]` — server corrected to initialize `savedPaths` as `[]string{}`. (2) wire-example.md claimed server was "~80 lines" (it's 305); rewrote as "in the Go standard library, no external dependencies."
- **`lifecycle.md` uses Python-style pseudocode** for the Monitor example (CC agents draining the server aren't necessarily writing Go).
- **`pattern.md` invariant #4** got a parenthetical noting envelope-typed-by-construction doesn't extend to free-text/file content — flagged as security concern, kept out of pattern proper.
- **README** uses `<repo-url>` placeholder (no git remote configured yet, matches brief).

## Conventions installed for future work on poke

- `act init` done; 10 issues filed and closed; future tasks file via `act create`.
- `.act/hooks/close` runs `gofmt -l .`, `go vet ./...`, `go test -timeout 180s ./...`. Auto-skips vet/test when no Go files exist (handles future doc-only work cleanly).
- `.githooks/commit-msg` blocks direct work-commits to main from anywhere except worktrees. `act-op:` commits and worktree-branch commits pass through. Bypass: `POKE_ALLOW_DIRECT_MAIN=1`.
- `core.hooksPath = .githooks` set; worktrees inherit it.
- All Group A/B/C worktrees pruned; branches deleted.

## What's NOT in v0 (per `docs/brief.md` §"Out of scope")

Untouched and deferred until real use signal:
- Bundled binary / installable tool (v1)
- Formal `docs/spec.md`
- Channel adapters (Slack, email, SMS, push, paging)
- Auth model for hosted / public surfaces
- Templating / surface-authoring helpers
- Link expiration, one-time-use, persistent surfaces
- Cross-implementation interop testing
- Substantive prompt-injection mitigation patterns

## Outstanding caller-side item

`/Users/andrewcove/Workspace/poke/.claude/settings.json` with `{"worktree": {"bgIsolation": "none"}}` is still recommended for future orchestrator passes on this repo — would let main-checkout file edits proceed without Bash-heredoc workarounds. Not load-bearing right now (v0 is done), but the next time someone runs `/orchestrate` here for v1 work, this will keep things smooth.

## Next time

When you come back to poke for v1 (bundled binary, etc.), this handoff documents the conventions in place. Start with `CLAUDE.md` + the brief's "Out of scope" list to pick the next slice.
