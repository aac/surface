# poke — Session Handoff

**Date:** 2026-05-23 — all surface implementation complete, dogfood ready
**Branch:** `main` @ `a6a2247`
**Status:** v0 still shipped. Arc-rsv2 surface implementation **complete** — all nine deliverables (D1–D9) merged to main. Reach v2 implementation also complete (separate repo). Dogfood is next.

## Next step: dogfood

Run `ask show ask-0d53` — it contains a self-driving dogfood prompt that walks seven validation cases exercising surface v2 and reach-v2 together. Andrew participates as the recipient (choosing friends, confirming sends, responding to surfaces); the agent orchestrates. The prompt is in the ask body — read it and execute it.

After dogfood completes, the compound ticket (act-9ed913) follows — run `/compound` to capture process learnings from the arc.

## What landed (implementation complete)

- **All nine surface deliverables merged:** pattern, wire-example, lifecycle, security (seven-section trust model), hosted-example, example servers (Go + Python), SKILL.md (nine sections, all Q4 cross-reference constraints), plugin manifest, symlink. Both skills loading in harness.
- **Reach v2 also complete** (~/Workspace/reach) — all 13 deliverables merged, symlink at `~/.claude/skills/reach-v2`.

## Key design decisions (cumulative)

- Collaboration trust model native to v2 — trusted recipients' free-text CAN be instructions
- Team is a kind (individual/team), orthogonal to lifetime (ephemeral/enduring)
- Direct-KV-write flagged for investigation, not blessed
- Per-recipient trust risk named, not prescribed — agent decides
- Shared env path fully deferred (both path and schema)
- Surface version 0.1.0-alpha.1 (new skill, own version line)
- Credentials in secure storage with documented bounded retrieval
- Reach delivers any payload shape, not just URLs
- Personal identifiers excluded from produced skills/docs
- Preflight verification for stale credential locations
- Multi-recipient partial delivery failure produces per-recipient outcomes
- Cross-reference constraints pinned, not exact prose
- Channel/recipient separation is the right cut (convergent reviewer signal)
- R5 filename must be `channel-shape.md`, not `adapter-shape.md` (convergent must-fix)

## Release readiness (unchanged)

`v0.1.0` tag still at `37fbe17` — predates plugin restructure.

## Housekeeping (carried forward)

- **`docs/v2-redesign-handoff.md` is untracked.** Should be committed or gitignored.
- **`v0.1.0` tag placement** still out-of-date.

## Reading order for next session

1. This file
2. `ask show ask-0d53` — the dogfood prompt
3. `act ready` for non-arc-rsv2 backlog
