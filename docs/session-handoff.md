# poke — Session Handoff

**Date:** 2026-05-18 (UTC) — end of decisions-log session
**Branch:** `main` @ HEAD (uncommitted: `CLAUDE.md`, `docs/decisions.md`)
**Status:** v0 still shipped and validated; this session was a docs-only addition. Release path unchanged (still gated on act's contributor-local migration).

## What landed this session

- **`docs/decisions.md` created.** Running log of substantive design choices and notable rejected proposals, with reasoning. Reverse-chronological. Seeded with today's rejection (Tailscale-specific docs + a "Choosing a substrate" property frame in pattern.md — both rejected after adversarial review) plus 6 backfilled historical decisions covering: HTTP-status relaxation (act-087a), references-only test = "working poke-like thing" (act-6fb6), harness-neutral packaging (commit `a79f80c`), repo restructure (act-63fb), v0-ships-skill-only, poke-stands-alone, security-in-its-own-reference.
- **`CLAUDE.md` updated.** Added `docs/decisions.md` pointer in "Strategic docs" with a rule to append new entries when substantive design choices land or proposals are rejected on principle grounds. CLAUDE.md is auto-loaded into every session, so the rule fires without anyone having to remember it.
- **No skill content changed.** Nothing under `skills/poke/SKILL.md`, `references/`, or `examples/` touched — version field unchanged in both SKILL.md and plugin.json per the lockstep rule.

## Uncommitted

- `M CLAUDE.md` — Strategic-docs addition
- `?? docs/decisions.md` — new file

Both explained by this session. No version bump needed.

## Release readiness (unchanged from prior handoff)

`v0.1.0` tag is still at `37fbe17` — predates the plugin restructure. Before public push, retag at a post-restructure commit.

Critical path unchanged:
1. act ships Step 1 of its contributor-local migration
2. `git filter-repo` on this repo, regex-dropping `act-op:*` commit subjects
3. Re-tag `v0.1.0` on the rewritten HEAD
4. Create public GitHub repo, push `main` + tag
5. Announce

## Open backlog

**`act ready`:** empty.
**Asks (`ask list`):** none open.

Outstanding work is still just the release-path sequence (gated on act migration) and whatever falls out of the reach brief-generating session.

## Project key facts (unchanged from prior handoff)

- **Worker live:** `poke.aac.media` (custom domain). KV namespace `POKE_STATE` (id `5f70241b834d4e789d5b9c1272bcc659`), `expirationTtl` ~30 days on puts.
- **Repo layout:** skill bundle at `skills/poke/`. Plugin manifest at `.claude-plugin/plugin.json`. `~/.claude/skills/poke` symlinks into `~/Workspace/poke/skills/poke`.
- **Four substrate impls:** Go (canonical), Python, Node, Rust — all under `skills/poke/examples/`. Plus reveal-pattern reference at `skills/poke/examples/reveal/reveal.go`.
- **Substrate-agnostic claim is load-bearing.** Three independent references-only ports passed wire-contract tests; operational divergences are the validation.
- **Strategic docs:** `docs/brief.md` (converged design), `docs/decisions.md` (running rejected-paths log — new this session), `docs/plan.md` (not yet written).

## Sibling-tool context (`reach`, unchanged from prior handoff)

- Out-of-chat delivery is `reach`'s domain, not poke's. Brief-generating session is in a separate repo.
- Integration not in flight; when reach reaches integration-ready state, file a poke ticket for "agents minting poke URLs can compose with reach to ship them out of chat."

## Things that survived this session into durable form

- `docs/decisions.md` exists with seed + backfill
- CLAUDE.md "Strategic docs" rule that new design choices / rejected proposals get logged in decisions.md going forward

## Notes for next session

- **Security hook false-positive on JS/MJS files** persists.
- **v0.1.0 tag placement** still out-of-date relative to repo restructure.
- **reach repo location** — TBD when Andrew reports back from that session.

## Reading order for next session

1. This file
2. `git log [last-handoff-sha]..HEAD` for what landed since
3. `docs/decisions.md` (new) — design history before proposing changes to skill content or core principles
4. `act ready` and `ask list` for current state
5. If reach work is the focus: switch repos
