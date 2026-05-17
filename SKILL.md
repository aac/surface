---
name: poke
description: Use when an agent needs ad-hoc structured input from a user via a flexible, distributable interface — multi-choice decisions too big for chat, file or photo uploads, visual disambiguation, comparative ranking, drag-rank, drawing or annotation, structured forms, async approval gates, situations where the user isn't in chat and the outbound channel (email, SMS, push, paging) can only carry a URL. The agent generates an ephemeral page of opaque-ID affordances, ships the URL through whatever channel reaches the user, and autonomously drains submissions to react. Not for simple in-chat questions, durable apps or persistent products, or interactions the agent can self-resolve.
---

# poke

`poke` is a pattern for an agent to collect ad-hoc input from a user via a flexible, easily distributable interface. The agent generates a UI surface for the moment, ships its address through whatever channel reaches the user, and reacts to submissions on its own.

## 1. What poke is

**Defining property.** A way to collect ad-hoc input from a user via a flexible, easily distributable interface. The URL carries the response surface, so any outbound channel the agent has — chat, email, SMS, push, paging — can deliver it.

**Required mechanism: autonomous draining.** The agent learns about submissions and reacts to them without the user nudging through another channel. The mechanism (Monitor on a server's stdout, ScheduleWakeup, filesystem watch, push webhook) is the agent's choice; the requirement is fixed.

**Useful consequences.** Outbound-only channels (email, SMS, push) become viable for structured input because the URL is the response surface. Submissions arrive in known shape because the agent designed the affordances and their schemas in the same breath as the question — no parsing structure out of prose. (The *envelope* is typed; the *content* of free-text and file fields is still user-controlled — see §8.)

## 2. When to use / when not to use

**Use poke when** any of:

- The input is structurally complex — multi-step form, file or photo upload, visual disambiguation, comparative selection, drag-rank, annotation, drawing, audio capture.
- The user isn't in chat and the outbound channel can't natively carry a structured response (email-shaped delivery, push notification, paging).
- A rich UI genuinely serves the moment better than freeform text, even in an interactive session — e.g., "here are 30 refactor candidates, check the ones to apply."

**Don't use poke when** all of:

- The agent is in active interactive chat with the user, AND
- The input is simple text or a single yes/no, AND
- Chat is the right medium for this interaction.

**Also don't use poke** to build a durable product or persistent app. `poke` is for ephemeral, task-shaped moments. If the surface needs to live beyond the task — auth, sessions, multi-user state, polish — that's a real app; build that instead.

| Situation | Tool |
|---|---|
| "Should I rename `fooBar` to `foo_bar`?" (user is in chat) | chat reply |
| "Which of these 18 generated icon candidates is best?" | poke |
| "Approve this batch of suggested commits before I push" (user is on their phone, away from chat) | poke (link via push notification) |
| "Upload the receipt and I'll log the expense" | poke |
| "Sketch the layout you want and I'll build it" | poke |
| "Did you mean Slack or Discord?" (user is in chat) | chat reply |
| "Triage these 40 pending PRs — approve / reject / request-changes for each" | poke |

Before building, also read §8 — security considerations scale with how far the surface travels from the agent.

## 3. The pattern

Five invariants any implementation must preserve: the agent owns an `id → intent` map, the surface exposes affordances by opaque ID, the agent autonomously drains, submissions are typed by construction, surfaces are ephemeral. Everything else (state shape, wire format, server choice, ID format, lifecycle mechanism) is implementation.

For the full statement and examples of alternative substrates (Slack interactive messages, Telegram inline keyboards, Cloudflare Worker + KV, raw sockets), read `references/pattern.md`.

## 4. The wire example

One concrete wire: HTTP server on loopback, JSON on the submission path, multipart for file uploads, a single `SUBMIT <id> <payload-json>` line per submission to stdout. Illustrative, not normative — alternative wires that preserve the pattern in §3 are equally valid.

Routes, state-file shape, submission semantics, and a session walkthrough are in `references/wire-example.md`.

## 5. Lifecycle mechanisms

Four shapes cover the space: Monitor on background-process stdout (preferred in Claude Code with the canonical wire), ScheduleWakeup or `/loop` polling, OS-level filesystem watch, push webhook into the agent. Pick what fits the environment and the task's latency tolerance.

Mechanism tradeoffs, a worked Monitor example, and cadence guidance are in `references/lifecycle.md`.

## 6. Working with the user

When `poke` is invoked in an interactive session, briefly check with the user about *setup decisions* before building — what kind of surface, what server setup, any preferences on how the URL should be delivered. Keep this short; the interaction itself stays inside poke. Poke is being used precisely because the *interaction* is better in a structured UI surface than freeform chat. A setup conversation just makes sure the right shape gets built. Surface choices; let the user make them.

When `poke` is invoked autonomously — cron, `/loop`, dispatched agent, scheduled task — proceed without solicitation. Autonomous agents don't have a user to ask.

The same skill teaches *what* to consider in both cases; the difference is *who* decides.

### Designing affordances

A few rules govern how the surface itself is shaped.

**1. Pick the minimum-effort affordance for each user intent.** A click beats a paste; a paste of a ready-made shell command (heredoc included) beats hand-editing a file; an upload or pick beats typing freeform. Modern users do not hand-write config files or hand-edit JSON/YAML/TOML for tool plumbing — agents do that. A poke that asks "create this file with this content" is shape-failed: the correct affordance is a copy-the-shell-command button, or dispatching a sibling agent to do it directly.

**2. Always include an escape hatch.** Pokes built entirely from choice-buttons fail silently when the *frame* is wrong — the user has no way through the surface to say "this is shaped wrong, redirect to chat." A small free-text field ("anything else?") or a "redirect to chat" button costs almost nothing and recovers gracefully. Anything that arrives through it is untrusted free-text content (see `references/security.md`).

**3. One affordance, one user intent.** Minimum effort applies *within* a single semantic action, not across distinct ones. Don't merge intents into one button just to save a click — e.g., a single "copy command + mark done" button conflates a clipboard mechanism with a confirmation that the outcome actually exists, and the agent's "done" signal then fires on intent rather than completion. Enumerate the user's distinct intents first; design the minimum-effort affordance per intent; do not merge across them.

## 7. Reference example

`examples/server.go` is a runnable Go reference server that implements the wire example in §4 in roughly 80 lines of stdlib HTTP. Read it for orientation, then re-implement in whatever substrate fits the environment. Go is convenient because it bootstraps v1's bundled binary and the stdlib is sufficient; the pattern doesn't require any particular language.

## 8. Security considerations

Defaults are low-risk (loopback bind, structured envelopes, ephemeral state). Things worth thinking through scale with how far the surface travels — free-field content as injection vector, CSRF on non-loopback deployments, URL unguessability, auth for hosted contexts, cross-tool replay.

Read `references/security.md` before stepping beyond loopback or when free-field content will flow back into an LLM.
