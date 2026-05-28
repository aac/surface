# surface — Session Handoff

**Date:** 2026-05-28 — large `/loop /orchestrate` pass; queue drained from 10 to 0
**Branch:** `main` @ `fa5b1af` (origin/main in sync)
**Version:** 0.1.12 (was 0.1.3 at session start; 9 lockstep bumps landed)

## What shipped this session

Thirteen units closed via the orchestrator across multiple parallel waves. Surface advanced from 0.1.3 to 0.1.12.

### Discoverability and framing (SKILL.md)

- **Copy-to-paste runbook trigger** (act-dded) — frontmatter description now names "runbook delivery: a list of commands the user runs one at a time with per-step copy/done affordances," so a fresh agent scanning trigger descriptions reaches for surface on runbook work.
- **Information-dense use cases** (act-839f86) — "When to use" now names the rich-context + multi-granularity input shape (clinical-consult level of complexity: vitals grids, lab tables, multi-paragraph narratives + multiple decision granularities on one page). Description updated lockstep.
- **URL delivery bottom-of-chain** (act-339ac1) — §2 now names the fall-through (paste in chat / log / ask operator) when reach/osascript/sendmail are unavailable, framed as a named fallback, not a recipe.
- **Per-recipient URL attribution pointer** (act-11a0de) — §9 now surfaces security.md §7's per-recipient-URL guidance as the recommended attribution mechanism, with cross-ref instead of duplication.

### Skill references (references/)

- **lifecycle.md harness-neutral refactor** (act-89b6) — four mechanism categories renamed to shape-based names (push-stream on subprocess stdout / scheduled wake-ups for cadence / FS drop-directory watch / push webhook); each now presents Claude Code and Codex primitives side-by-side. Codex agents reading the file see themselves in it.
- **No-submission timeout/discard semantics** (act-55e209) — new section in lifecycle.md frames the give-up question as an agent decision (not a protocol timeout) with per-mechanism cadence-shape examples and five options when the agent decides to stop draining.
- **Multi-round collaborative reference** (act-864b91) — new file `references/multi-round.md` walks the pattern where the agent iteratively synthesizes across submissions from multiple recipients and generates new surfaces from the outputs (Japan-trip dogfood pattern, made first-class).
- **Multi-affordance-per-item pattern** (act-abcccb) — pattern.md now shows the intent-as-item-reference shape (`{action, item_id, ...}`) and groupBy-after-drain; the surface pattern is unchanged, the capability is made visible.
- **Per-recipient URL walkthrough** (act-cd16d3) — hosted-example.md gets a four-stage worked example (provision N, deliver per-recipient URLs, drain across sessions, synthesize with no-show detection) alongside the existing single-recipient walkthrough.

### Tooling

- **install.sh** (act-7c2d) — CLI-only fallback install path with `--target {claude,codex}`, `--uninstall`, XDG-respecting curl-piped install. Idempotency and uninstall both verified.
- **Codex Phase 1 smoke artifact** (act-3c44) — `scripts/codex-smoke.sh` (automated checks: CLI presence, install, version cross-check, wire smoke) + `scripts/codex-smoke.md` (manual verification checklist M1–M3) for Andrew to verify Phase 1 acceptance from the integration plan in one sitting.
- **README poke→surface scrub** (act-926264) — 22 stale `poke` references gone; final grep count 0.

### Design decisions (docs/decisions.md, no skill content change)

- **itemId affordance grouping** (act-ba56f9) — pushback. No itemId concept needed; affordance intent is any-JSON; callers encode item refs and `groupBy`. Spawned act-abcccb (above) to make the pattern visible.
- **Multi-recipient attribution** (act-234249) — pushback. Attribution is caller concern; trust boundary named in security.md §7. Spawned act-11a0de and act-cd16d3 (above) to surface the existing mechanism and add a walkthrough.

## State

- `act ready` returns 0. No bg agents in flight. CI was already green on main at session start (the prior session's noted markdownlint MD036 issue had been resolved by commit 210f733, which disabled MD036 — that was already in place when this session began).
- Two stray local branches (`worktree-agent-a43ba400e97c28265`, `worktree-agent-a80ed64f7094241f5`) carry commits not on main from prior sessions — left as-is, didn't block this session.

## Loose ends

- None at the project level. The `docs/arc-reach-surface-v2-*` design docs are unchanged from session start; whatever the next arc is, it'd start there.

## Next session

Backlog is empty as of this handoff. Likely next moves:

1. **Andrew runs `scripts/codex-smoke.sh`** and the M1–M3 manual steps in `scripts/codex-smoke.md` to actually verify Phase 1 of the Codex integration. That's the only acceptance criterion from the original Phase 1 ticket that wasn't auto-verified (it requires running Codex interactively).
2. New work from any direction — design-question triage, a new arc, dogfood-driven tickets — would start in `docs/brief.md` or as fresh `act` entries.
