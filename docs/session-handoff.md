# poke — Session Handoff

**Date:** 2026-05-17 (UTC) — end of small-followups + reach-spinoff session
**Branch:** `main` @ HEAD (continues from `434a5ae`; many work commits since)
**Status:** v0 fully shipped and validated. `v0.1.0` tag still at `37fbe17` but the repo restructure (act-63fb) means a re-tag at a post-restructure commit is the right move before public push. Waiting on one upstream change (act's contributor-local migration) before public release.

## What landed this session

- **Repo restructured for Claude Desktop plugin packaging (act-63fb).** SKILL.md, references/, and examples/ all moved under `skills/poke/`. `.claude-plugin/plugin.json` added at repo root. `~/.claude/skills/poke` symlink repointed to the new location; Claude Code CLI still resolves it. README and brief updated for the new layout. **This is the biggest delta from the old handoff** — anyone with mental model of "SKILL.md at root" needs to update.
- **Rule 5 added to §6 "Designing affordances" (act-a08b).** "The surface owns the result." Default render onto the surface; named exception is the escape-hatch freetext from Rule 2. Companion `examples/reveal/reveal.go` ships as the concrete reveal-pattern reference. Companion to act-a637/78c1 (Rules 1–4).
- **Hosted substrate consolidated on `poke.aac.media` (act-095c).** Custom domain bound to the existing Cloudflare worker. KV puts now include `expirationTtl` (~30 days) so session state self-cleans (subsumes the old act-86dd KV TTL ticket; both closed). `references/hosted-example.md` updated.
- **act-3530 epic split + retired.** The old "multi-project autonomous-poke-delivery for out-of-chat Andrew" epic conflated two layers. Hosted-substrate piece became act-095c (shipped). Out-of-chat delivery piece became act-d2ee (breadcrumb), then closed when Andrew kicked off `reach` as its own sibling tool — separate repo, separate brief in progress.
- **`reach` kicked off as a new sibling project.** Sibling to ask/act/poke. Owns the out-of-chat *delivery* layer (paging the user when they're away from chat); poke continues to own the *interaction surface*. Composition: agent uses poke to mint a URL, reach to ship it. Currently a brief-generating design conversation in a separate session/repo; no integration with poke until reach ships v0.

## Release readiness

`v0.1.0` tag is still at `37fbe17` — predates this session's plugin restructure. Before public push, retag at a post-restructure commit so the released artifact matches the on-disk layout (skills/poke/, plugin.json at root).

Critical path unchanged otherwise:
1. act ships Step 1 of its contributor-local migration (gitignore `.act/`, per-contributor local git repo — spec drafted in chat at end of v0.1.0-prep session; not committed to either repo)
2. `git filter-repo` on this repo, regex-dropping `act-op:*` commit subjects (count grew since old handoff; recount when running)
3. Re-tag `v0.1.0` on the rewritten HEAD
4. Create public GitHub repo, push `main` + tag
5. Announce however

No README or doc updates outstanding beyond what shipped this session. Andrew is the only act user, so the migration is a one-shot operation on a small known set of repos.

## Open backlog

**`act ready`:** empty. All four prior open tickets shipped or closed this session (act-63fb, act-a08b, act-095c, act-d2ee), plus act-86dd which act-095c subsumed.

**Asks (`ask list`):** none open.

The only outstanding work is the release-path sequence above (gated on act migration) and any followups that emerge from the reach brief-generating session.

## Project key facts

- **Worker live:** now at `poke.aac.media` (custom domain bound to the existing Cloudflare worker). Old `poke-example.andrew-cove-cloudflare.workers.dev` still resolves but documented endpoint is the custom domain. KV namespace `POKE_STATE` (id `5f70241b834d4e789d5b9c1272bcc659`), `expirationTtl` ~30 days on puts. `PROVISION_TOKEN` rotated several times; whatever's current is fine.
- **Repo layout:** skill bundle lives at `skills/poke/` (SKILL.md, references/, examples/). Plugin manifest at `.claude-plugin/plugin.json`. Top-level `docs/`, `examples/` historical-stub-or-equivalent, `README.md`, `LICENSE`, `CLAUDE.md`. `~/.claude/skills/poke` symlinks to `~/Workspace/poke/skills/poke`.
- **Four substrate impls:** Go (`skills/poke/examples/server.go`, canonical reference), Python (`skills/poke/examples/server.py`, references-only-derived), Node (`skills/poke/examples/server.mjs`, references-only-derived), Rust (`skills/poke/examples/rust/`, references-only-derived). Plus the new reveal-pattern reference at `skills/poke/examples/reveal/reveal.go`.
- **Substrate-agnostic claim is load-bearing.** Three independent references-only ports passed the wire-contract tests. Operational divergences (different ports, watchdog choices, body-cap policies) are the validation.

## Sibling-tool context (`reach`)

- Decided this session: out-of-chat delivery becomes its own sibling tool to ask/act/poke, not a feature inside poke.
- Name: `reach`. Verbal logic: "reach out and poke someone."
- Brief-generating session active in a separate repo as of session end. Output expected: `docs/brief.md` in poke's voice and shape (pattern → wire example → lifecycle → distribution → security → out-of-scope).
- Architectural through-lines settled in the seed prompt: poke-shaped contract (define interface, let agents fulfill with whatever channel they have credentials for — Slack, Discord, SMS via Twilio, Pushover, ntfy.sh, email, phone, anything else); per-contributor infrastructure (the user owns delivery, projects don't carry it); XDG for config location (external Unix convention, not coordination with siblings — coordination would be coupling under another name).
- Integration with poke is *not* in flight here. When reach reaches integration-ready state, file a new poke ticket for "agents minting poke URLs can compose with reach to ship them out of chat."

## Things that survived this session into durable form

- Rule 5 in SKILL.md §6 — surface owns the result
- `examples/reveal/reveal.go` — the reveal-pattern reference
- `poke.aac.media` as the documented hosted endpoint
- KV TTL on session state (~30 days)
- Plugin packaging: repo restructure, plugin.json, Claude Desktop discoverability
- `reach` exists as a named sibling tool with a brief-in-progress
- CLAUDE.md harness-neutral / packaging-separate principle (added earlier this session via commit `a79f80c`)

## Notes for next session

- **Security hook false-positive on JS/MJS files** persists — unchanged from prior handoffs. Still worth narrowing the hook's match.
- **v0.1.0 tag placement.** Now meaningfully out-of-date — predates the plugin restructure. Before public push, retag.
- **reach repo location.** Brief-generating session is in its own repo; URL/path TBD by Andrew when he reports back. Worth noting in the *next* handoff so cross-repo coordination has a hook.

## Reading order for next session

1. This file
2. `git log 263086b..HEAD` for everything that landed since the prior handoff
3. `act ready` and `ask list` for current state (both expected empty unless the orchestrator has run again)
4. If `reach` work is the focus: switch repos
