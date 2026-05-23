# poke — Session Handoff

**Date:** 2026-05-23 — all surface implementation tickets complete
**Branch:** `main` @ `cecc2df`
**Status:** v0 still shipped. Arc-rsv2 surface implementation **complete** — all nine deliverables (D1–D9) merged to main. Dogfood and compound tickets remain, blocked on reach-side external dep.

## What landed this session

- **All nine surface implementation deliverables merged to main:**
  - D2 pattern reference — `skills/surface/references/pattern.md`
  - D3 wire example — `skills/surface/references/wire-example.md`
  - D4 lifecycle — `skills/surface/references/lifecycle.md`
  - D5 security reference — `skills/surface/references/security.md` (seven sections: trust boundary, third-party default, collaboration trust, scope calibration, URL forwarding walkthrough, deployment posture, attribution)
  - D6 hosted example — `skills/surface/references/hosted-example.md`
  - D7 example servers — `skills/surface/examples/` (Go + Python + tests)
  - D1 SKILL.md — `skills/surface/SKILL.md` (nine sections, all six Q4 cross-reference constraints satisfied, version 0.1.0-alpha.1)
  - D8 plugin manifest — `.claude-plugin/plugin.json` updated to list both skills
  - D9 symlink — `~/.claude/skills/surface` → `~/Workspace/poke/skills/surface` (confirmed loading in harness)

## Remaining arc-rsv2 tickets (blocked on external dep)

- **Dogfood** (act-4489d0) — blocked by `reach:act-741d56` (reach-side symlink/impl). Once reach v2 implementation completes and that external dep is removed, this unblocks.
- **Compound** (act-9ed913) — blocked by dogfood.

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
2. `act ready` and `ask list`
3. `docs/reviews/arc-rsv2-plan-synthesis.md` — synthesis with ticket mapping
