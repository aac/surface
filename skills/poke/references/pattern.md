# The poke pattern

`poke` is a way for an agent to collect ad-hoc input from a user via a flexible, easily distributable interface. The agent generates a UI surface for the moment, ships its address to the user through whatever channel it has, and reacts to submissions on its own. This file defines the pattern — what any implementation must preserve. Wire formats, server choices, and lifecycle mechanisms are illustration; this is the contract.

## The five invariants

Any implementation of poke must preserve all five. Everything else is implementation.

1. **The agent owns the intent map.** For every affordance the surface exposes, the agent mints an opaque ID and persists `id → intent` in state that survives across draining. The intent is meaningful to the agent (what it plans to do if that affordance is submitted); the ID is opaque to everyone else. The map is the agent's; nothing outside the agent needs to understand it.

2. **The surface exposes affordances by ID.** When the user interacts with the surface, what comes back identifies an affordance by its ID and carries a payload. The surface does not need to know what the IDs mean; interpretation happens agent-side, by looking up the intent.

3. **The agent autonomously drains.** The agent learns about submissions and reacts to them without the user nudging through another channel. If the user has to switch back somewhere else and say "I clicked, go check," the pattern has gained nothing. The mechanism is the agent's choice; the requirement is fixed.

4. **Submissions are typed by construction.** The agent designed the affordances and their schemas in the same breath as the question, so the *envelope* of every submission arrives in known shape — known affordance IDs, named fields. (The *content* of free-text or file fields is still user-controlled and untrusted; that's a security concern, not a pattern concern.)

5. **Surfaces are ephemeral.** Each poke is task-shaped: generated for the moment, discarded after. Nothing persists beyond the task by default. If a surface needs to live longer than the task that produced it, that's a different artifact — build a real app.

## Terms

- **Affordance** — a UI element the surface exposes that the user can interact with (a button, a form, an upload widget, a checkbox, a drag-rank list).
- **Intent** — what the agent plans to do if a given affordance is submitted; opaque to the wire, meaningful only to the agent.
- **Submission** — a payload sent from the user against a specific affordance ID.
- **Drain channel** — whatever mechanism carries submissions from the surface back to the agent in a form the agent can react to.
- **Session** — one poke's worth of affordances and submissions, scoped together so concurrent or successive pokes don't collide.

## Normative vs illustrative

The five invariants above are normative. Implementations that violate any of them are not poke.

Everything else is implementation:

- **State shape.** A JSON file, a SQLite row, an in-memory map, a KV bucket — pick what fits.
- **Wire format.** HTTP + JSON is one option; anything that carries `(affordance ID, payload)` from surface to agent works.
- **Server / surface delivery.** Local HTTP server, hosted endpoint, chat-platform interactive message, third-party form host — the surface just needs to exist somewhere addressable.
- **Lifecycle mechanism.** How the agent drains is the agent's choice; the requirement is only that it drains autonomously.
- **Affordance ID format.** Opaque, scoped to a session. Random hex, ULIDs, UUIDs, monotonic ints — anything that doesn't collide within the session.
- **Surface styling and structure.** The agent renders whatever serves the moment.

If the brief or any reference document describes a specific shape — HTTP routes, JSON layout, file paths, a Go server — that is illustration, not requirement. The pattern survives if every example implementation is thrown away.

## Examples of substrates

Non-exhaustive. Each preserves the five invariants in a different envelope:

- **HTTP + JSON** — local or hosted HTTP server renders the surface as HTML, accepts submissions as JSON. Illustrated in `wire-example.md`.
- **Slack interactive messages** — affordances are Slack block-kit buttons; submissions arrive as Slack interaction payloads.
- **Telegram inline keyboards** — affordances are callback buttons on a bot message; submissions arrive as callback queries.
- **Cloudflare Worker + KV** — surface served from an edge function, state in KV, submissions delivered by the same Worker.
- **Raw sockets** — surface is a CLI or TUI on the user's machine, submissions written to a socket the agent reads.

Different substrates suit different deployments (local vs remote, channel-driven vs URL-driven, persistent vs ephemeral). The pattern doesn't pick.

## Beyond the pattern (agent responsibilities)

The pattern stops at the five invariants. Operational concerns are the agent's to handle, based on its environment and the shape of the task. Not exhaustive:

- **Concurrent pokes** — multiple surfaces live at once: one server, several servers, or one surface combining the asks; all valid.
- **Port choice / address binding** — what the surface listens on, and where.
- **Server teardown** — when the surface comes down, and what happens to in-flight submissions.
- **Idempotency** — what happens if the same submission arrives twice.
- **User-never-clicks timeouts** — how long the surface stays up if no submission ever arrives.
- **Browser caching** — staleness, revalidation, asset versioning.
- **State file lifecycle** — where state lives, when it's cleaned up, whether it's per-session or shared.
- **Delivery of the surface address** — chat reply, email, SMS, push, paging, QR code — whichever outbound channel reaches the user.

These are not in the pattern because they have no single right answer. The agent decides, given its environment and the task.
