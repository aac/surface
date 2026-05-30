# inline-reveal — Rule 5 example

Demonstrates **SKILL.md §6 Rule 5: "the surface owns the result."**

The agent presents a multi-option decision (which refactoring to apply). The
user clicks a button; the `/submit` POST fires; the HTTP response body carries
the detailed reasoning for that choice; the page swaps it into an inline reveal
panel. No chat bounce — the recipient-facing answer lives on the page.

## What it demonstrates

Rule 5 says: _render the result onto the surface itself — inline expansion,
revealed panel, swapped content — not into chat. The /submit POST still fires
so the agent learns the recipient's path, but the recipient-facing answer lives
on the page. If the response bounces to chat, the surface is doing nothing the
chat couldn't._

The key inversion from a naive implementation: the `/submit` response body is
not an empty `200 OK`. It carries the reveal HTML that the page swaps in. The
agent controls that content (it is authored in the `AFFORDANCES` dict at
startup, not recipient input), so the page can render it safely with
`innerHTML`. The SUBMIT line on stdout is still emitted — the agent drains
that to know which intent to execute.

## Running it

```
python3 inline-reveal.py          # default port 7432
python3 inline-reveal.py --port 8080
```

Open `http://127.0.0.1:<port>/` in a browser. Click any option. The reveal
panel appears inline — no page reload, no chat message. The SUBMIT line appears
on stdout for the draining agent.

## Stdlib only

Python `http.server` and `json` from the standard library. No external
dependencies, no network beyond loopback.

## Wire alignment

Follows the wire envelope documented in `references/wire-example.md`:

- `GET /` — serves the agent-rendered HTML
- `POST /submit` — accepts `application/json` body `{"id": "...", "payload": ...}`;
  emits `SUBMIT <id> <payload-json>` to stdout; responds with the reveal HTML
- Rejects other content types with 415
- Sends `Cache-Control: no-store, must-revalidate` on the surface HTML

Operational choices left to the implementer (per `pattern.md` §"Beyond the
pattern"): port, server teardown, idempotency, no-submission timeout, state
persistence. This example keeps state in-memory; a real surface would persist
the intent map to a JSON file so it survives process restarts.

## Rule 5 vs. the escape hatch

Rule 2 says every surface should include an escape hatch (a free-text "anything
else?" field or a "redirect to chat" button). Rule 5's named exception is
exactly that field: if the recipient types something genuinely unbounded, chat
is the right medium. This example omits the escape hatch for minimal clarity —
a production surface would add one, and its response would _not_ use the
inline-reveal path.
