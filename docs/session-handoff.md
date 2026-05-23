# poke — Session Handoff

**Date:** 2026-05-23 (UTC) — design brief converged, ready for plan stage
**Branch:** `main` @ `b45243b`
**Status:** v0 still shipped. The arc-rsv2 design brief has **converged** — two review rounds (6 reviews + 2 syntheses), all three reviewers say "proceed to plan stage." Andrew's confirmation needed to file plan-stage tickets.

## What landed this session

- **Andrew's feedback on the design brief** (18 items, 8 design decisions). Committed at `f6c6eef`.
- **8 synthesis must-fix items applied** with Andrew's adjustments on collaboration trust model. Committed at `e49b7bb`.
- **Round 1 reviews** (architect, security, cold-eye) — merged. Verdict: iterate.
- **Round 1 synthesis** — 8 must-fix items identified. Merged.
- **Round 2 reviews** (all three stances) — merged. All three: proceed.
- **Round 2 synthesis** — verdict **proceed**. Design brief is frozen. Merged at `b45243b`.
- **Settings fix** — `.claude/settings.json` updated with agent permissions, glob wildcards restored.

## Key design decisions (cumulative)

- Collaboration trust model native to v2 — trusted recipients' free-text CAN be instructions
- Team is a kind (individual/team), orthogonal to lifetime (ephemeral/enduring)
- Direct-KV-write flagged for investigation, not blessed
- Per-recipient trust risk named, not prescribed — agent decides
- Shared env path fully deferred (both path and schema)
- Surface version 0.1.0 (new skill, own version line)
- Credentials in secure storage with documented bounded retrieval
- Reach delivers any payload shape, not just URLs
- Personal identifiers excluded from produced skills/docs
- Preflight verification for stale credential locations
- Multi-recipient partial delivery failure produces per-recipient outcomes
- Cross-reference constraints pinned, not exact prose

## Arc-rsv2 state: ready for plan stage

The design brief is frozen. Next step: file plan-stage tickets. Per the synthesis ticket's shape-of-followups:

1. **Plan: surface v2** — implementation plan for the new skill directory
2. **Plan: reach v2** — implementation plan for reach-next
3. **Plan reviews** (2 each — architect + cold-eye)
4. **Plan-stage synth** — blocked by all plan reviews

Andrew's confirmation is needed before filing these.

## Two note-level items carry into plan stage

1. **Trusted free-text scope calibration** — the security reference should include a calibration example of a plausible-but-out-of-scope instruction to help agents infer scope boundaries.
2. **Collaboration trust + URL forwarding walkthrough** — the security reference should have a concrete walkthrough of the forwarding vector.

## Release readiness (unchanged)

`v0.1.0` tag still at `37fbe17` — predates plugin restructure. Critical path unchanged.

## Open backlog

**`act ready` (arc-rsv2):** empty — design stage complete.
**`act ready` (other):** `act-dded`, `act-3c44`, `act-ef97`, `act-1145`, `act-89b6`, `act-7c2d` (v0 hygiene/Codex-Phase-1).
**Asks:** none open.

## Notes for next session

- **File plan-stage tickets** once Andrew confirms.
- **Direct-KV-write investigation** — implementation plan prerequisite.
- **Security hook false-positive on JS/MJS files** persists.
- **`v0.1.0` tag placement** still out-of-date.
- **`docs/v2-redesign-handoff.md` is untracked.**
- **Settings.json has bgIsolation** that belongs in settings.local.json.

## Reading order for next session

1. This file
2. `docs/arc-reach-surface-v2-design.md` — the frozen design brief
3. `docs/reviews/arc-rsv2-synthesis-r2-2026-05-23.md` — final synthesis
4. `act ready` and `ask list`
