# poke — orientation for agents

This repo ships two skills: **`surface`** (the active v2 skill) and **`poke`** (the v0 predecessor, now historical). The `surface` skill is what's loaded at `~/.claude/skills/surface` — use it for all new work. The `poke` skill under `skills/poke/` is preserved as a historical reference but is no longer symlinked or active.

`surface` is a pattern + skill that lets an agent generate ephemeral, distributable UI surfaces to collect ad-hoc input from one or more recipients, and react to submissions autonomously.

## Core principles (load-bearing)

These are the through-lines from the v0 design conversation. They override surface-level "completeness" or "be helpful" instincts when designing the skill or its references. **Read these before any design or implementation decision.**

- **Trust the agent.** Over-specification is the failure mode, not under-specification. If an agent could reasonably figure something out from the pattern + context, the brief/skill must not prescribe it. The reference Go server is illustrative, not normative. Operational concerns (port choice, server teardown, idempotency, timeout, concurrent pokes, browser caching, state file lifecycle) are agent responsibilities — the pattern doesn't dictate.
- **Non-prescriptive skill content.** SKILL.md surfaces choices; the agent (and user, when interactive) makes them. Lists of options, not recipes. Anti-pattern: "Do X, then Y, then Z." Pattern: "Here's the shape; here are valid mechanisms; pick what fits your environment." The dispatch layer is part of the skill's surface area too: telling a fresh agent to "mirror the Go impl" or "match an existing sibling" when dispatching an alternative-substrate port undoes the principle before the agent reads SKILL.md. References-only ports are dispatched references-only — no sibling impls in context, no byte-identical conformance as pass/fail. Operational divergence is signal the pattern is being independently derived. See `docs/brief.md` §"The substrate-agnostic test (methodology)" for the full framing.
- **Pattern is the contract.** Everything substrate-specific is illustration. The pattern (mint IDs, persist intent map, render surface, drain channel, autonomous react, ephemeral) survives even if every implementation is thrown away. Alternative wires (Slack interactive messages, Telegram inline keyboards, Cloudflare Worker + KV, raw sockets) are equally valid.
- **Autonomous draining is foundational.** The agent must react to submissions without the user prompting through another channel. Mechanism (Monitor, ScheduleWakeup, fs watch, push webhook) is the agent's choice; the requirement is fixed.
- **poke stands alone.** No dependency on `ask`, `act`, or any other tool. Agents compose poke with whatever else they're running.
- **Skill content is harness-neutral; packaging is a separate layer.** SKILL.md and `references/` never branch on "for Cowork do X / for Claude Code do Y" — agents derive substrate choice from environmental constraints (can I bind a port? is outbound HTTPS allowed?), not from a harness label. Harness-specific artifacts (`.claude-plugin/plugin.json` for Claude Desktop, install instructions, manifest variants for future harnesses) live at the packaging layer around the skill bundle, never inside it. The same skill bytes ship to every harness; only the wrapper changes. If skill content starts naming harnesses, that's the smell.
- **Interactive vs autonomous invocation.** When invoked in an interactive session, the agent solicits setup preferences from the user. When invoked autonomously (cron, /loop, dispatched agent), it decides alone. Don't conflate the two.
- **Setup vs interaction.** Chat-checks before building a poke are for *setup* decisions (which server, how to deliver the URL, page shape). The interaction itself stays in poke — that's why poke is being used instead of chat.
- **Security lives in its own reference (`references/security.md`).** SKILL.md stays focused on the pattern. Caveats don't dilute the value of the skill.
- **One-way outbound channels are a useful consequence, not the definition.** The defining property is "ad-hoc input via a flexible, easily distributable interface." One-way channels (email, SMS, push, paging) becoming viable is a consequence of the URL carrying the response surface — useful framing, but not the core.

## Strategic docs

- `docs/brief.md` — converged v0 design (pattern, wire example, lifecycle, skill structure, security stance, out-of-scope). Read before any design-semantics work.
- `docs/plan.md` — v0 implementation plan, executed and complete. Marked `status: historical` in its frontmatter; preserved as a record of how v0 was built. Not a forward-looking roadmap.
- `docs/decisions.md` — running log of substantive design choices and notable rejected proposals, with reasoning. Read before proposing changes to skill content or the core principles; check whether the proposal has already been considered. **Append a new entry whenever a substantive design choice is made — especially when a proposal is rejected on principle grounds — so the rationale doesn't have to be re-litigated.** Routine implementation choices and ticket-level work breakdowns stay out (those live in `act` history and commit messages); decisions.md is for design-semantics calls whose reasoning will still matter in six months. Reverse-chronological; new entries go at the top, under the "When to add an entry" preamble.

## v0 deliverable scope (historical)

v0 (`skills/poke/`) is complete and preserved as a historical reference. The active skill is `skills/surface/`.

- Distribution: `git clone` into `~/Workspace/poke`; symlink `skills/surface/` to `~/.claude/skills/surface`.

## Versioning

`skills/surface/SKILL.md` frontmatter carries a `version:` field. `.claude-plugin/plugin.json` carries the same `version`. Andrew uses these to eyeball-compare what's loaded in Cowork / Claude Desktop against what's in this repo without diffing the full bytes.

**Rule:** any landing that changes skill content (`skills/surface/SKILL.md`, anything under `skills/surface/references/`, anything under `skills/surface/examples/`) bumps **both** `version:` strings together. Patch-bump for content tweaks, minor-bump for new rules / new references / new examples / shape changes. Keep them lockstep — if they ever drift, the comparison signal dies.

## Project trackers (active)

Two trackers run alongside each other on this project. They serve distinct audiences and should not be conflated.

- **`act`** — agent task tracker. Implementation work the next available agent can pick up. `act ready` lists unblocked work; `act update --claim <id>` to take it; `act close <id> --reason "..."` when done; commit messages include `(act-XXXX)` markers. Pre-close gates: `gofmt -l .` empty, `go vet ./...`, `go test ./...`. Direct-commit-to-main guard via `.githooks/commit-msg`.
- **`ask`** — agent-to-human request inbox. Things Andrew needs to decide or act on personally — paid-infrastructure provisioning, design preference calls, anything where the resolution requires Andrew's judgment, not implementation skill. `ask list` to see open asks; agents file via `ask new <title> --urgency <blocker|normal|fyi> --body "..."`. Convert an act ticket to an ask (and close the act side with `--reason "converted to ask-XXXX"`) the moment you realize the blocker is Andrew's call, not pending implementation.

Decision rule: is this work that any agent could pick up and do, or work that needs Andrew specifically? Former → act. Latter → ask.

Note: this is the **project's** workflow. The `poke stands alone` principle in §"Core principles" is about the poke skill having no dependency on ask/act — that's a property of the skill bundle, not a comment on how we run this repo's own development.

## Branch policy

Solo dogfooded repo. Orchestrator merges feature branches to `main` with `git merge --ff-only` from the main checkout. Agents working in worktrees do NOT merge their own branches — commit, push branch if conventions require, return branch name in the report.

## Halt conditions

Per the global act skill rules: spec ambiguity, breaking change to land, cross-issue scope, deeper defect than the issue describes, or anything cross-repo. Halt and surface; don't silently expand scope.
