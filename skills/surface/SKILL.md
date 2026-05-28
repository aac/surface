---
name: surface
version: 0.1.8
description: Use when an agent needs ad-hoc structured input from one or more recipients via a flexible, distributable interface — multi-choice decisions too big for chat, file or photo uploads, visual disambiguation, comparative ranking, drag-rank, drawing or annotation, structured forms, async approval gates, multi-recipient surfaces where several people respond to the same prompt, collaboration surfaces where trusted recipients submit instructions the agent acts on, third-party shares where a surface is delivered to someone other than the operator, situations where the user isn't in chat and the outbound channel (email, SMS, push, paging) can only carry a URL, runbook delivery where the user works through a list of shell commands one at a time with per-step copy affordances and done buttons, information-dense surfaces where rich context (tables, grids, flagged data, clinical narratives, multi-paragraph summaries) needs to appear alongside multiple granularities of structured input on one page. The agent generates a task-shaped page of opaque-ID affordances, ships the URL through whatever channel reaches the recipients, and autonomously drains submissions to react. Not for simple in-chat questions, durable apps or persistent products, or interactions the agent can self-resolve.
---

# surface

`surface` is a pattern for an agent to collect ad-hoc input from one or more recipients via a flexible, easily distributable interface. The agent generates a UI surface for the moment, ships its address to recipients through whatever channels it has, and reacts to submissions on its own.

## 1. What surface is

**Defining property.** A way to collect ad-hoc structured input from one or more recipients via a flexible, easily distributable interface. The URL carries the response surface, so any outbound channel the agent has — chat, email, SMS, push, paging — can deliver it.

