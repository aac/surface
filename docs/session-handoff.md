# surface — Session Handoff

**Date:** 2026-05-28 — first /orchestrate pass + repo went public on GitHub
**Branch:** `main` @ `9dea0e6`
**Status:** Repo is now public at https://github.com/aac/surface. Three units landed via orchestrator, one retired as false-positive, three follow-ups filed-and-fixed inline. **CI is currently red on main** — see "Loose ends" below.

## What shipped this session

- **Boilerplate hygiene** (act-ef97): `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, three GitHub issue templates, no-telemetry line in `README.md`.
- **CI workflow** (act-1145): `.github/workflows/ci.yml` — markdown lint with calibrated `.markdownlint.json`, plugin manifest validation enforcing three-way SKILL.md ↔ claude-plugin ↔ codex-plugin version-lockstep invariant, Go reference-server tests.
- **Version drift reconciled** (act-e23c59 + act-9dc9f4): all three version strings aligned at `0.1.2`, then bumped to `0.1.3` after the codex-name fix. `skills/surface/go.mod` now declares real `go 1.22` (was non-existent `1.26.3`); CI switched to `go-version-file` for single-source toolchain.
- **Codex plugin rename caught and fixed** (act-7d405d): `.codex-plugin/plugin.json` `.name` was still `"poke"` and description was the stale poke framing — fixed to `"surface"` + canonical description. Surfaced by reading the manifest during the version reconciliation.
- **Retired as stale**: act-271b11 (the "SKILL.md §7→§9 numbering gap" claim — verified the file already had sequential §§1-9; closed without code change).
- **Public repo created**: `aac/surface`, public, MIT, pushed main with all five commits.
- **Project**: settings.json pretty-printed and `worktree.bgIsolation: none` confirmed (d4e36f5).

## Loose ends

- **CI is failing on main**. Two markdownlint MD036 violations in the boilerplate issue templates:
  - `.github/ISSUE_TEMPLATE/bug_report.md:18` — `**Environment**` used as bold-emphasis instead of `## Environment`
  - `.github/ISSUE_TEMPLATE/question.md:13` — `**Question**` used as bold-emphasis instead of `## Question`

  Either fix the two files (convert `**X**` → `## X`) or add `MD036` to the disabled rules in `.markdownlint.json`. The second CI run on the codex-name commit (9dea0e6) will hit the same failure when it completes.

- **`.claude/scheduled_tasks.lock`** is untracked at repo root. Should be added to `.gitignore` — comes from `/loop` scheduling state; not meant to be committed.

## Open backlog (8 units, all independent)

- act-ba56f9 — Can affordances be grouped by itemId on drain? (filed by another session)
- act-55e209 — Specify no-submission timeout/discard semantics
- act-839f86 — Emphasize information-dense use cases in SKILL.md 'when to use'
- act-234249 — Design: multi-recipient attribution for hosted surface sessions
- act-864b91 — Add multi-round collaborative worked example to references
- act-dded — Update SKILL.md frontmatter description (copy-to-paste runbook discoverability)
- act-3c44 — Codex Phase 1 smoke test
- act-89b6 — Refactor lifecycle.md to harness-neutral category names
- act-339ac1 — Strengthen URL-delivery fallback chain (pri 3)
- act-7c2d — install.sh as CLI-only fallback install path (pri 3)

The SKILL.md cluster (839f86, dded, 339ac1, 55e209) and the references/ pair (89b6, 864b91) all bump the lockstep version field; they need one-per-pass sequencing to avoid frontmatter merge conflicts during parallel orchestrate dispatch.

## Next session

CI fix is the headline. After that, the SKILL.md cluster + references/ pair are good orchestrator-sequenced candidates; act-3c44 (Codex smoke) is fully independent and could run in parallel with whichever skill-content unit is dispatched.
