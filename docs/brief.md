# poke — Ad-hoc User Input via Distributable UI Surfaces

**Version:** v0 brief.
**Status:** design approved, not yet implemented.

---

## What this is

`poke` is a pattern + skill that lets an agent generate ephemeral, structured UI surfaces to collect ad-hoc input from a user, and react to submissions autonomously. The surface is a URL pointing at agent-generated HTML; the agent owns what each affordance means; submissions arrive in known shape.

v0 ships a single skill bundle — no binary, no installable tool. The skill is the contract; agents read it and implement the wire themselves, with one Go reference server in `examples/` for orientation. v1 will bundle that reference into a real installable tool; v0 proves the pattern works on docs alone.

## Why this exists

Agents have three primary channels for getting structured input from a user today, and each has clear gaps:

- **Chat reply.** Freeform, unstructured. Requires the user to be in chat, and requires bidirectional channel availability. Bad for structured input; impossible if the user isn't in chat.
- **Inline UI widgets (MCP UI / Apps SDK).** Structured, but constrained to the chat client's canvas, only available in supported chat surfaces, only sees the user while they're inside that surface.
- **External form or app.** Full UI, but requires building a real app. High friction for ephemeral, task-shaped moments.

There's a gap: lightweight, ad-hoc, fully-flexible UI surfaces that the agent generates *for the moment* and discards after. Where the URL can be shipped through any channel the agent has (chat, email, SMS, push, paging), where input is structured by construction, and where the agent reacts to submissions on its own without the user needing to nudge through another channel.

That's what `poke` is.

## Defining property and consequences

**Defining property:** `poke` is a way for an agent to collect ad-hoc input from a user via a flexible, easily distributable interface.