**Required mechanism: autonomous draining.** The agent learns about submissions and reacts to them without recipients nudging through another channel. The mechanism (Monitor on a server's stdout, ScheduleWakeup, filesystem watch, push webhook) is the agent's choice; the requirement is fixed.

**Useful consequences.** Outbound-only channels (email, SMS, push) become viable for structured input because the URL is the response surface. Submissions arrive in known shape because the agent designed the affordances and their schemas in the same breath as the question — no parsing structure out of prose. Multi-recipient surfaces work naturally: the agent mints one surface and delivers the URL to several recipients, each of whom submits independently. (The *envelope* is typed; the *content* of free-text and file fields is still recipient-controlled — see §9.)

## 2. When to use / when not to use

**Use surface when** any of:

- The input is structurally complex — multi-step form, file or photo upload, visual disambiguation, comparative selection, drag-rank, annotation, drawing, audio capture.
- The user isn't in chat and the outbound channel can't natively carry a structured response (email-shaped delivery, push notification, paging).
- A rich UI genuinely serves the moment better than freeform text, even in an interactive session — e.g., "here are 30 refactor candidates, check the ones to apply."
- Multiple recipients need to respond to the same prompt — a team review, a poll across several people, a multi-stakeholder approval gate.
- The surface is a collaboration workspace where trusted recipients submit instructions the agent acts on — a shared design review, a collaborative editing canvas, a team triage board.
- The surface needs to reach a third party (someone other than the operator) — a friend, a teammate, a client, a contractor.
- The page needs to display rich context *alongside* the input controls — tables, grids, flagged values, multi-paragraph narratives — so that a domain expert sees the structured context and the structured decision fields in one place. Chat-based question-by-question input loses coherence when the recipient needs to hold a dense information picture while answering. Surface keeps it on the page.

**Don't use surface when** all of:

- The agent is in active interactive chat with the user, AND
- The input is simple text or a single yes/no, AND
- Chat is the right medium for this interaction.

**Also don't use surface** to build a durable product or persistent app. `surface` is for task-shaped moments — generated for a task and discarded after. The task may last seconds (an approval gate) or hours (a collaboration canvas), but the surface's lifetime tracks the task's, not the product's. If the surface needs to live beyond the task — auth, sessions, multi-user state, polish — that's a real app; build that instead.

| Situation | Tool |
|---|---|
| "Should I rename `fooBar` to `foo_bar`?" (user is in chat) | chat reply |
| "Which of these 18 generated icon candidates is best?" | surface |
| "Approve this batch of suggested commits before I push" (user is on their phone, away from chat) | surface (link via push notification) |
| "Upload the receipt and I'll log the expense" | surface |
| "Sketch the layout you want and I'll build it" | surface |
| "Did you mean Slack or Discord?" (user is in chat) | chat reply |
| "Triage these 40 pending PRs — approve / reject / request-changes for each" | surface |
| "All three team members need to vote on the logo options" | surface (multi-recipient) |
| "Share this design review with the collaborators so they can direct feedback" | surface (collaboration, trusted recipients) |
| "Send the contractor a questionnaire about their availability" | surface (third-party share) |
| "Domain expert needs to review a vitals grid, flagged labs, a clinical narrative, then record a strategy pick, an approach pick, checkboxes, and free text — all in one sitting" | surface (information-dense context + multi-granularity input) |

**Delivering the surface URL.** In an interactive session, the agent can open the URL directly in the user's browser, paste it into chat, or both. When the recipient is not in session, the agent needs an outbound channel to deliver the URL. Outbound delivery tools — such as `reach` (`~/.claude/skills/reach/`), which delivers payloads of any shape (messages, files, URLs, notifications) across configured channels — are the preferred path for channel navigation when available. When no delivery tool is installed, the agent falls back to direct send mechanisms (osascript, sendmail, or equivalent) for the channels it can reach. When none of those are available either, delivery doesn't have to fail: the agent can paste the URL in chat, log it somewhere the operator will see it, or ask the operator to deliver it manually. There is always a bottom of the chain.

Before building, also read §9 — security considerations scale with how far the surface travels from the agent and how many recipients receive it.

## 3. The pattern

Five invariants any implementation must preserve: the agent owns an `id → intent` map, the surface exposes affordances by opaque ID, the agent autonomously drains, submissions are typed by construction, surfaces are task-shaped. Everything else (state shape, wire format, server choice, ID format, lifecycle mechanism) is implementation.

For the full statement, the collaboration trust model, examples of alternative substrates (Slack interactive messages, Telegram inline keyboards, Cloudflare Worker + KV, raw sockets), and the normative-vs-illustrative distinction, read `references/pattern.md`.

## 4. The wire example

One concrete wire: HTTP server on loopback, JSON on the submission path, multipart for file uploads, a single `SUBMIT <id> <payload-json>` line per submission to stdout. Illustrative, not normative — alternative wires that preserve the pattern in §3 are equally valid.

Routes, state-file shape, submission semantics, and a session walkthrough are in `references/wire-example.md`.

## 5. Lifecycle mechanisms

Four shapes cover the space: Monitor on background-process stdout (preferred when the environment supports it with the canonical wire), ScheduleWakeup or `/loop` polling, OS-level filesystem watch, push webhook into the agent. Pick what fits the environment and the task's latency tolerance.

Mechanism tradeoffs, a worked Monitor example, cadence guidance, and no-submission timeout/discard semantics (what the agent does when nothing arrives) are in `references/lifecycle.md`.

## 6. Working with the user

When `surface` is invoked in an interactive session, briefly check with the user about *setup decisions* before building — what kind of surface, what server setup, who the recipients are, any preferences on how the URL should be delivered. Keep this short; the interaction itself stays inside surface. Surface is being used precisely because the *interaction* is better in a structured UI than freeform chat. A setup conversation just makes sure the right shape gets built. Surface choices; let the user make them.

When `surface` is invoked autonomously — cron, `/loop`, dispatched agent, scheduled task — proceed without solicitation. Autonomous agents don't have a user to ask.

The same skill teaches *what* to consider in both cases; the difference is *who* decides.

### Designing affordances

A few rules govern how the surface itself is shaped.

**1. Pick the minimum-effort affordance for each recipient intent.** A click beats a paste; a paste of a ready-made shell command (heredoc included) beats hand-editing a file; an upload or pick beats typing freeform. A surface that asks "create this file with this content" is shape-failed: the correct affordance is a copy-the-shell-command button, or dispatching a sibling agent to do it directly.

**2. Always include an escape hatch.** Surfaces built entirely from choice-buttons fail silently when the *frame* is wrong — the recipient has no way through the surface to say "this is shaped wrong, redirect to chat." A small free-text field ("anything else?") or a "redirect to chat" button costs almost nothing and recovers gracefully. Anything that arrives through it is untrusted free-text content (see `references/security.md`).

**3. One affordance, one recipient intent.** Minimum effort applies *within* a single semantic action, not across distinct ones. Don't merge intents into one button just to save a click — e.g., a single "copy command + mark done" button conflates a clipboard mechanism with a confirmation that the outcome actually exists, and the agent's "done" signal then fires on intent rather than completion. Enumerate the recipient's distinct intents first; design the minimum-effort affordance per intent; do not merge across them.

**4. Confirmation messages describe what actually happens.** Don't invent agents, queues, or timing that don't exist — "X will pick this up next pass" reads as flattery rather than fact when there's no X and no scheduled pass. Name the real mechanism (file written, job queued, advisory only — loads on next session start) or just acknowledge the click ("saved", "recorded", "done"). Aspirational confirmation copy is a small lie that compounds when the recipient later acts on it.

**5. The surface owns the result.** By default, render the result onto the surface itself — inline expansion, revealed panel, swapped content — not into chat. The /submit POST still fires so the agent learns the recipient's path, but the recipient-facing answer lives on the page. If the response bounces to chat, the surface is doing nothing the chat couldn't. The named exception is the escape-hatch free-text from Rule 2, where the response is genuinely unbounded and chat is the right medium.

## 7. Environment and setup

Surface benefits from a setup-time discovery step that records what substrates and credentials are available, so that execution-time invocations recall from that record rather than re-discovering every time.

**The environment file.** `~/.surface/environment.md` is where setup state is recorded — available local substrates (loopback, tunnel CLIs), hosted substrates the contributor has configured, and the *locations* of any credentials needed for non-loopback deployments (not the credentials themselves). The file shape is reference-level content; see the design brief for the schema.

**Setup-time discovery.** During a setup conversation (or when the environment file is missing), the agent surveys available substrates, records what's found, and writes `~/.surface/environment.md`. This is a one-time (or infrequent) step, not a per-invocation step.

**Execution-time recall.** On every subsequent invocation, the agent reads `~/.surface/environment.md` to know what substrates are available and where credentials live. No re-scanning of credential stores, no re-probing of installed CLIs. The documented happy path reads only from the environment file; bounded, named retrieval from recorded locations (e.g., reading a specific keychain entry named in the file) is fine. Open-ended credential-store scanning at execution time is not.

**Preflight verification.** At session start, the agent reads the environment file and verifies that named credential locations are still reachable — the env var exists, the keychain entry resolves. If any location is stale (key rotation, machine migration, deleted entry), the agent surfaces the gap and offers to re-run the setup workflow for the affected locations.

## 8. Reference examples

`examples/server.go` is a runnable Go reference server that implements the wire example in §4. Read it for orientation, then re-implement in whatever substrate fits the environment. The pattern doesn't require any particular language.

**The substrate-agnostic test.** If you're porting surface to another substrate, the question is "can I build a working surface server from the docs in §3–§5 and `references/`?" — not "does my impl match the Go (or Python, or Node) reference byte-for-byte?" Operational details (port, watchdog, error statuses, body-cap policy, Cache-Control specifics) should be chosen on what's idiomatic for the target substrate. Cross-impl divergence on those details is signal that the pattern is being independently derived from the docs; cross-impl convergence on the wire envelope (state schema, SUBMIT line shape, multipart field name, timestamp format) is signal that the docs nailed down the right things. Both are validation. The wrong test is comparing impl-to-impl as a conformance bar.

## 9. Security considerations

Defaults are low-risk (loopback bind, structured envelopes, task-shaped state). Third-party shares and collaboration surfaces need explicit trust decisions — when a surface is shared with recipients other than the operator, who is trusted to submit instructions the agent acts on?

The collaboration trust model names the default posture: submissions from non-operator recipients are untrusted free-text input, regardless of relationship. The operator can declare specific recipients as trusted for instruction-bearing input (the operator-trust override), and even trusted recipients' free-text is bounded by the surface's scope.

Read `references/security.md` for the full trust model, the third-party-share default rule, trusted free-text scope calibration, URL forwarding implications, deployment posture considerations, and submission attribution options.
