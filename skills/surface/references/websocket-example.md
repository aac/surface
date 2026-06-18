# WebSocket example — bidirectional surface over a persistent connection

This is **another substrate**, sibling to `wire-example.md` and
`hosted-example.md`. Same pattern; different mechanics. Where the local wire
delivers submissions as `SUBMIT` lines on server stdout and the hosted wire
exposes a `/poll` endpoint the agent polls on cadence, the WebSocket wire
streams submissions to the agent over a persistent connection and lets the
agent push state updates back over the same socket — making the drain
push-driven without requiring a Monitor on subprocess stdout or a poll loop.

This document describes a concrete WebSocket wire. It is **illustrative, not
normative**. The pattern doesn't require WebSocket; this is one more substrate
the pattern fits naturally. Choose it when a persistent bidirectional channel
is available and push-driven drain is worth the added session lifecycle
complexity.

## Why WebSocket is different

The five invariants from `pattern.md` carry over unchanged: the agent owns the
intent map, the surface exposes affordances by ID, the agent autonomously
drains, submissions are typed by construction, surfaces are ephemeral.

What changes is the transport and drain mechanics:

- **Drain is push, not pull or stdout-tail.** Submissions stream to the agent
  the moment they arrive — no polling cadence, no Monitor on a subprocess.
  The agent holds an open WebSocket connection and receives each submission as
  a message.
- **The agent can push reactions back.** Over the same connection, the agent
  can update the rendered page — reveal results, update board state, swap
  content — without the page needing to poll. The surface "owns the result"
  (SKILL.md §6 rule 5) and the agent writes it there without a round-trip
  from the recipient.
- **Connection state is first-class.** Disconnects, reconnects, and
  message-ordering become operational concerns the agent must handle. These
  are the price of the persistent channel.
- **Works co-located or hosted.** A WebSocket server can bind to loopback
  (same machine as the agent) or sit at a public endpoint (same deployment
  model as the hosted wire). The drain mechanism is the same either way: the
  agent connects to the WebSocket endpoint and reads messages.

## Wire shape

Two channel types share the connection: the **submission channel** (surface
→ agent) and the **update channel** (agent → surface). They're distinguished
by a `type` field in the JSON envelope.

### Submission message (surface → agent)

When a recipient interacts with an affordance, the page sends over the HTTP
connection as a submission POST (or equivalent) and the server forwards it to
any connected agent socket as:

```json
{ "type": "submit", "id": "<affordance-id>", "payload": <json-or-null> }
```

The message carries the same `(id, payload)` pair as the HTTP+JSON wire.
Parsing: split on `type`; for `submit`, look up `id` in the intent map.

### Update message (agent → surface)

The agent can push state changes to the connected page:

```json
{ "type": "update", "html": "<fragment-or-full-page-html>" }
```

What `html` contains is the agent's call — a full page replacement, an
inner-HTML fragment for a named element, a JSON patch to a client-side state
object. The simplest shape is a full page replacement (replace
`document.body.innerHTML` on receipt); richer surfaces can use fragment
targeting. The wire just carries the bytes; interpretation is between the
agent and the page it authored.

### Drain-complete signal (agent → surface, optional)

When the agent decides the surface is terminal, it can signal the page
directly before tearing down:

```json
{ "type": "done", "message": "<optional human-readable string>" }
```

The page renders the message (or a default closing state) and the agent then
closes the WebSocket, tears down the server, and removes any state files. This
is optional — the agent may also just close the connection without a
pre-signal; what the page shows in that case is the agent's authoring choice.

## State shape

Mirrors the local wire's JSON schema (`wire-example.md`) with no additional
fields required. The server persists the same `{ session_id, affordances,
submissions }` structure; the WebSocket layer is transport, not state shape.

Submissions appended to the state file carry the same `{ id, payload, at }`
envelope as the HTTP wire. The agent can choose to persist
WebSocket-delivered submissions there (same file, same schema) or hold them
only in memory for task-shaped surfaces. If the surface may survive a server
restart or needs the drop-directory drain as a fallback, persist to the file;
if the surface is purely ephemeral and the agent holds all state in-process,
in-memory is fine.

## Routes

A WebSocket surface typically has three routes:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Serves the agent-rendered HTML for the surface session. |
| `POST` | `/submit` | Accepts a submission from the page (same as the HTTP wire). Server appends to state, emits to connected agent sockets. |
| `GET` | `/ws` | WebSocket upgrade endpoint. The agent connects here to receive submission events and optionally push updates back. |

The `/submit` route exists alongside `/ws` for two reasons: it keeps the page
code symmetric with the HTTP wire (the same `fetch('/submit', …)` pattern), and
it makes the server work even if the agent isn't connected (submissions are
persisted; the agent can drain them later via state-file read or reconnection).
The server fans each submission to connected agent sockets after persisting it.
If no agent socket is connected when a submission arrives, the submission lands
in state and waits to be drained on the next connection.

An alternative shape — having the page submit directly over the WebSocket
instead of via `POST /submit` — is valid but requires the page to maintain a
live socket connection to submit, which means a broken connection blocks input.
The hybrid shape (POST to submit, WebSocket to receive) tolerates client-side
network interruption without losing submissions.

## Session walkthrough

A one-affordance "Approve" round-trip over the WebSocket wire, showing the
agent-side connection and a state push-back.

### 1. Agent designs the surface

The task: ask the user to approve a deployment before the agent proceeds. One
affordance: "Approve". The agent mints an ID (`a1b2c3`), records the intent,
and writes state — same schema as the HTTP wire:

```json
{
  "session_id": "s_7f3a9c",
  "affordances": {
    "a1b2c3": { "label": "Approve", "intent": "approve_deploy_42" }
  },
  "submissions": []
}
```

