# poke — Session Handoff (end of v0 + extensive dogfood)

**Date:** 2026-05-17 (UTC)
**Branch:** main
**Status:** v0 shipped, three substrates landed (Go local, Python local, Cloudflare Worker hosted), five pokes dogfooded end-to-end (vibe-click, draw-canvas, design-iteration with escape hatch, settings-paste, hosted hi-from-cloudflare). Cloudflare worker is live; ten-plus follow-up tickets open. No work in flight at handoff.

## Substrate state

- **`examples/server.go`** — Go stdlib reference. Includes parent-death watchdog, Cache-Control no-store, `--drain-mode={stdout,fs}` flag for fs-watch drain. 5 tests pass.
- **`examples/server.py`** — Python stdlib reference mirroring the Go contract. 6 tests pass. Cross-impl smoke test confirmed byte-identical wire behavior.
- **`examples/worker/`** — Cloudflare Worker + KV, TypeScript. Deployed live at `https://poke-example.andrew-cove-cloudflare.workers.dev`. Uses KV for per-session state, `/poll` endpoint for drain (no stdout in Worker land), two-layer CSRF (Origin + per-session token), ~128-bit unguessable session IDs as the access boundary. Multipart uploads are 501-stub (R2-backed multipart is a separately tracked v2 candidate).

## Open backlog (no work in flight)

Triaged into "safe to attempt without Andrew" and "needs Andrew" buckets.

**Safe overnight** — no decisions required, root causes validated by dogfood:

- **Worker bare-root 404.** `GET /` currently returns the literal string `ok`. Should 404. p2.
- **Worker trailing-slash redirect.** `GET /<sid>` (no trailing slash) makes `./submit` resolve to `/submit` (root), 404. Either redirect to `/<sid>/` form or prescribe absolute-path fetches in hosted-example.md. **p1** — this is the bug that silently failed the first hi-from-cloudflare poke before the fix-validation succeeded.
- **Example HTML must check `response.ok`.** Current pattern in worker README does `await fetch(...)` and unconditionally shows success. Companion to the "honest confirmation messages" affordance-design rule (which landed in SKILL.md §6 today). p2.
- **Doc precision for non-Go implementers.** `references/wire-example.md` / `docs/plan.md` "Shared contracts" specify `RFC3339Nano` (Go-specific) for timestamps and don't address JSON field ordering. Both surfaced by the Python port. Should relax to "RFC3339-shaped, precision implementation-defined" and "field ordering is implementation-defined, parse by key." p2.
- **Node reference implementation.** Sibling to the just-landed Python port. Stdlib over Express; mirror the Go/Python contracts. p2, looser scope than the others — agent may need to make framework choices (raw `http` vs Express vs Hono). If you want a clean small win overnight, instruct the orchestrator to skip Node.

**Needs Andrew** — skip overnight:

- **R2-backed multipart for the Worker.** v2 candidate. Needs your call on R2 bucket setup, cost framing, possibly a binding choice. p3.
- **Bundled `poke-serve` binary.** Release infrastructure (GoReleaser vs GitHub Action vs checked-in tarballs) is a preference call. p3, explicitly deferred.

## Cloudflare deployment notes

- Live URL: `https://poke-example.andrew-cove-cloudflare.workers.dev`
- KV namespace `POKE_STATE` (id `5f70241b834d4e789d5b9c1272bcc659`) holds session state.
- Two test sessions in KV from today's dogfood (one click captured in each); fine to GC if you want them gone — `wrangler kv key delete ...`.
- `PROVISION_TOKEN` was rotated several times today via `wrangler secret put`. Whatever's current is fine — only used to gate `/_provision`, not session serving.

## bgIsolation harness setting

`/Users/andrewcove/Workspace/poke/.claude/settings.json` now has `{"worktree": {"bgIsolation": "none"}}`. The setting takes effect on the **next** Claude session start in this repo — so the overnight `/orchestrate` session will be able to use `Edit`/`Write` on main-checkout files directly, no Bash heredoc workarounds needed.

## How to kick off overnight

Open a fresh Claude Code session in `~/Workspace/poke`, type `/orchestrate`. The orchestrator will:

1. Read this handoff and CLAUDE.md.
2. Run `act ready` to find unblocked work.
3. Dispatch what fits in parallel (the worker bug fixes likely bundle into one agent on a single branch; the Python-port-surfaced doc-precision is independent; Node port is independent).
4. Merge as agents complete. Halt and surface if any rebase hits conflicts.
5. Stop after one pass. Run `/orchestrate` again in the morning for any further passes.

If you want the conservative version, tell it explicitly: "skip the Node port; do the three worker fixes and the doc-precision relaxation only." If you want it to figure out scope, just `/orchestrate`.

## Halt conditions (orchestrate skill)

- Bg agent reports an issue → halt and surface.
- Rebase hits conflicts → halt and surface (overlapping work).
- Worktree locked by live process → surface, don't force.
- Agent surfaces a question via bg-task → it'll wait; you respond in the morning.

## Reading order for the morning

1. This file (just an overview).
2. `git log` since the timestamp of this commit — see what overnight landed.
3. `act list | grep -v closed` — open backlog after overnight.
