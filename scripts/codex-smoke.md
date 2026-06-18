# Codex Phase 1 smoke test — verification guide

This document walks through the full Codex Phase 1 acceptance criteria for the
surface skill. Work through it after running `scripts/codex-smoke.sh`.

## What the script does automatically

1. Confirms `~/.codex/` exists and the `codex` CLI is reachable.
2. Installs `~/.codex/skills/surface/` from the repo checkout via symlink (copy
   fallback). Skippable with `--skip-install` if already installed.
3. Verifies SKILL.md and all core references (`pattern.md`, `lifecycle.md`,
   `wire-example.md`, `security.md`) are present and readable at the install
   location.
4. Reports the skill version in place and flags any version drift between
   `SKILL.md` and `.codex-plugin/plugin.json`.
5. Builds the Go reference server, starts it on port 15173 against a minimal
   two-affordance state file, submits both affordances via `curl`, and verifies
   that the correct `SUBMIT` lines land on server stdout and that the state file
   is updated — exercising the wire end-to-end without a Codex session.

## Skill install mechanism

The script installs `~/.codex/skills/surface/` as a symlink pointing at
`skills/surface/` in the repo checkout. This is the preferred path because it
means any edit to the repo source is immediately visible to Codex without
re-running the install. If the filesystem rejects symlinks, the script falls
back to a directory copy.

The `.codex-plugin/plugin.json` at the repo root advertises the skill via the
`"skills": "./skills/"` field, pointing at the same `skills/` directory. This
is the packaging-layer artifact — it is not what the script uses for install.
The script uses the direct `~/.codex/skills/` path because Codex loads skills
from there at session start; the plugin.json path is for marketplace-style
discovery, which is a separate mechanism.

## Manual verification checklist

Work through these steps in order. Each has a pass criterion and a description
of what friction looks like.

### M1 — Skill loads in Codex

Start a fresh Codex session (`codex`) and ask: "What skills do you have
available? Do you have a skill called surface?"

**Pass:** Codex confirms surface is available and describes it as a way to
collect ad-hoc structured input from recipients via a distributable interface
with autonomous draining of submissions.

**Friction signals:**
- Codex says it doesn't have the skill → check `~/.codex/skills/` and restart
  the session.
- Codex describes surface as "a Claude Code skill" or otherwise Claude-specific
  → the skill content may have leaked harness-specific language, or the skill
  loaded from a Claude-branded path.

### M2 — Agent identifies when to use surface

In the same session, describe a scenario without naming surface: "I need to
send an approval request to a colleague who isn't in chat. They need to pick
one of three options and I need to react automatically. What would you use?"

**Pass:** Codex identifies surface as the right tool and explains the pattern in
substrate-neutral terms — a URL that delivers a structured interface, autonomous
draining of the submission, no dependency on the recipient being in chat.

**Friction signals:**
- Codex says "I can't run a local server" and stops without offering hosted
  alternatives → the skill should be surfacing Cloudflare Worker + KV, a hosted
  endpoint, or other non-loopback options.
- Codex says Monitor or ScheduleWakeup are *required* (not just one option) →
  these are Claude Code primitives; lifecycle.md lists them as candidates, not
  requirements. If Codex is reading them as required, that's a harness-
  neutrality failure worth surfacing.

### M3 — End-to-end surface flow (no Claude-specific primitives)

Ask Codex to build a minimal surface: "Using the surface skill, build a
two-choice approval surface with Approve and Reject buttons. Start a local HTTP
server on any free port, deliver the URL to me in chat, and when I submit a
choice tell me what you received."

Walk through the expected behavior:

1. Codex mints opaque affordance IDs — they will be random-looking hex or
   UUIDs, not the human-readable button labels.
2. Codex writes state.json and surface.html, starts a server using whatever
   substrate is available in its environment (not necessarily Go).
3. Codex delivers the URL in chat.
4. Open the URL in your browser; click one button.
5. Codex reacts and reports back without any additional prompting from you.

**Pass:** All five steps complete. The drain mechanism is whatever Codex chose
for its environment. The affordance IDs in state.json are opaque. Codex reports
the correct intent when you click.

**Friction signals:**
- Codex stalls after you click and waits for you to "tell it you clicked" →
  autonomous draining is failing; this is the most important acceptance
  criterion.
- Codex tries to use `Monitor` or `KillShell` and fails with an unknown-tool
  error → these are Claude Code harness primitives. Codex should derive its
  drain mechanism from its own environment (polling with `exec`, filesystem
  watch, push webhook) rather than assuming CC-specific tools.