### 2. Agent starts the server

The server binds to `127.0.0.1:5174` (or any available port; the choice is
the agent's). It serves:

- `GET /` → the agent-rendered HTML
- `POST /submit` → submission handler
- `GET /ws` → WebSocket upgrade

The agent holds the server's PID (or stops it by port) for teardown.

### 3. Agent connects to the drain socket

```
ws://127.0.0.1:5174/ws
```

The agent opens a WebSocket connection to `/ws`. From this point, any
submission arriving via `POST /submit` is forwarded to the agent as a
`{ type: "submit", … }` message. The agent's drain loop is a message-receive
loop, not a poll.

### 4. Agent delivers the URL

`http://127.0.0.1:5174/` via whatever outbound channel applies (chat, push,
QR code, etc.).

### 5. User opens the page, clicks Approve

The page POSTs:

```http
POST /submit HTTP/1.1
Content-Type: application/json

{"id":"a1b2c3","payload":null}
```

The server appends to state, responds `200 OK`, and fans to the agent socket:

```json
{ "type": "submit", "id": "a1b2c3", "payload": null }
```

### 6. Agent reacts and pushes an update

The drain loop receives the message. The agent looks up `a1b2c3` → intent
`"approve_deploy_42"`, runs the deployment, and pushes a result back:

```json
{ "type": "update", "html": "<p>Deployment started. You'll get a notification when it's done.</p>" }
```

The page replaces its content without any reload or poll.

### 7. Agent tears down

```json
{ "type": "done" }
```

Agent closes the WebSocket, stops the server, removes the state file.

## Drain loop pseudocode

```
# 1. Render surface and persist intent map.
write_file(state_path, { session_id, affordances, submissions: [] })
write_file(html_path, agent_rendered_html)

# 2. Start server.
start_server(state_path, html_path, port=5174)

# 3. Deliver URL.
deliver("http://127.0.0.1:5174/")

# 4. Connect to drain socket.
ws = websocket_connect("ws://127.0.0.1:5174/ws")

# 5. Drain loop.
while True:
    msg = ws.recv()                        # blocks until a message arrives
    data = json_parse(msg)
    if data["type"] != "submit":
        continue                           # skip non-submission messages

    affordance_id = data["id"]
    payload       = data["payload"]
    intent        = affordances[affordance_id]["intent"]
    result        = react(intent, payload)

    # Push result back to the page (optional).
    ws.send(json_encode({ "type": "update", "html": render_result(result) }))

    if is_terminal(intent, payload):
        ws.send(json_encode({ "type": "done" }))
        break

# 6. Teardown.
ws.close()
stop_server()
remove_file(state_path)
```

The `react`, `render_result`, and `is_terminal` bodies are task-specific.
Error handling, reconnect logic, and the user-never-submits timeout are
operational concerns (see "Beyond the pattern" in `pattern.md`).

## Reconnection and missed submissions

A persistent connection introduces a failure mode the HTTP wire doesn't have:
the agent's socket drops and submissions land in state while no agent socket is
connected. Two shapes handle this:

**On reconnect, drain the backlog.** When the agent reconnects to `/ws`, the
server replays any submissions that arrived since the agent's last message. The
server can track a cursor per agent connection, or simply replay all submissions
from state on each new connection. The agent deduplicates by submission
timestamp or by already-processed ID set.

**Fallback to state-file read.** If the WebSocket infrastructure is unavailable,
the agent reads the state file directly (same as any other wire) and processes
submissions from there. The state file is always the source of truth; the
WebSocket is a delivery optimization, not the record.

Which shape fits depends on how the server is built and how much reconnect
latency the task tolerates. The pattern doesn't pick; the agent does.

## Connection lifetime and server co-location

The agent's WebSocket connection and the server's lifetime are separate
concerns, just as server lifetime and drain lifetime are kept separate in the
Monitor-based wire (see `lifecycle.md` §"Server lifetime vs. drain lifetime").

Preferred shape: start the server independently of the drain socket, then
connect the drain socket as a separate step. If the drain socket drops or
needs re-establishing, the server keeps serving and submissions keep landing
in state. The agent reconnects and drains the backlog.

Avoid the pattern where the server lifecycle is tied to the drain connection —
e.g., a server that exits when the last agent socket disconnects. That creates
a surface that goes offline whenever the drain needs re-arming.

## When to choose WebSocket over the HTTP wire

WebSocket adds bidirectional push at the cost of connection management
complexity. Choose it when:

- The task involves multiple rounds of agent response — a board game, a
  collaborative canvas, an interactive review flow — and polling would add
  visible latency to each round.
- The surface should update itself with agent-computed results without a page
  reload (the agent can push the update rather than the page polling for it).
- The environment supports persistent HTTP connections (loopback or a hosted
  environment with WebSocket support, such as Cloudflare Workers with the
  Hibernatable WebSockets API or Fly.io apps).

The HTTP+stdout wire is simpler and adequate for most one-shot approval gates
and form-submission surfaces. Reach for WebSocket when bidirectionality or
push-driven update is the point.

## Security notes

Security considerations from `security.md` apply here with one WebSocket-
specific addition: the `Origin` header on the WebSocket upgrade request should
be validated against the expected origin before completing the upgrade, for the
same reason as `Origin` validation on `POST /submit` in the hosted wire —
cross-origin script can initiate WebSocket connections. On a loopback server
the risk is low (only processes on the same machine can reach it); on a public
endpoint, origin validation is a meaningful gate.

For surfaces served over loopback, the same low-risk default posture applies
as the local HTTP wire. For publicly-reachable WebSocket endpoints, apply the
same provisioning-gate and session-ID-as-access-control logic as the hosted
wire.
