# surface — orientation for agents

`surface` is a pattern + skill that lets an agent generate ephemeral, distributable UI surfaces to collect ad-hoc input from one or more recipients, and react to submissions autonomously. (This repo was previously named `poke`; the v0 skill is in git history.)

## Core principles (load-bearing)

These are the through-lines from the design conversation. They override surface-level "completeness" or "be helpful" instincts when designing the skill or its references. **Read these before any design or implementation decision.**

- **Trust the agent.** Over-specification is the failure mode, not under-specification. If an agent could reasonably figure something out from the pattern + context, the brief/skill must not prescribe it. The reference Go server is illustrative, not normative. Operational concerns (port choice, server teardown, idempotency, timeout, concurrent surfaces, browser caching, state file lifecycle) are agent responsibilities — the pattern doesn't dictate.
- **Non-prescriptive skill content.** SKILL.md surfaces choices; the agent (and user, when interactive) makes them. Lists of options, not recipes. Anti-pattern: "Do X, then Y, then Z." Pattern: "Here's the shape; here are valid mechanisms; pick what fits your environment." The dispatch layer is part of the skill's surface area too: telling a fresh agent to "mirror the Go impl" or "match an existing sibling" when dispatching an alternative-substrate port undoes the principle before the agent reads SKILL.md. References-only ports are dispatched references-only — no sibling impls in context, no byte-identical conformance as pass/fail. Operational divergence is signal the pattern is being independently derived. See §"Testing the skill" below for the full framing.
- **Pattern is the contract.** Everything substrate-specific is illustration. The pattern (mint IDs, persist intent map, render surface, drain channel, autonomous react, ephemeral) survives even if every implementation is thrown away. Alternative wires (Slack interactive messages, Telegram inline keyboards, Cloudflare Worker + KV, raw sockets) are equally valid.
- **Autonomous draining is foundational.** The agent must react to submissions without the user prompting through another channel. Mechanism (Monitor, ScheduleWakeup, fs watch, push webhook) is the agent's choice; the requirement is fixed.
- **Surface stands alone.** No dependency on `ask`, `act`, or any other tool. Agents compose surface with whatever else they're running.
- **Skill content is harness-neutral; packaging is a separate layer.** SKILL.md and `references/` never branch on "for Cowork do X / for Claude Code do Y" — agents derive substrate choice from environmental constraints (can I bind a port? is outbound HTTPS allowed?), not from a harness label. Harness-specific artifacts (`.claude-plugin/plugin.json` for Claude Desktop, install instructions, manifest variants for future harnesses) live at the packaging layer around the skill bundle, never inside it. The same skill bytes ship to every harness; only the wrapper changes. If skill content starts naming harnesses, that's the smell.
- **Interactive vs autonomous invocation.** When invoked in an interactive session, the agent solicits setup preferences from the user. When invoked autonomously (cron, /loop, dispatched agent), it decides alone. Don't conflate the two.
- **Setup vs interaction.** Chat-checks before building a surface are for *setup* decisions (which server, how to deliver the URL, page shape). The interaction itself stays in the surface — that's why surface is being used instead of chat.
- **Security lives in its own reference (`references/security.md`).** SKILL.md stays focused on the pattern. Caveats don't dilute the value of the skill.
- **The defining property is ad-hoc structured input via a flexible, distributable interface.** One valuable consequence: because the URL itself carries the response surface, channels that are only configured to push outward — email, SMS, push, paging — become real reply paths, not just notifications.

## Versioning

`skills/surface/SKILL.md` frontmatter carries a `version:` field. The packaging manifests carry the same `version` in **four** places total: `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and the per-plugin `version` in `.claude-plugin/marketplace.json`. The shared version string lets anyone eyeball-compare what's loaded in a harness (Cowork, Claude Desktop, Codex) against what's in this repo without diffing the full bytes.

**Rule:** any landing that changes skill content (`skills/surface/SKILL.md`, anything under `skills/surface/references/`, anything under `skills/surface/examples/`) bumps **all four** `version:` strings together **and adds a matching `## [<version>]` section to `CHANGELOG.md`**. Patch-bump for content tweaks, minor-bump for new rules / new references / new examples / shape changes. Keep them lockstep — if they ever drift, the comparison signal dies.

**Don't hand-edit the four strings** — run `scripts/bump-version.sh <new-version>`, which rewrites all four in place, then add the `CHANGELOG.md` entry it reminds you about. `scripts/check-versions.sh` verifies the four are in lockstep and is the single source of truth for the check. CI enforces both halves (it calls `scripts/check-versions.sh`, plus a `CHANGELOG.md` entry must exist for the current version — so the changelog can't silently rot behind the manifests, as it did up to 0.6.1), and `.githooks/pre-commit` runs the same check locally before push. (Before this was wired up, `marketplace.json`'s `version` was the one string CI *didn't* check, and it silently drifted to 0.8.0 while the other three sat at 0.8.1.)

## Pre-close gates (code-facts)

Apply the equivalent bar to whichever reference server you touch:

- **Go** (`server.go`): `gofmt -l .` must be empty, `go vet ./...` clean, `go test ./...` green.
- **Node** (`server.mjs`): `node --test server.test.mjs` green.
- **Rust** (`rust/`): `cargo test` green (and `cargo fmt --check`).
- **Python** (`server.py`): no test suite ships yet — at minimum run it and exercise the wire by hand before landing.

A `.githooks/commit-msg` hook guards against direct commits to `main`. These are contributor-facing facts about the repo's quality bar — they apply to anyone working on it.

## Testing the skill (references-only lens)

When testing whether the skill works — via substrate ports, fresh-agent smoke tests, or dogfood — the bar is **"can a fresh agent build a working surface from the docs alone?"** not "does the output match existing implementations byte-for-byte." Operational divergence (different port defaults, different error statuses, different upload-path naming) is signal the pattern is being independently derived. Operational convergence on the wire envelope (state schema, SUBMIT line shape, multipart field name) is signal the docs pinned the right things. Both are validation. Comparing impl-to-impl as a conformance bar is the wrong test.

When a references-only port surfaces a "gap," distinguish **doc ambiguity** (pin it — it belongs on the wire envelope) from **operational variation the substrate is correctly absorbing** (leave it implementation-defined). Default to implementation-defined; pin only what genuinely belongs on the wire. (Early ports over-pinned a few HTTP error statuses that were later relaxed back to implementation-defined — the lesson is to resist pinning operational detail just because a port diverged on it.)

## Project memory policy

Do not store skill *usage* guidance as project memory. Anything that influences how agents use the skill belongs in the skill's own files (`SKILL.md`, `references/`, `examples/`) where it ships with the plugin. Project memory that guides usage creates a divergence: the developer has context that every other user of the skill lacks. Project memory for this repo is limited to development workflow notes, and even those should be rare.

## Branch policy

Feature branches merge to `main` with `git merge --ff-only` (the maintainer integrates from the main checkout). A contributor working on a branch commits and pushes their branch and returns the branch name; the integration step is the maintainer's.

## Halt conditions

When work hits one of these, stop and surface it rather than silently expanding scope: spec ambiguity, a breaking change to land, scope that crosses into another issue, a defect deeper than the issue describes, or anything cross-repo.
