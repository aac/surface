# poke — Session Handoff (after overnight orchestrate)

**Date:** 2026-05-17 (UTC, post-overnight)
**Branch:** main @ `1641c3b`
**Status:** Five overnight tickets landed (worker bundle, doc precision, Node reference impl). Only two open tickets remain in backlog and both are explicitly "needs Andrew." One new ticket filed mid-session (act-a063) capturing a substrate-test the previous wave missed by design.

## What landed overnight

- **act-8d70 / 8b68 / fdbe** (worker bundle, single commit `736797e`): Cloudflare worker now 404s bare root with empty body, 308-redirects `/<sid>` → `/<sid>/` so relative-path fetches resolve, and example HTML in `examples/worker/README.md` + `references/hosted-example.md` checks `response.ok` before showing success. `references/wire-example.md` got a one-line companion note for the local-wire case.
- **act-76ea** (doc precision, commit `9b4eea2`): `references/wire-example.md` and `docs/plan.md` "Shared contracts" relax `RFC3339Nano` → `RFC3339, precision implementation-defined`, and call out JSON field ordering as implementation-defined.
- **act-e719** (Node reference impl, commit `73f584b`): `examples/server.mjs` (612 lines) + `examples/server.test.mjs` (318 lines, 9 tests, all pass). Node stdlib only, hand-rolled multipart parser, atomic state writes, parent-death watchdog — mirrors Go/Python shape. Cross-impl byte-identical wire confirmed: same SUBMIT line from all three servers for the same JSON submission.

Test gates green on merged main: `gofmt -l .` empty, `go vet` clean, `go test` ok, Node tests 9/9 pass.

## Cloudflare worker — needs your action

Code changes are merged but **NOT deployed**. Run:

```
cd examples/worker && wrangler deploy
```

Then re-test the bare-root and trailing-slash bugs against the live URL.

## Open backlog after overnight

**Needs Andrew (skip without your call):**

- **act-9dc1** (p3, v2-candidate): R2-backed multipart for the Cloudflare worker. Needs R2 bucket setup, cost framing, possibly a binding choice.
- **act-db17** (p3, v1-candidate): Bundled `poke-serve` binary. Release infrastructure (GoReleaser vs GitHub Action vs checked-in tarballs) is a preference call.

**New mid-session — caught a flaw in last night's substrate-test design:**

- **act-a063** (p2, task): Build a sibling reference impl from references ONLY (no peek at `examples/`). The "alternative-language" wave (Python in act-7bd1, Node in act-e719) was supposed to validate the substrate-agnostic claim, but both ports were dispatched with the existing implementations explicitly in their context-gathering prompts. They cloned the existing impls' shape rather than independently deriving from the references. The proper test: pick a language sufficiently distinct (Rust, Deno, Elixir, Ruby), forbid reading `examples/` until the impl is done, post-impl coherence pass to surface doc gaps. The Python port's doc-precision findings (act-76ea) were a partial signal — a references-only run would surface a richer, more representative set.

## Notes from the agents

- **Security hook false-positive on Node files.** The Node-port agent reported that `security_reminder_hook.py` fires with a warning about a particular shell-invocation API when writing `examples/server.mjs`, even though the file doesn't use that API. The hook's text-match is too broad on JS/MJS files (it even fires on prose mentioning the trigger string). Worked around with a heredoc. Worth knowing if more Node work lands — and worth considering whether the hook should narrow its match.

## bgIsolation harness setting

`.claude/settings.json` has `{"worktree": {"bgIsolation": "none"}}` (set yesterday). Took effect for the overnight session — the orchestrator was able to Edit/Write on main-checkout paths directly when needed.

## Worktree cleanup status

Two of three completed worktrees were force-removed mid-pass. One worktree (`agent-a700b06f7e0f63304`, doc-precision) is still around because the orchestrator's cwd lived inside it; it'll get cleaned up the next time `/orchestrate` runs.

## What to do next

If you want to keep momentum on the project itself:

1. Deploy the worker (above) — gates the dogfood validation of the bug fixes.
2. Re-dogfood the hi-from-cloudflare poke against the deployed fix — confirm trailing-slash redirect works in practice.
3. Decide on act-a063 (references-only substrate test) — Rust? Deno? Elixir? Pick a language and let an `/orchestrate` pass dispatch it with the corrected constraints.

If you want to stop here, the backlog is calmly waiting and v0 is fully shipped + substrate-agnostic-by-three-impls (with the caveat captured in act-a063 about how the third was validated).

## Reading order for next session

1. This file (just an overview).
2. `git log e21fb56..HEAD` — full diff of the overnight work.
3. `act list | grep -v closed` — current open backlog (should match the three tickets above).