- Human-readable affordance IDs in state.json (e.g., `"approve"`, `"reject"`)
  rather than opaque random IDs → invariant 1 of the pattern is not being
  followed.
- Codex says it can't run a server at all and does not suggest alternatives →
  file a skill content issue; the pattern should be guiding toward alternatives.

### M4 — Claude Code behavior unchanged

In a Claude Code session, trigger the same scenario: "I need to send a two-
option approval to someone not in chat. What would you use?"

**Pass:** Claude Code still identifies surface and its suggested drain mechanism
is Monitor + Bash run\_in\_background (the CC-native path). No behavioral
regression.

**Purpose of this step:** Confirms the Codex skill install at
`~/.codex/skills/surface/` did not disturb the Claude Code install at
`~/.claude/skills/surface/`, and that the Claude Code path still works.

## Harness-neutrality friction noticed during skill inspection

The following are observations from reading the skill content. These are
**not** blockers for running the smoke test — they are signals worth tracking.
Items marked [ASK] represent possible future decisions for the maintainer.

### `references/lifecycle.md` — harness labels in mechanism descriptions

In `lifecycle.md`, two of the four mechanism options are labeled with
"(Claude Code primitive)":
- Section heading: "Monitor on background-process stdout **(Claude Code
  primitive)**"
- Section heading: "ScheduleWakeup / `/loop` polling **(Claude Code
  primitives)**"

The third mechanism (filesystem watch) and fourth (push webhook) are not
labeled with a harness.

These labels are accurate — Monitor and ScheduleWakeup *are* Claude Code
primitives — but they appear in the skill's reference content, which is
supposed to be harness-neutral per the project's core principle: "SKILL.md and
`references/` never branch on 'for Cowork do X / for Claude Code do Y'."

The current framing is informational (it describes what the mechanism requires
and when it fits, and names CC as one environment where it applies) rather than
prescriptive (it does not say "use Monitor"). However, the heading-level "(Claude
Code primitive)" label could cause a Codex agent reading lifecycle.md to treat
Monitor as a CC-specific tool it doesn't have, rather than understanding it as
an abstract "tail-a-process-stdout" mechanism that it could approximate with its
own tools.

A harness-neutral framing might be: "Monitor on background-process stdout
(platform-native mechanism; available in Claude Code via `Monitor`; approximated
in other environments via process stdout tailing or push callback)."

[ASK] Whether to soften the harness labels in lifecycle.md is a skill-content
call that may need the maintainer's input on how much friction is acceptable
vs. how much specificity helps Claude Code users.

### `SKILL.md` §5 — references to Monitor and ScheduleWakeup

SKILL.md §5 mentions "Monitor on a server's stdout, ScheduleWakeup, `/loop`
polling" as mechanism options. These are listed as choices, which is
appropriate. However a Codex agent that doesn't have Monitor or ScheduleWakeup
might read the list as Claude-Code-scoped and not extrapolate to its own
polling or push-webhook alternatives.

The list already includes "fs watch, push webhook" — so the list is not
CC-exclusive. This is lower-severity than the lifecycle.md heading labels, but
worth keeping in view when evaluating M2 and M3 results.

### `lifecycle.md` §push-webhook — "limited primitive support in CC"

The push-webhook description includes: "currently has limited primitive support
in CC — named here as the abstract shape for non-CC or future environments."

This is a CC-specific qualification inside the skill reference. It's accurate
but names a harness explicitly. A Codex agent reading this might not recognize
it applies to its own environment — Codex may have native webhook handling that
makes this mechanism more viable than the text suggests.

## Expected outputs summary

| Check | Expected |
|---|---|
| `~/.codex/` exists | Script proceeds |
| `~/.codex/skills/surface/SKILL.md` exists | Script proceeds |
| All four references present | Script proceeds |
| Skill version reported | e.g., `0.1.3` |
| `plugin.json` version matches `SKILL.md` | No version-mismatch warning |
| Server starts on port 15173 | HTTP 200 on `/` |
| `aff-approve` submission | HTTP 200 |
| `aff-reject` submission | HTTP 200 |
| SUBMIT lines on stdout | `SUBMIT aff-approve null` and `SUBMIT aff-reject null` |
| State file submissions count | 2 |
| M1: Codex confirms surface skill | Codex describes surface without Claude-specific framing |
| M2: Codex picks surface for the scenario | Codex names surface; explains substrate-neutral pattern |
| M3: Full flow end-to-end | Drain fires autonomously; correct intent reported |
| M4: Claude Code unchanged | CC still uses Monitor + run\_in\_background |
