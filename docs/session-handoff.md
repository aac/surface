# poke — Session Handoff

**Date:** 2026-05-23 — implementation underway, two orchestrate loops running
**Branch:** `main` @ `d9618f1`
**Status:** v0 still shipped. Arc-rsv2 moved from plan stage through implementation kickoff in one session. Two fresh orchestrate loops now running (poke + reach).

## What landed this session

- **Plan stage (complete):** both plans written, 4 reviews merged (3× proceed, 1× iterate), synthesis verdict **proceed** with 4 narrow must-fixes.
- **24 implementation tickets filed** — 13 in reach, 9 in poke, 2 umbrella (dogfood + compound). All deps wired including cross-repo external dep on the dogfood ticket (`act update act-4489d0 --ext-add "reach:act-741d56"`).
- **Pass 1 surface implementation (5/9 tickets merged):**
  - D2 pattern reference — `skills/surface/references/pattern.md`
  - D3 wire example — `skills/surface/references/wire-example.md`
  - D4 lifecycle — `skills/surface/references/lifecycle.md`
  - D6 hosted example — `skills/surface/references/hosted-example.md`
  - D7 example servers — `skills/surface/examples/` (Go + Python + tests)

## In-flight: two orchestrate loops

Andrew kicked off clean sessions for both repos. They're handling the remaining implementation:

**Poke (4 tickets remaining):**
- D5 security reference (now unblocked — D2 landed)
- D1 SKILL.md (blocked by D2-D6 — D5 is the last blocker)
- D8 plugin manifest (blocked by D1)
- D9 symlink (blocked by D1)

**Reach (13 tickets):**
- Pass 1: R2, R4, R9, R15 (no deps)
- Pass 2: R3, R5, R6 (blocked by R1+R2)
- Pass 3: R7, R8, R10, R11
- Pass 4: R1/SKILL.md
- Pass 5: R14/symlink

**Umbrella (after both repos finish):**
- Dogfood (act-4489d0) — has `external_dep: reach:act-741d56`, needs `--ext-rm` after reach symlink lands
- Compound (act-9ed913) — blocked by dogfood

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

## Two note-level items carry into implementation

1. **Trusted free-text scope calibration** — the security reference should include a calibration example.
2. **Collaboration trust + URL forwarding walkthrough** — concrete walkthrough of the forwarding vector.

(Both addressed in D5 security reference.)

## Release readiness (unchanged)

`v0.1.0` tag still at `37fbe17` — predates plugin restructure.

## Housekeeping (carried forward)

- **`docs/v2-redesign-handoff.md` is untracked.** Should be committed or gitignored.
- **`v0.1.0` tag placement** still out-of-date.

## Reading order for next session

1. This file
2. `act ready` and `ask list`
3. `docs/reviews/arc-rsv2-plan-synthesis.md` — synthesis with ticket mapping
