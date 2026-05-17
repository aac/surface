# poke — Session Handoff (wrap-of-day, three agents in flight)

**Date:** 2026-05-16
**Branch:** main
**Status:** v0 shipped + dogfooded; three follow-up agents dispatched in worktrees while Andrew is away.

## Shipped this session

- v0 (all 10 plan tasks closed + merged + verified end-to-end)
- Dogfood across 4 surfaces (vibe-emoji-click, drawing canvas, settings-iso v2 with conflated buttons, settings-iso v3 with split buttons + escape hatch)
- Three v0 dogfood findings closed + merged: `go run` orphan server (parent-death watchdog), smoke-test HTML plain-form bug (rewritten to fetch+JSON), stale-tab port-reuse hazard (Cache-Control: no-store)
- bgIsolation harness relaxation landed via Andrew's one-paste shell command (effective on next Claude session start in this repo, not retroactively)
- 3 memories captured covering affordance design + tracking rules

## In flight (3 bg agents dispatched)

1. **Docs bundle:** affordance-design SKILL.md addition (4 sub-principles: minimum effort, escape hatch, one-affordance-one-intent, honest confirmation messaging) + concrete prompt-injection examples in security.md. One agent doing all four ticket closes on a single branch, 4 commits.
2. **Python reference implementation:** stdlib-only port of `examples/server.go` to `examples/server.py` plus `examples/test_server.py`. Validates the substrate-agnostic claim — if the references are right, an agent can port from docs alone.
3. **Filesystem-watch drain example:** Either a `--drain-mode={stdout,fs}` flag on the existing server (shape A, recommended) or doc-only update (shape B), plus worked pseudocode in `references/lifecycle.md`.

## Next pass

When the three completions arrive (orchestrator will get notifications), the work is:
1. Rebase + ff-merge each branch in order of completion.
2. Run gates after each (`gofmt -l .`, `go vet ./...`, `go test ./...`).
3. Prune worktrees + branches.
4. Update this handoff to reflect the new state.

If any agent reports an issue rather than completion, halt per the orchestrate skill.

## Open backlog (after the in-flight three land)

Still tracked, no work in flight:

- **Cloudflare Worker + KV deployment** — most novel remaining candidate; forces the hosted-deployment-posture discussion out of theory. Needs Andrew (CF account, possibly a subdomain).
- **Node / Deno / Rust reference implementations** — sibling to the in-flight Python work; under the alt-language-impls umbrella ticket. Filed as the umbrella stays open after Python lands.
- **Bundled `poke-serve` binary** — the v1 ergonomic upgrade; tracked, deferred until real-signal demands it.

## What's left for other-project use of poke

Strictly speaking, nothing blocks it today. The skill is installed at `~/.claude/skills/poke` user-wide; any Claude session in any directory sees it in available-skills. The friction items (Go runtime requirement for the reference server, localhost-shaped conventions) are real but small — agents can re-implement in the project's stack from the references, which is exactly what the in-flight Python work is validating.

The smoothing items are tracked: alt-language refs (Python in flight; Node/Deno/Rust still queued), bundled binary (deferred), Cloudflare for hosted shapes.

## Agent bookkeeping (ticket ids for orchestrator grep)

Doc-bundle agent claims: `act-a637`, `act-78c1`, `act-ed80`, `act-2781` (close in that order).
Python impl agent claims: `act-7bd1`.
Fs-watch agent claims: `act-4f2b`.

Still-open after in-flight completes (in act): `act-e719` (alt-lang umbrella), `act-84a8` (Cloudflare), `act-db17` (bundled binary).

## Halt conditions (orchestrate skill)

- Bg agent reports an issue → halt and surface.
- Rebase hits conflicts during merge-back → halt and surface.
- Worktree locked by live process → don't force; surface.
- Subagent surfaces an unresolved question via bg-task → respond, agent resumes.

## Reading order for the next session

1. `CLAUDE.md` (project) and the user's global CLAUDE.md — load-bearing principles. Note the new "don't cite ticket IDs to Andrew" rule landed mid-pass on 2026-05-16.
2. This file.
3. `docs/brief.md` / `docs/plan.md` only if a specific question arises about Cloudflare or v1 scope.
