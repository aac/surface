# poke — Session Handoff

**Date:** 2026-05-18 (UTC) — end of late-day hygiene session (after decisions-log session earlier same day)
**Branch:** `main` @ `c614ff3` plus 2 uncommitted edits (`CLAUDE.md`, `docs/plan.md`)
**Status:** v0 still shipped and validated. This session's poke-side work was minor doc hygiene (no skill content changed). Release path unchanged (still gated on act's contributor-local migration).

## What landed this (late) session

- **`docs/plan.md` marked historical via frontmatter.** Added `status: historical` frontmatter; v0 plan was executed and complete, preserved as record of how v0 was built. Existing "Historical note (post-bundle-restructure)" callout retained below the frontmatter. **Uncommitted.**
- **`CLAUDE.md` Strategic-docs line refreshed.** The line for `docs/plan.md` previously read "(to be written; will mirror ask's plan-v1.md shape)" — stale since the plan exists and is executed. Now reflects the actual state. **Uncommitted.**
- **Deferred ticket-filing note from prior handoff resolved as no-action.** Verified during the session sweep; poke's "stands alone" property is intact and no poke-side changes are needed. Misfired ticket `act-fbd4` was filed-and-deleted during the verification; tombstone is in `.act/` history.
- **Principle restated for poke's own docs going forward:** poke describes only poke's substrate; cross-skill compositions (delivery, queuing, anything sibling) are the agent's job, not properties to document here. This handoff was scrubbed of cross-skill references on that basis.

## What landed earlier the same day (decisions-log session — kept for context)

- **`docs/decisions.md` created.** Running log of substantive design choices and notable rejected proposals, with reasoning. Reverse-chronological. Seeded with today's rejection (Tailscale-specific docs + a "Choosing a substrate" property frame in pattern.md — both rejected after adversarial review) plus 6 backfilled historical decisions covering: HTTP-status relaxation (act-087a), references-only test = "working poke-like thing" (act-6fb6), harness-neutral packaging (commit `a79f80c`), repo restructure (act-63fb), v0-ships-skill-only, poke-stands-alone, security-in-its-own-reference.
- **`CLAUDE.md` updated** with `docs/decisions.md` pointer in Strategic docs + a rule to append new entries when substantive design choices land or proposals are rejected on principle grounds.
- **No skill content changed.** Nothing under `skills/poke/SKILL.md`, `references/`, or `examples/` touched — version field unchanged in both SKILL.md and plugin.json per the lockstep rule.

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

Outstanding work is just the release-path sequence (gated on act migration).

## Project key facts (unchanged from prior handoff)

- **Worker live:** `poke.aac.media` (custom domain). KV namespace `POKE_STATE` (id `5f70241b834d4e789d5b9c1272bcc659`), `expirationTtl` ~30 days on puts.
- **Repo layout:** skill bundle at `skills/poke/`. Plugin manifest at `.claude-plugin/plugin.json`. `~/.claude/skills/poke` symlinks into `~/Workspace/poke/skills/poke`.
- **Four substrate impls:** Go (canonical), Python, Node, Rust — all under `skills/poke/examples/`. Plus reveal-pattern reference at `skills/poke/examples/reveal/reveal.go`.
- **Substrate-agnostic claim is load-bearing.** Three independent references-only ports passed wire-contract tests; operational divergences are the validation.
- **Strategic docs:** `docs/brief.md` (converged design), `docs/decisions.md` (running rejected-paths log — new this session), `docs/plan.md` (not yet written).

## Things that survived this session into durable form

- `docs/decisions.md` exists with seed + backfill
- CLAUDE.md "Strategic docs" rule that new design choices / rejected proposals get logged in decisions.md going forward

## Notes for next session

- **Security hook false-positive on JS/MJS files** persists.
- **`v0.1.0` tag placement** still out-of-date relative to repo restructure.

## Reading order for next session

1. This file
2. `git log [last-handoff-sha]..HEAD` for what landed since
3. `docs/decisions.md` — design history before proposing changes to skill content or core principles
4. `act ready` and `ask list` for current state