**Required mechanism: autonomous draining.** The agent must react to submissions without the user prompting through another channel. If the user has to switch back to chat and say "I clicked, go check," the pattern has gained nothing over a chat reply. The mechanism (Monitor on a server's stdout, ScheduleWakeup polling, filesystem watch, push webhook) is the agent's choice; the requirement is non-negotiable.

**Useful consequence — one-way outbound channels.** Because the URL carries the response surface with it, the agent only needs *outbound* access on the channel it used to reach the user. Email, SMS, push notifications, paging — none natively support structured replies, but all carry URLs. The poke surface IS the response channel.

**Useful consequence — schema by construction.** The agent designs the affordances and their schemas in the same breath as the question. Submissions arrive in known shape; no parsing or extraction from prose. This is a quiet but large efficiency and correctness win versus inferring structure from a chat reply.

## What poke is for — and is not for

**Use poke when** any of:

- The input is structurally complex — multi-step form, file/photo upload, visual disambiguation, comparative selection, drag-rank, annotation, drawing, audio capture.
- The user isn't in chat and the agent's outbound channel can't carry a structured response on its own (email-shaped delivery, push notification, paging).
- A rich UI genuinely serves the moment better than freeform text, even in an interactive session (e.g., "here are 30 refactor candidates, check the ones to apply").

**Don't use poke when** all of:

- The agent is in active interactive chat with the user, AND
- The input is simple text or a single yes/no, AND
- Chat is the right medium for this interaction.

**Also don't use poke** to build a durable product or persistent app. `poke` is for ephemeral, task-shaped moments. If the surface needs to live beyond the task — auth, sessions, multi-user state, polish — that's a real app; build that instead.

| Situation | Tool |
|---|---|
| "Should I rename `fooBar` to `foo_bar`?" (user is in chat) | chat reply |
| "Which of these 18 generated icon candidates is best?" | poke |
| "Approve this deploy to prod" (user is on their phone, away from chat) | poke (link via push notification) |
| "Upload the receipt and I'll log the expense" | poke |
| "Sketch the layout you want and I'll build it" | poke |
| "Did you mean Slack or Discord?" (user is in chat) | chat reply |
| "Triage these 40 pending PRs — approve / reject / request-changes for each" | poke |

## What a session looks like

A schematic flow (the wire and lifecycle details are described concretely below):

```
1. Agent has a long task that hits a fork it can't make alone.
   e.g., "user needs to pick which of these 8 candidate refactors to apply"

2. Agent designs the surface:
     - 8 checkboxes (one per candidate) — selectable state
     - 1 "Apply Selected" button — the submitting affordance, with intent
       "apply_selected_refactors"
   Mints an opaque ID for the submitting affordance; persists id→intent
   map locally. Checkboxes carry IDs too so their selected state can be
   referenced in the submission payload.

3. Agent renders HTML for the surface; spawns a local HTTP server in background
   to serve it and accept submissions.

4. Agent delivers the URL — in chat ("open this to choose"), or via the
   outbound channel it's using (push notification, email, etc.).

5. Agent autonomously drains. In Claude Code: Monitor the server's stdout for
   submission lines. Push-driven, no polling needed.

6. User opens the URL (in any browser, on any device), checks 3 boxes, clicks
   Apply Selected.

7. Server emits SUBMIT <button-id> {checked: [<id1>, <id2>, <id3>]} to stdout.

8. Agent receives the event, looks up the intents for the submitted IDs, applies
   the selected refactors, and continues the task. Tears down the surface.
```

The surface lifetime is task-shaped — minutes, maybe hours. State is local. Nothing persists beyond the task.

## The pattern (substrate-agnostic)

Any implementation must preserve:

1. **The agent owns the intent map.** For every affordance the surface exposes, the agent mints an opaque ID and persists `id → intent` in state stable across draining. The intent is meaningful to the agent; the ID is opaque to everyone else.
2. **The surface exposes affordances by ID.** When a user clicks a button or submits a form, the surface reports "ID X was submitted with payload Y." Interpretation happens agent-side.
3. **The agent autonomously drains.** The agent must learn about submissions and react without the user nudging through another channel. The mechanism is the agent's choice; the requirement is fixed.
4. **Submissions are typed by construction.** The agent designed the affordances and their schemas; submissions arrive in known shape.
5. **Surfaces are ephemeral.** Each poke is task-shaped, generated for the moment, and discarded after.

Anything else — state shape, wire format, server choice, lifecycle mechanism, surface styling — is implementation.

## The wire example (HTTP + JSON)

One canonical wire for localhost use. Not normative — other wires (Slack interactive messages, Telegram inline keyboards, Cloudflare Worker + KV, raw sockets) are valid as long as they preserve the pattern.

**Routes:**

```
GET  /                    serves the agent-rendered HTML
POST /submit              accepts JSON body { id, payload }; logs to event stream
GET  /static/<path>       optional static assets if the agent's HTML references any
```

**State shape — `.poke-state.json` (one common form):**

```json
{
  "session_id": "01HXYZABC...",
  "affordances": {
    "abc123": { "label": "Approve", "intent": "approve_pr_456" },
    "def456": { "label": "Reject",  "intent": "reject_pr_456" }
  },
  "submissions": [
    { "id": "abc123", "payload": null, "at": "2026-05-16T12:34:56Z" }
  ]
}
```

**Terms:**
- *Affordance* — a UI element the surface exposes (a button, a form, an upload widget).
- *Intent* — what the agent plans to do if that affordance is submitted. Opaque to the wire; can be a string, structured JSON, an instruction tag — whatever the agent finds useful.
- *Submission* — a payload posted from the user against a specific affordance ID.

**Submission semantics:**
- `POST /submit` with `{ "id": "<affordance-id>", "payload": <json-or-null> }` appends to `submissions` and emits a line to stdout: `SUBMIT <id> <payload-json>`.
- For forms, the submitting affordance is the button; selected form-field values are carried in the `payload` (e.g., `{"selected": ["abc123", "def456"]}`).
- File uploads use `multipart/form-data`; the server stores files under a path the agent can read and the emitted stdout line includes the path(s).

**Session ID:** ULID generated when the poke session starts; scopes the affordances of one poke from another's. Per-session.

**Affordance ID format:** the v0 wire example uses ULIDs. Agents implementing alternative wires can use any opaque identifier as long as collisions are scoped per session.

The reference `examples/server.go` implements this wire in ~80 lines.

## Lifecycle mechanisms

The agent must autonomously drain. Mechanisms in the space:

- **Monitor on background process stdout (Claude Code).** Spawn the server in background, Monitor its stdout for `SUBMIT` lines, react push-driven. Preferred for local use in CC — event-driven, no polling cost.
- **ScheduleWakeup / /loop polling.** Timer-based. Use when stream-based mechanisms aren't available, or when polling cadence is naturally slow (async approval gates with minute-scale latency).
- **Filesystem watch (fswatch / inotify).** Push-driven via the OS. Useful when the surface writes submissions to a file the agent watches.
- **Push webhook into the agent.** For remote/channel-driven setups where the agent isn't local — the surface POSTs an event to a hook that wakes the agent via push notification, RemoteTrigger, or equivalent.

The skill teaches the *space*; the agent picks based on environment and the latency requirements of the task. Non-prescriptive.

## Skill structure

`SKILL.md` sections, in order:

1. **What poke is** — pattern statement, defining property, required mechanism (autonomous draining), useful consequences.
2. **When to use / when not to use** — the situational guidance above, plus the prompt-injection caution.
3. **The pattern** → `references/pattern.md` — substrate-agnostic definition (the five points above).
4. **The wire example** → `references/wire-example.md` — the HTTP+JSON walkthrough.
5. **Lifecycle mechanisms** → `references/lifecycle.md` — the mechanism space and notes on picking.
6. **Working with the user** — the collaborative norm below.
7. **Reference example** → `examples/server.go` — pointer to the Go reference server.

## Working with the user

**If the skill is invoked in an interactive session**, the agent briefly checks with the user before building: what kind of surface, what server setup, any specific preferences. The skill surfaces choices; the user makes them.

**If the skill is invoked autonomously** (cron, /loop, dispatched agent, scheduled task), the agent proceeds without solicitation. Autonomous agents don't have a user to ask.

The skill teaches *what* to consider, not *who* to ask.

## Security considerations

v0 is low-risk by construction: submissions are structured (button clicks, named form fields with known shapes), and the typical use is private and local (single user, localhost, no public exposure). Prompt-injection risk is mitigated mostly by the structured-response shape — the agent's reaction is driven by the matched intent ID, not by free interpretation of submission text.

This changes as `poke` grows. Three threat shapes worth naming:

- **Unstructured input** (free text, images, file uploads) is an injection vector — submissions arrive in known *shape* but the *content* of free fields is user-controlled. Agents must treat free-field content as untrusted before passing it back to an LLM.
- **Hosted / public surfaces** introduce auth and link-lifecycle concerns (link expiration, one-time-use, magic-link / session, replay protection) that v0 does not address.
- **Cross-tool replay.** A submission designed for one agent's intent map could be replayed against another if IDs collide. v0's per-session ID scope mitigates this; future hosted versions need to be careful.

The skill includes a one-paragraph caution in section 2. Substantive treatment — sanitization patterns, hosted auth, link lifecycle — is future work.

## Reference example

`examples/server.go` ships a ~80-line Go reference server demonstrating the wire example above. Runnable via:

```
go run examples/server.go --state /tmp/poke-state.json --port 5173
```

Agents read it for orientation and re-implement in whatever substrate fits their environment. Go because:

- It bootstraps v1's bundled binary (easier to ship a real binary if the reference is already in Go).
- The stdlib `net/http` is sufficient — no dependencies.
- Cross-compiles cleanly.

Other languages would also be fine; the choice is Go for the v1 trajectory, not because the pattern requires it.

## Repo layout

```
poke/
├── SKILL.md                  # shipped: skill entry point
├── references/               # shipped: lazy-loaded sections
│   ├── pattern.md
│   ├── wire-example.md
│   ├── lifecycle.md
│   └── when-not-to-use.md
├── examples/                 # shipped: reference code
│   └── server.go
├── docs/                     # dev artifacts (not loaded by skill)
│   ├── brief.md              # this document
│   └── plan.md               # v0 implementation plan (next phase)
├── CLAUDE.md                 # conventions for agents working on poke itself
├── README.md                 # project intro for humans browsing
├── LICENSE
└── .gitignore
```

**Install:**

```
git clone <url> ~/Workspace/poke
ln -s ~/Workspace/poke ~/.claude/skills/poke
```

The repo root IS the skill. Claude only loads `SKILL.md` and what it explicitly references; `docs/`, `README.md`, `CLAUDE.md`, and `LICENSE` are for human readers and aren't part of the runtime skill bundle.

## Out of scope (deferred until real use signal)

These are intentionally not in v0. Each is reconsidered once concrete pull-signal arrives from actual use.

- **Bundled binary / installable tool.** The Go reference exists to be read and re-implemented. v1 wraps it into a real `poke-serve` (or equivalent) that agents install once. When this exists, the skill will ask the user (in interactive sessions) whether they prefer the bundled server or their own setup.
- **Formal `docs/spec.md`.** v0 has the wire example in `references/`; that's enough. A formal spec crystallizes once there's a canonical bundled implementation to specify against.
- **Channel adapters.** Slack interactive buttons, Telegram inline keyboards, email-link patterns, push-notification wakes. The skill names these as valid lifecycles; v0 doesn't ship adapter code or canonical formats.
- **Auth model for hosted / public surfaces.** v0 assumes the agent picks an appropriate scheme (loopback bind, unguessable URL, magic-link, whatever). Substantive treatment as `poke` moves beyond localhost.
- **Templating / surface-authoring helpers.** v0 expects the agent to write HTML/JS directly. v1+ might offer a small helper layer if friction warrants.
- **Link expiration, one-time-use semantics, persistent surfaces.** Out of scope; agents handle expiration in their own state if they need to.
- **Cross-implementation interop testing.** No spec, no conformance suite, no tests beyond "the skill works for real tasks."
- **Substantive prompt-injection mitigation patterns.** v0 mentions the caution; v1+ as `poke` accepts more unstructured input will need real sanitization guidance.

The principle, borrowed from ask: ship the narrow shape, grow based on real usage. Anything in this list is well-understood enough to build; none of it is well-understood enough to be obviously worth building yet.
