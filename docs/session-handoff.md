# poke — Session Handoff

**Date:** 2026-05-17 (UTC) — end of full-arc session
**Branch:** `main` @ `434a5ae` (last content commit `37fbe17`; v0.1.0 tag placed there, two `act-op:` create commits ahead)
**Status:** v0 fully shipped and validated. `v0.1.0` tagged locally. Waiting on one upstream change (act's contributor-local migration) before public release.

## Release readiness

`v0.1.0` is ready for public push the moment **act ships Step 1 of its contributor-local migration** (gitignore `.act/`, make it a per-contributor local git repo — see the spec drafted in chat this session; not committed to either repo). Critical path is then:

1. act ships the migration
2. `git filter-repo` on this repo, regex-dropping `act-op:*` commit subjects (120 of 175 commits currently)
3. Re-tag `v0.1.0` on the rewritten HEAD
4. Create the public GitHub repo, push `main` + tag
5. Announce however

No other release work is outstanding — README is current for v0.1.0, LICENSE is in place, four substrate impls + the Cloudflare worker are documented, install path is in the README. Andrew is the only act user, so the migration is a one-shot operation on a small known set of repos; no migration tooling needs to ship.

## Open backlog

**`act ready`:**
- **act-3530** (epic, p2): multi-project autonomous-poke-delivery for out-of-chat Andrew. Two pieces: `poke.aac.media` as a shared hosted endpoint (custom-domain on the existing worker), and a communication channel (SMS via Twilio / push via Pushover / etc.) for shipping URLs to Andrew when he's not in a chat session. Trigger: real-use moment when Andrew wants to step away from chat with autonomous work running.
- **act-86dd** (task, p3): add KV TTL (~30 days) on session-state puts in `skills/poke/examples/worker/src/index.ts`. Independent of everything; do anytime.

**Asks (`ask list`):** none open. Both prior asks were closed as deferred via the dogfooded poke this session — R2 (no current use case) and bundled binary (waiting for pull-signal).

## Project key facts

- **Worker live:** `https://poke-example.andrew-cove-cloudflare.workers.dev`. KV namespace `POKE_STATE` (id `5f70241b834d4e789d5b9c1272bcc659`). `PROVISION_TOKEN` rotated several times; whatever's current is fine.
- **Four substrate impls:** Go (`skills/poke/examples/server.go`, the canonical reference), Python (`skills/poke/examples/server.py`, references-only-derived), Node (`skills/poke/examples/server.mjs`, references-only-derived), Rust (`skills/poke/examples/rust/`, references-only-derived). Wire envelope identical across all four; operational details diverge by design.
- **Substrate-agnostic claim is load-bearing.** Three independent references-only ports passed the wire-contract tests. Operational divergences (different ports, watchdog choices, body-cap policies) are the validation: the references constrain enough that the pattern survives independent re-derivation, without over-constraining operational choices.

## Things that survived this session into durable form

- `.ask/` initialized; CLAUDE.md documents act + ask side-by-side with the "pickup-able by any agent vs. needs Andrew specifically" decision rule
- Methodology correction landed in SKILL.md / brief.md / CLAUDE.md: substrate-agnostic test asks "can the agent build a working poke-like thing?", not "byte-identical to siblings"
- Three new memory entries in `~/.claude/projects/-Users-andrewcove-Workspace-poke/memory/`: file-the-ticket, references-only-lens
- One process learning compounded to `~/Workspace/knowledge/_guides/process-learnings.md` (stale-watcher pattern, under Operating and resilience)

## Notes for next session

- **Security hook false-positive on JS/MJS files** persists — `security_reminder_hook.py` text-matches its trigger string too broadly. Multiple agents this session hit it; all worked around with heredoc. Worth narrowing the hook's match.
- **Orphan `poke-serv` on port 5173** (PID 96106 at handoff time, possibly different next time) — leftover from a prior dogfood. Not from this session. Andrew can `kill` it whenever he notices; it's not affecting anything.
- **v0.1.0 tag placement.** Tag is at `37fbe17` (the README commit), not at HEAD. Two `act-op: create` commits landed after the tag for the new backlog tickets. Once the filter-repo migration runs, those create-op commits are stripped, and `37fbe17` (or its rewritten equivalent) becomes effectively the released commit. No action needed before then.

## Reading order for next session

1. This file
2. `git log fe45cb6..HEAD` for everything that landed this session
3. `act ready` and `ask list` for current state
