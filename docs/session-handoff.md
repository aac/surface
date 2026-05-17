# poke — Session Handoff (post-design)

**Date:** 2026-05-16
**Branch:** main
**Last commit:** `b780dab` — plan review feedback applied

## Current state

v0 design is complete and reviewed. Three doc artifacts in the repo; no code, no `SKILL.md`, no `.act/`, no hooks, nothing implemented.

- `docs/brief.md` — converged v0 design (pattern, wire example, lifecycle, skill structure, security stance, out-of-scope). Reviewed by 3 agents (architectural, skeptical fresh-eyes, planability); auto-fixes and trust-the-agent edits applied.
- `docs/plan.md` — task-by-task implementation plan (10 tasks + pre-flight + locked shared contracts + dispatch groups). Reviewed by 3 agents (architectural, skeptical, executability); must-fix + should-fix integrated; trust-the-agent leans applied (some reviewer suggestions deliberately not adopted — see CLAUDE.md principles).
- `CLAUDE.md` — load-bearing design principles (trust the agent, non-prescriptive skill content, pattern-as-contract, autonomous draining foundational, poke stands alone, interactive vs autonomous invocation, setup vs interaction, security in its own reference, one-way channels as consequence not definition) plus repo conventions.

## Next session: be the orchestrator

A fresh Claude session in `~/Workspace/poke` plays the orchestrator role for v0 implementation. Two phases:

### Phase 1 — Pre-flight (one-time setup)

Per `docs/plan.md` §"Pre-flight":

1. `cd ~/Workspace/poke && go mod init github.com/aac/poke`
2. `act init`
3. Create 10 act issues, one per plan Task 1-10. **Paste each task section verbatim** (heading through final commit step) into the issue body. Each issue body should also note: "Required reading: `docs/brief.md` and `CLAUDE.md` before starting."
4. Copy `~/Workspace/ask/.act/hooks/close` → `~/Workspace/poke/.act/hooks/close` (gofmt + vet + test gate).
5. Copy `~/Workspace/ask/.githooks/commit-msg` → `~/Workspace/poke/.githooks/commit-msg`, then `git config --local core.hooksPath .githooks`.

### Phase 2 — Dispatch

Per `docs/plan.md` §"Dispatch groups":

- **Group A (parallel):** Tasks 1-6. Six subagents in worktrees, each claims its issue.
- **Group B (serial after A):** Task 7 — coherence pass. One subagent reads all Group-A artifacts and reconciles drift.
- **Group C (parallel after B):** Tasks 8-9. Two subagents.
- **Group D (orchestrator, not subagent-claimable):** Task 10 — smoke test verification, run from the main checkout.

Subagents do NOT merge their own branches. Orchestrator ff-merges each branch to main as it completes.

## Reading order for the next session

1. `CLAUDE.md` — principles that govern everything.
2. `docs/brief.md` — what poke is and why.
3. `docs/plan.md` — what to build, in what order, with shared contracts.
4. This file — what's been done, what's next.

## Open questions deliberately deferred to implementation

These are non-prescription by design; subagents make the call within plan constraints.

- **Reference server port default and exact stderr format** (Task 6) — plan deliberately doesn't prescribe.
- **SKILL.md `description` frontmatter** (Task 9) — a draft is in the plan; expected to be refined during writing to land the trigger.
- **README length and exact framing** (Task 8) — plan gives the content requirements and a stranger-test acceptance; agent picks.

## What's explicitly NOT in v0

Per `docs/brief.md` §"Out of scope":

- Bundled binary / installable tool (v1)
- Formal `docs/spec.md` (v1)
- Channel adapters (Slack, email, push, paging)
- Auth for hosted / public surfaces
- Templating / surface-authoring helpers
- Link expiration / one-time-use / persistent surfaces
- Cross-implementation interop testing
- Substantive prompt-injection mitigation patterns

If a subagent feels pulled toward any of these, halt and surface — don't silently expand scope.
