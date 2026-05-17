# poke — orientation for agents

`poke` is a pattern + skill that lets an agent generate ephemeral, distributable UI surfaces to collect ad-hoc input from a user, and react to submissions autonomously. v0 ships only the skill bundle; v1 wraps the canonical wire into an installable binary.

## Core principles (load-bearing)

These are the through-lines from the v0 design conversation. They override surface-level "completeness" or "be helpful" instincts when designing the skill or its references. **Read these before any design or implementation decision.**

- **Trust the agent.** Over-specification is the failure mode, not under-specification. If an agent could reasonably figure something out from the pattern + context, the brief/skill must not prescribe it. The reference Go server is illustrative, not normative. Operational concerns (port choice, server teardown, idempotency, timeout, concurrent pokes, browser caching, state file lifecycle) are agent responsibilities — the pattern doesn't dictate.
- **Non-prescriptive skill content.** SKILL.md surfaces choices; the agent (and user, when interactive) makes them. Lists of options, not recipes. Anti-pattern: "Do X, then Y, then Z." Pattern: "Here's the shape; here are valid mechanisms; pick what fits your environment."
- **Pattern is the contract.** Everything substrate-specific is illustration. The pattern (mint IDs, persist intent map, render surface, drain channel, autonomous react, ephemeral) survives even if every implementation is thrown away. Alternative wires (Slack interactive messages, Telegram inline keyboards, Cloudflare Worker + KV, raw sockets) are equally valid.
- **Autonomous draining is foundational.** The agent must react to submissions without the user prompting through another channel. Mechanism (Monitor, ScheduleWakeup, fs watch, push webhook) is the agent's choice; the requirement is fixed.
- **poke stands alone.** No dependency on `ask`, `act`, or any other tool. Agents compose poke with whatever else they're running.
- **Interactive vs autonomous invocation.** When invoked in an interactive session, the agent solicits setup preferences from the user. When invoked autonomously (cron, /loop, dispatched agent), it decides alone. Don't conflate the two.
- **Setup vs interaction.** Chat-checks before building a poke are for *setup* decisions (which server, how to deliver the URL, page shape). The interaction itself stays in poke — that's why poke is being used instead of chat.
- **Security lives in its own reference (`references/security.md`).** SKILL.md stays focused on the pattern. Caveats don't dilute the value of the skill.
- **One-way outbound channels are a useful consequence, not the definition.** The defining property is "ad-hoc input via a flexible, easily distributable interface." One-way channels (email, SMS, push, paging) becoming viable is a consequence of the URL carrying the response surface — useful framing, but not the core.

## Strategic docs

- `docs/brief.md` — converged v0 design (pattern, wire example, lifecycle, skill structure, security stance, out-of-scope). Read before any design-semantics work.
- `docs/plan.md` — task-by-task implementation plan (to be written; will mirror `ask`'s `plan-v1.md` shape).

## v0 deliverable scope

- `SKILL.md` + `references/{pattern,wire-example,lifecycle,security}.md` + `examples/server.go`. No bundled binary, no installable tool, no MCP server. Bundling is v1.
- Distribution: `git clone` into `~/Workspace/poke`; symlink to `~/.claude/skills/poke`.
- Verification gate (v0 complete =): `examples/server.go` compiles and runs end-to-end against a curl'd submission; SKILL.md activates via the symlink (smoke test).

## Future setup (when implementation begins)

These get added when the plan begins implementation, not now:

- `act` for task tracking — same conventions as the ask repo (`act ready`, `act show`, `act update --claim`, `act close --reason`, commits include `(act-XXXX)` markers).
- `.act/hooks/close` for pre-close gates (`gofmt -l .` empty, `go vet ./...`, `go test ./...`).
- `.githooks/commit-msg` for direct-commit-to-main guard, matching the pattern in the ask repo.

## Branch policy

Solo dogfooded repo. Orchestrator merges feature branches to `main` with `git merge --ff-only` from the main checkout. Agents working in worktrees do NOT merge their own branches — commit, push branch if conventions require, return branch name in the report.

## Halt conditions

Per the global act skill rules: spec ambiguity, breaking change to land, cross-issue scope, deeper defect than the issue describes, or anything cross-repo. Halt and surface; don't silently expand scope.
