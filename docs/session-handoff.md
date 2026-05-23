# poke — Session Handoff

**Date:** 2026-05-23 (UTC) — post-review synthesis of arc-rsv2 design brief
**Branch:** `main` @ `f9b14a7`
**Status:** v0 still shipped and validated. Design brief reviewed by three agents (architect, cold-eye, security); synthesis verdict is **iterate** with 8 must-fix items. Brief revision needed before plan stage. Andrew's confirmation required before filing iteration or plan-stage tickets.

## What landed this session

- **Andrew's feedback incorporated into the design brief** (committed at `f6c6eef`). 18 feedback items processed, 8 substantive design decisions recorded in `docs/decisions.md`. Key changes: team split from lifetime, direct-KV-write flagged for investigation, third-party security default + operator-trust override, P1 trusts agent more, shared env path fully deferred, surface version 0.1.0, credential retrieval from secure storage encouraged, reach delivers any payload shape, personal identifiers excluded, recipient IDs are agent-generated slugs, one-off-friend walkthrough simplified, recipients can be agents.

- **Three design reviews dispatched, completed, and merged:**
  - `act-fe5699` (security) — no blockers, 4 iterate-level findings. Merged at `34345cd`.
  - `act-524eee` (architect) — would proceed, 2 cutover checklist additions. Merged at `569c0a7`.
  - `act-f1b8f2` (cold-eye) — proceed with 3 iteration items. Merged at `031a371`.

- **Design-stage synthesis completed** (`act-a34e33`). Verdict: **iterate**. Committed at `f9b14a7`.
  - 8 must-fix items identified (all bounded edits to specific sections)
  - 8 items deferred to implementation planning or follow-on arcs
  - Rename (poke → surface) stands with authoring mitigations noted
  - Full synthesis at `docs/reviews/arc-rsv2-synthesis-2026-05-23.md`

- **Settings fix:** `.claude/settings.json` updated with broad agent permissions (Write, Edit, git, act); glob wildcards restored after being stripped. `bgIsolation: none` remains in settings.json (should be in settings.local.json but auto-mode classifier blocks the move).

## Arc-rsv2 state: awaiting Andrew's confirmation

The synthesis verdict is **iterate**. Next steps depend on Andrew's decision:

**If Andrew confirms "iterate":** file an iteration ticket (revise the brief addressing 8 must-fix items), then new review round, then new synth. The 8 must-fix items are:
1. Extend envelope/content trust boundary to trusted submissions (§F)
2. Note per-recipient trust > per-surface trust (§F)
3. Add preflight verification to setup/execution split (§G)
4. Acknowledge bounded-retrieval vs harness-classifier gap (§G)
5. Reframe collaboration canvas stress test to "design-compatible but not validated" (§I)
6. Name multi-recipient partial delivery failure semantics (§E)
7. Pin cross-reference constraints, not exact prose (§D/Q4)
8. Add symlink update + cross-repo path audit to cutover checklist (§H)

**If Andrew says "proceed anyway":** file plan-stage tickets directly (the must-fix items are all bounded and could be addressed during plan drafting instead).

**If Andrew wants to discuss:** the synthesis is at `docs/reviews/arc-rsv2-synthesis-2026-05-23.md`.

## Release readiness (unchanged)

`v0.1.0` tag still at `37fbe17` — predates the plugin restructure. Critical path unchanged (act migration → filter-repo → retag → public push).

## Open backlog

**`act ready` (arc-rsv2):** empty — all review and synth tickets closed.
**`act ready` (other):** `act-dded`, `act-3c44`, `act-ef97`, `act-1145`, `act-89b6`, `act-7c2d` (v0 hygiene/Codex-Phase-1).
**Asks:** none open.

## Project key facts (unchanged)

- **Worker live:** custom domain, KV namespace `POKE_STATE`, ~30 day TTL on puts.
- **Repo layout:** skill bundle at `skills/poke/`. Plugin manifest at `.claude-plugin/plugin.json`.
- **Four substrate impls:** Go, Python, Node, Rust under `skills/poke/examples/`.
- **Strategic docs:** `docs/brief.md` (v0), `docs/decisions.md`, `docs/plan.md` (historical), `docs/arc-reach-surface-v2-design.md` (v2 brief), `docs/reviews/` (3 reviews + synthesis).

## Notes for next session

- **Andrew's confirmation needed** on the iterate verdict before any arc-rsv2 tickets are filed.
- **Direct-KV-write investigation** is a prerequisite surfaced by feedback. Implementation plan needs to settle the provisioning path.
- **Security hook false-positive on JS/MJS files** persists.
- **`v0.1.0` tag placement** still out-of-date.
- **`docs/v2-redesign-handoff.md` is untracked.** Decide whether to commit.
- **Settings.json has bgIsolation** that belongs in settings.local.json; auto-mode classifier blocks the move.

## Reading order for next session

1. This file
2. `docs/reviews/arc-rsv2-synthesis-2026-05-23.md` — the synthesis verdict and must-fix list
3. `docs/arc-reach-surface-v2-design.md` — the brief itself
4. `docs/decisions.md` — design history
5. `act ready` and `ask list` for current state
