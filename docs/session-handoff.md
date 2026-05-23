# poke — Session Handoff

**Date:** 2026-05-23 — plan stage complete, awaiting Andrew's confirmation to file implementation tickets
**Branch:** `main` @ `45b6c2c`
**Status:** v0 still shipped. Arc-rsv2 plan stage **complete** — both plans written, all four reviews done (3× proceed, 1× iterate), synthesis verdict is **proceed**. 24 implementation tickets drafted in the synthesis doc, not yet filed.

## What landed this session

- **Reach v2 plan** (`docs/arc-reach-surface-v2-plan-reach.md`) — 15 deliverables, 6-phase dep graph, migration path from v0 adapters.
- **Surface v2 plan** (`docs/arc-reach-surface-v2-plan-surface.md`) — 9 deliverables, 4-pass dep graph, collaboration trust model, all synthesis carry-forward items addressed.
- **Four plan reviews:**
  - Reach cold-eye: proceed (2 must-fix)
  - Reach architect: proceed (2 must-fix)
  - Surface cold-eye: proceed (2 should-fix)
  - Surface architect: iterate (2 must-fix)
- **Plan-stage synthesis** (`docs/reviews/arc-rsv2-plan-synthesis.md`) — verdict: **proceed** with 4 must-fix corrections (narrow, all addressable during implementation). 24 implementation tickets drafted.

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

## Next step: Andrew confirms implementation ticket filing

The synthesis doc (`docs/reviews/arc-rsv2-plan-synthesis.md`) has the full draft of 24 implementation tickets:
- 13 reach tickets (filed in ~/Workspace/reach/.act/)
- 9 surface tickets (filed in poke/.act/)
- 2 umbrella tickets: dogfood + compound (filed in poke/.act/)

Andrew needs to review and confirm before these are filed. The must-fix corrections (4 items) are narrow enough to address during implementation — no plan revision round needed.

## Two note-level items carry into implementation

1. **Trusted free-text scope calibration** — the security reference should include a calibration example.
2. **Collaboration trust + URL forwarding walkthrough** — concrete walkthrough of the forwarding vector.

(Both addressed in the surface plan's D5 deliverable.)

## Release readiness (unchanged)

`v0.1.0` tag still at `37fbe17` — predates plugin restructure.

## Open backlog

**`act ready` (arc-rsv2):** empty — plan stage complete, implementation tickets pending Andrew's confirmation.
**`act ready` (other):** `act-dded`, `act-3c44`, `act-ef97`, `act-1145`, `act-89b6`, `act-7c2d` (v0 hygiene/Codex-Phase-1).
**Asks:** none open.

## Housekeeping (carried forward)

- **`docs/v2-redesign-handoff.md` is untracked.** Should be committed or gitignored.
- **Security hook false-positive on JS/MJS files** persists.
- **`v0.1.0` tag placement** still out-of-date.

## Reading order for next session

1. This file
2. `docs/reviews/arc-rsv2-plan-synthesis.md` — synthesis with implementation ticket draft
3. `docs/arc-reach-surface-v2-plan-reach.md` — reach v2 plan
4. `docs/arc-reach-surface-v2-plan-surface.md` — surface v2 plan
5. `act ready` and `ask list`
